"""
HR Match Service (On-Demand)

這支服務負責「配對」：
- 給一個求職者 → 找出最適合的職缺 (jobs-for-seeker)
- 給一個職缺   → 找出最適合的求職者 (seekers-for-job)

它只讀取 Qdrant 裡的向量與 payload，不會改動資料。
向量與 payload 的寫入，交給 qdrantService.py 負責。

約定（要和 qdrantService 保持一致）：
- Seeker:
    Qdrant point.id = hash(address)  (addr_to_point_id)
    payload 內至少包含：
        - address: str
        - position: str
        - skills: List[str]
        - location: str
        - expectedSalary: Optional[int]

- Job:
    Qdrant point.id = hash(jobId)    (job_id_to_point_id)
    payload 內至少包含：
        - jobId: str
        - address: 公司錢包位址
        - companyId: str
        - position: str
        - department: str
        - location: str
        - salaryMin / salaryMax: int
"""

from typing import List, Optional

import hashlib
import random

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient
from qdrant_client import models

# =========================
# 0. 基本設定
# =========================

QDRANT_URL = "http://localhost:6333"
SEEKER_COLLECTION = "hr_seekers"
JOB_COLLECTION = "hr_jobs"

app = FastAPI(title="HR Match Service (On-Demand)")


# =========================
# 1. Qdrant 初始化 + 工具函式
# =========================

qdrant_client = QdrantClient(
    url=QDRANT_URL,
    timeout=60.0,
)


def addr_to_point_id(address: str) -> int:
    """
    把任意字串 address 轉成 Qdrant 可接受的「非負整數」 id。
    用 SHA256 前 8 bytes 轉成 64-bit unsigned int，碰撞機率極低。
    """
    h = hashlib.sha256(address.encode("utf-8")).digest()
    return int.from_bytes(h[:8], byteorder="big", signed=False)


def job_id_to_point_id(job_id: str) -> int:
    """
    給純 jobId 用的 point id 計算：
    - 要和 qdrantService.job_to_point_id(job) 在 job.jobId 存在時的行為一致：
        使用 job.jobId 當 key，SHA256 前 8 bytes 變成 uint64。
    """
    h = hashlib.sha256(job_id.encode("utf-8")).digest()
    return int.from_bytes(h[:8], byteorder="big", signed=False)


def get_seeker_vector_by_address(address: str) -> List[float]:
    """
    從 hr_seekers 讀出某個 address 對應的向量。
    - address -> point_id (hash)
    - retrieve(with_vectors=True)
    """
    point_id = addr_to_point_id(address)

    points = qdrant_client.retrieve(
        collection_name=SEEKER_COLLECTION,
        ids=[point_id],
        with_payload=False,
        with_vectors=True,
    )

    if not points:
        raise HTTPException(
            status_code=404,
            detail=f"Seeker address '{address}' not found in Qdrant (id={point_id})",
        )

    vec = points[0].vector
    if vec is None:
        raise HTTPException(
            status_code=500,
            detail=f"Seeker address '{address}' has no stored vector in Qdrant",
        )
    return vec


def get_job_vector_by_job_id(job_id: str) -> List[float]:
    """
    從 hr_jobs 讀出某個 jobId 對應的向量。
    - jobId -> point_id (hash)
    - retrieve(with_vectors=True)
    """
    point_id = job_id_to_point_id(job_id)

    points = qdrant_client.retrieve(
        collection_name=JOB_COLLECTION,
        ids=[point_id],
        with_payload=False,
        with_vectors=True,
    )

    if not points:
        raise HTTPException(
            status_code=404,
            detail=(
                f"JobId '{job_id}' not found in collection '{JOB_COLLECTION}' "
                f"(Qdrant id={point_id})"
            ),
        )

    vec = points[0].vector
    if vec is None:
        raise HTTPException(
            status_code=500,
            detail=f"JobId '{job_id}' has no stored vector in Qdrant",
        )
    return vec


# =========================
# 2. Pydantic models（對外輸出）
# =========================

class JobMatch(BaseModel):
    jobId: str = Field(..., description="職缺的 jobId（Mongo CompanyRequest._id / payload.jobId）")
    companyAddress: Optional[str] = Field(
        None, description="公司的錢包 address（payload 裡的 address）"
    )
    score: float = Field(..., description="相似度（越高越好）")
    position: Optional[str] = None
    location: Optional[str] = None
    companyId: Optional[str] = None
    department: Optional[str] = None
    notes: Optional[str] = None


class SeekerMatch(BaseModel):
    seekerAddress: str = Field(..., description="求職者的錢包 address（payload 裡的 address）")
    score: float = Field(..., description="相似度（越高越好）")
    position: Optional[str] = None
    location: Optional[str] = None
    expectedSalary: Optional[int] = None
    notes: Optional[str] = None


class JobMatchResponse(BaseModel):
    seekerAddress: str
    topK: int
    matches: List[JobMatch]


class SeekerMatchResponse(BaseModel):
    jobId: str
    topK: int
    matches: List[SeekerMatch]


# =========================
# 3. Match API
# =========================

@app.get(
    "/match/jobs-for-seeker/{seeker_address}",
    response_model=JobMatchResponse,
    summary="給一個求職者，找出最適合的職缺",
)
def match_jobs_for_seeker(
    seeker_address: str,
    top_k: int = Query(30, ge=1, le=200, description="要取回幾個職缺（預設 30）"),
):
    """
    用單一求職者（address）做 query：
    1. 先從 hr_seekers 取出向量
    2. 再到 hr_jobs query_points，找出最接近的 top_k 個職缺
    3. 回傳簡化後的職缺資訊（職缺 jobId、公司 address、position、location...）
    """
    # 1) 取 seeker 向量
    seeker_vec = get_seeker_vector_by_address(seeker_address)

    # 2) 求職者 → 職缺：向量查詢
    hits = qdrant_client.query_points(
        collection_name=JOB_COLLECTION,
        query=seeker_vec,
        limit=top_k,
        with_payload=True,
        search_params=models.SearchParams(
            indexed_only=True
        ),
    ).points

    matches: List[JobMatch] = []
    for h in hits:
        payload = h.payload or {}

        job_id = payload.get("jobId")
        if job_id is None:
            # 安全起見，若缺 jobId 就略過這筆
            continue

        m = JobMatch(
            jobId=job_id,
            companyAddress=payload.get("address"),
            score=h.score or 0.0,
            position=payload.get("position"),
            location=payload.get("location"),
            companyId=payload.get("companyId"),
            department=payload.get("department"),
            notes=payload.get("notes"),
        )
        matches.append(m)

    return JobMatchResponse(
        seekerAddress=seeker_address,
        topK=top_k,
        matches=matches,
    )


@app.get(
    "/match/seekers-for-job/{job_id}",
    response_model=SeekerMatchResponse,
    summary="給一個職缺，找出最適合的求職者",
)
def match_seekers_for_job(
    job_id: str,
    top_k: int = Query(30, ge=1, le=200, description="要取回幾個求職者（預設 30）"),
):
    """
    用單一職缺（jobId）做 query：
    1. 先從 hr_jobs 取出向量
    2. 再到 hr_seekers query_points，找出最接近的 top_k 個求職者
    3. 回傳簡化後的求職者資訊
    """
    # 1) 取 job 向量

    job_vec = get_job_vector_by_job_id(job_id)

    # 2) 職缺 → 求職者：向量查詢
    hits = qdrant_client.query_points(
        collection_name=SEEKER_COLLECTION,
        query=job_vec,
        limit=top_k,
        with_payload=True,
        search_params=models.SearchParams(
            indexed_only=True
        ),
    ).points

    matches: List[SeekerMatch] = []
    for h in hits:
        payload = h.payload or {}

        addr = payload.get("address")
        if addr is None:
            # address 是你業務主鍵之一，缺就略過
            continue

        m = SeekerMatch(
            seekerAddress=addr,
            score=h.score or 0.0,
            position=payload.get("position"),
            location=payload.get("location"),
            expectedSalary=payload.get("expectedSalary"),
            notes=payload.get("notes"),
        )
        matches.append(m)

    return SeekerMatchResponse(
        jobId=job_id,
        topK=top_k,
        matches=matches,
    )


# =========================
# 4. Debug / Demo：隨機抽一個人 + 一個職缺，顯示雙向匹配
# =========================
@app.get("/match/preview")
def preview_match(top_k: int = 5):
    """
    預覽固定一個 seeker + 固定一個 job 的雙向匹配結果。

    seeker_address = 0xFAKEADDR_SEEKER_0894778
    jobId          = 00000000000000000035e6f0

    job → seekers 若超過 3 秒會自動停止，避免卡住整個 API。
    """

    TARGET_SEEKER_ADDR = "0x75c4fb2e81a6d3420125f5145182f528d1699146"
    TARGET_JOB_ID = "6953bc9d916a7af279090759"

    # -----------------------------
    # A. 求職者本身
    # -----------------------------
    seeker_point_id = addr_to_point_id(TARGET_SEEKER_ADDR)
    seeker_records = qdrant_client.retrieve(
        collection_name=SEEKER_COLLECTION,
        ids=[seeker_point_id],
        with_vectors=True,
        with_payload=True,
    )
    if not seeker_records:
        return {
            "error": f"[Seeker] 找不到 seeker={TARGET_SEEKER_ADDR} (id={seeker_point_id})"
        }

    seeker_rec = seeker_records[0]
    seeker_vec = seeker_rec.vector
    seeker_payload = seeker_rec.payload or {}

    # -----------------------------
    # B. 求職者 → 職缺
    # -----------------------------
    seeker_to_jobs_hits = qdrant_client.query_points(
        collection_name=JOB_COLLECTION,
        query=seeker_vec,
        limit=top_k,
        with_payload=True,
        search_params=models.SearchParams(
            indexed_only=True
        ),
    ).points

    def simplify(hit):
        return {
            "id": hit.id,
            "score": hit.score,
            "payload": hit.payload,
        }

    seeker_to_jobs = [simplify(h) for h in seeker_to_jobs_hits]

    # -----------------------------
    # C. 職缺本身
    # -----------------------------
    job_point_id = job_id_to_point_id(TARGET_JOB_ID)
    job_records = qdrant_client.retrieve(
        collection_name=JOB_COLLECTION,
        ids=[job_point_id],
        with_vectors=True,
        with_payload=True,
    )
    if not job_records:
        return {
            "error": f"[Job] 找不到 jobId={TARGET_JOB_ID} (id={job_point_id})"
        }

    job_rec = job_records[0]
    job_vec = job_rec.vector
    job_payload = job_rec.payload or {}

    # -----------------------------
    # D. 職缺 → 求職者（加速器：timeout-safe）
    # -----------------------------
    import time
    start_t = time.time()
    SEEK_TIMEOUT = 3   # 最多等 3 秒（避免整個 API 卡 60 秒）

    job_to_seekers = []
    timeout_flag = False

    try:
        hits = qdrant_client.query_points(
            collection_name=SEEKER_COLLECTION,
            query=job_vec,
            limit=top_k,
            with_payload=True,
            search_params=models.SearchParams(
                indexed_only=True
            ),
        ).points
        job_to_seekers = [simplify(h) for h in hits]

        # 強制限制 job → seekers 查詢時間
        if time.time() - start_t > SEEK_TIMEOUT:
            timeout_flag = True
            job_to_seekers = []

    except Exception as e:
        timeout_flag = True
        job_to_seekers = []
        print("[job->seekers] exception:", repr(e))

    # -----------------------------
    # 結果回傳
    # -----------------------------
    return {
        "seeker_self": {
            "address": TARGET_SEEKER_ADDR,
            "payload": seeker_payload,
        },
        "job_self": {
            "jobId": TARGET_JOB_ID,
            "payload": job_payload,
        },
        "seeker_to_jobs": seeker_to_jobs,
        "job_to_seekers": {
            "timeout": timeout_flag,
            "matches": job_to_seekers,
        },
    }

# =========================
# 5. 直接當 script 跑（本地 debug 用）
# =========================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("matchService:app", host="0.0.0.0", port=8082, reload=True)
