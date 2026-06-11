"""
qdrant_hr_api.py

FastAPI 服務：
- 幫 HR 系統處理 Qdrant 的 CRUD + 向量化
- 使用 all-MiniLM-L6-v2 產生向量
- 支援兩個 collection：
    - hr_seekers: 求職者向量（position + skills + location）
    - hr_jobs   : 公司職缺向量（position + requirements + location）

這個 service 只負責：
- 接收 JSON（seeker / job）
- 建立 / 更新 Qdrant 中的點（vector + payload）
- 查詢 / 刪除 Qdrant 中的點

不負責：
- MongoDB 存取
- 匹配（matching）
- Hyperledger / Ethereum 等邏輯
"""

from typing import List, Optional
import hashlib  # 用來把 address / jobId 轉成整數 id

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from qdrant_client import QdrantClient, models
from qdrant_client.models import PointStruct

from sentence_transformers import SentenceTransformer


# =========================
# 0. 基本設定
# =========================

QDRANT_URL = "http://localhost:6333"
SEEKER_COLLECTION = "hr_seekers"
JOB_COLLECTION = "hr_jobs"

app = FastAPI(title="HR Qdrant Vector API")


# =========================
# 1. 初始化：Qdrant & Encoder
# =========================

qdrant_client = QdrantClient(url=QDRANT_URL)

# 若環境有 CUDA，這行會用 GPU；沒有 CUDA 的環境會報錯，改成不指定 device 就好
encoder = SentenceTransformer("all-MiniLM-L6-v2", device="cuda")
# encoder = SentenceTransformer("all-MiniLM-L6-v2")  # 如果沒有 CUDA GPU 就用這行
EMBED_DIM = encoder.get_sentence_embedding_dimension()
print(f"[INFO] Encoder loaded. Embedding dim = {EMBED_DIM}")


def addr_to_point_id(address: str) -> int:
    """
    把任意字串 address 轉成 Qdrant 可接受的「非負整數」 id。
    用 SHA256 前 8 bytes 轉成 64-bit unsigned int，碰撞機率極低。
    """
    h = hashlib.sha256(address.encode("utf-8")).digest()
    return int.from_bytes(h[:8], byteorder="big", signed=False)


def job_to_point_id(job: "JobIn") -> int:
    """
    根據 job 建立 Qdrant 的 point id：

    - 若 job.jobId 存在（例如 MongoDB ObjectId 的 24 位 hex 字串）：
        使用 job.jobId 做為 key，透過 SHA256 前 8 bytes 轉成 64-bit unsigned int。
        這樣同一個 job 在不同地方都會得到相同的 point id。
    - 若 job.jobId 不存在（例如 dummyGenerator 產的假資料）：
        fallback 使用 job.address 來產生 id（與原本行為相同）。

    注意：這裡的 id 只用在 Qdrant 裡當作技術用 primary key，
    真正業務上的主鍵仍然是 MongoDB 的 _id 或你的 jobId 欄位。
    """
    # 這裡刻意不用 int(job.jobId, 16)，避免 24-hex 轉成超過 64-bit 的整數。
    if getattr(job, "jobId", None):
        key = job.jobId
    else:
        key = job.address
    h = hashlib.sha256(key.encode("utf-8")).digest()
    return int.from_bytes(h[:8], byteorder="big", signed=False)

def job_id_to_point_id(job_id: str) -> int:
    """
    給純 jobId 用的 point id 計算：
    要跟 job_to_point_id(job) 在 job.jobId 存在時的行為一致
    """
    h = hashlib.sha256(job_id.encode("utf-8")).digest()
    return int.from_bytes(h[:8], byteorder="big", signed=False)


def ensure_collections():
    """
    確認 hr_seekers / hr_jobs 存在，不存在就建立。
    不會刪資料，只在 collection 不存在時建立。
    """
    existing = {c.name for c in qdrant_client.get_collections().collections}

    if SEEKER_COLLECTION not in existing:
        qdrant_client.create_collection(
            collection_name=SEEKER_COLLECTION,
            vectors_config=models.VectorParams(
                size=EMBED_DIM,
                distance=models.Distance.COSINE,
            ),
            optimizers_config=models.OptimizersConfigDiff(
                memmap_threshold=20_000,
            ),
            hnsw_config=models.HnswConfigDiff(
                m=16,
                ef_construct=128,
                on_disk=True,
            ),
        )
        print(f"[INFO] Created collection '{SEEKER_COLLECTION}'")

    if JOB_COLLECTION not in existing:
        qdrant_client.create_collection(
            collection_name=JOB_COLLECTION,
            vectors_config=models.VectorParams(
                size=EMBED_DIM,
                distance=models.Distance.COSINE,
            ),
            optimizers_config=models.OptimizersConfigDiff(
                memmap_threshold=20_000,
            ),
            hnsw_config=models.HnswConfigDiff(
                m=16,
                ef_construct=128,
                on_disk=True,
            ),
        )
        print(f"[INFO] Created collection '{JOB_COLLECTION}'")

def enable_demo_mode():
    """
    不刪現有資料，直接更新既有 collection 的 optimizer 設定。
    目標：
    - 小量新寫入先不要影響查詢
    - 查詢主要走既有已建好的索引
    """
    demo_optimizers = models.OptimizersConfigDiff(
        indexing_threshold=100_000,
        #prevent_unoptimized=True,
    )

    qdrant_client.update_collection(
        collection_name=SEEKER_COLLECTION,
        optimizers_config=demo_optimizers,
    )

    qdrant_client.update_collection(
        collection_name=JOB_COLLECTION,
        optimizers_config=demo_optimizers,
    )

    print("[INFO] Demo mode enabled: indexing_threshold=100000")

@app.on_event("startup")
def on_startup():
    print("[INFO] FastAPI startup: ensure Qdrant collections...")
    ensure_collections()

    print("[INFO] Enabling Qdrant demo mode...")
    enable_demo_mode()

    print("[INFO] Startup done.")


# =========================
# 2. Pydantic models
# =========================

# ---- Seeker ----
class SeekerIn(BaseModel):
    """
    對應 JobSeekerRequest 會用到的欄位（簡化版）：
    - address: 實際是 Mongo 的 primary id
      在 Qdrant 內部會轉成整數 point id，address 會放在 payload 裡。
    """
    address: str = Field(..., description="錢包 address，做為業務 id（Qdrant 會轉成整數）")
    position: str
    skills: List[str]
    location: str
    expectedSalary: Optional[int] = None
    notes: Optional[str] = None


class SeekerOut(SeekerIn):
    """目前就把 payload 原樣回傳，多一點彈性。"""
    pass


# ---- Job ----
class JobIn(BaseModel):
    """
    對應 CompanyRequest 的主要欄位（簡化版）：
    - address: 公司錢包地址，實際當作業務 id（Qdrant 會轉成整數 point id）
    """
    address: str = Field(..., description="公司錢包 address（Qdrant 會轉成整數 id）")
    companyId: str
    jobId: Optional[str] = Field(
        None,
        description="MongoDB 的 job _id（24 位 hex 字串），如果有的話會一併存進 payload，用來回推 Mongo 資料"
    )
    position: str
    department: Optional[str] = None
    requirements: List[str]
    location: str
    salaryMin: Optional[int] = None
    salaryMax: Optional[int] = None
    notes: Optional[str] = None


class JobOut(JobIn):
    pass


# =========================
# 3. 文字建構（給 encoder 用）
# =========================

def build_seeker_text(seeker: SeekerIn) -> str:
    """
    求職者向量 = position + skills + location
    """
    parts = [
        seeker.position,
        seeker.location,
        "Skills: " + ", ".join(seeker.skills),
    ]
    return " ".join(p for p in parts if p)


def build_job_text(job: JobIn) -> str:
    """
    公司職缺向量 = position + requirements + location
    """
    parts = [
        job.position,
        job.location,
        "Requirements: " + ", ".join(job.requirements),
    ]
    return " ".join(p for p in parts if p)


# =========================
# 4. Seeker CRUD
# =========================

@app.post("/seekers", response_model=SeekerOut)
def create_or_update_seeker(seeker: SeekerIn):
    """
    Create/Update Seeker：
    - 向量化 seeker
    - upsert 到 hr_seekers
        - Qdrant point.id = addr_to_point_id(seeker.address)（整數）
        - payload = seeker 的原始資料（含 address）
    """
    text = build_seeker_text(seeker)
    vec = encoder.encode(text, normalize_embeddings=True).tolist()

    payload = seeker.dict()
    point_id = addr_to_point_id(seeker.address)

    op = qdrant_client.upsert(
        collection_name=SEEKER_COLLECTION,
        points=[
            PointStruct(
                id=point_id,
                vector=vec,
                payload=payload,
            )
        ],
        wait=True,
    )

    if op.status != "completed":
        raise HTTPException(status_code=500, detail=f"Qdrant upsert failed: {op.status}")

    return seeker


@app.get("/seekers/{address}", response_model=SeekerOut)
def get_seeker(address: str):
    """
    讀取 Qdrant 中該 address 的 seeker payload。
    address -> 轉成整數 point id -> retrieve。
    """
    point_id = addr_to_point_id(address)

    res = qdrant_client.retrieve(
        collection_name=SEEKER_COLLECTION,
        ids=[point_id],
        with_payload=True,
    )

    if not res:
        raise HTTPException(status_code=404, detail="Seeker not found in Qdrant")

    payload = res[0].payload or {}
    try:
        return SeekerOut(**payload)
    except Exception:
        # 如果 payload 結構改過，這裡可能會失敗，可以視情況放寬
        raise HTTPException(status_code=500, detail="Stored payload format mismatch for seeker")


@app.delete("/seekers/{address}")
def delete_seeker(address: str):
    """
    刪除 Qdrant 中的 seeker 向量 + payload。
    address -> 轉成整數 point id -> delete。
    """
    point_id = addr_to_point_id(address)

    qdrant_client.delete(
        collection_name=SEEKER_COLLECTION,
        points_selector=models.PointIdsList(
            points=[point_id],
        ),
        wait=True,
    )
    return {"status": "deleted", "address": address}


# =========================
# 5. Job CRUD
# =========================

@app.post("/jobs", response_model=JobOut)
def create_or_update_job(job: JobIn):
    """
    Create/Update Job：
    - 向量化 job
    - upsert 到 hr_jobs
        - Qdrant point.id = job_to_point_id(job)
        - payload = job 的原始資料（含 address / jobId 等）
    """
    text = build_job_text(job)
    vec = encoder.encode(text, normalize_embeddings=True).tolist()

    payload = job.dict()
    point_id = job_to_point_id(job)

    op = qdrant_client.upsert(
        collection_name=JOB_COLLECTION,
        points=[
            PointStruct(
                id=point_id,
                vector=vec,
                payload=payload,
            )
        ],
        wait=True,
    )

    if op.status != "completed":
        raise HTTPException(status_code=500, detail=f"Qdrant upsert failed: {op.status}")

    return job

@app.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str):
    """
    透過 jobId 查 job：
    - point.id = hash(jobId)
    - payload 裡包含 jobId / address / 其他欄位
    """
    point_id = job_id_to_point_id(job_id)

    points = qdrant_client.retrieve(
        collection_name=JOB_COLLECTION,
        ids=[point_id],
        with_payload=True,
    )

    if not points:
        raise HTTPException(status_code=404, detail=f"Job not found for jobId={job_id}")

    payload = points[0].payload or {}
    try:
        return JobOut(**payload)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Invalid payload for jobId={job_id}: {e}",
        )


@app.delete("/jobs/{job_id}")
def delete_job(job_id: str):
    """
    用 jobId 刪除 Qdrant 裡的 job 資料。
    point_id = hash(jobId)
    """
    point_id = job_id_to_point_id(job_id)

    qdrant_client.delete(
        collection_name=JOB_COLLECTION,
        points_selector=models.PointIdsList(points=[point_id]),
        wait=True,
    )
    return {"status": "deleted", "jobId": job_id}


# =========================
# 6. Batch APIs
# =========================

class SeekerBatchIn(BaseModel):
    items: List[SeekerIn]


class JobBatchIn(BaseModel):
    items: List[JobIn]


@app.post("/seekers/batch")
def create_or_update_seekers_batch(batch: SeekerBatchIn):
    """
    批次建立/更新 seekers：
    - 一次向量化多個 seeker
    - 一次 upsert 多個 points 到 hr_seekers
    """
    seekers = batch.items
    if not seekers:
        return {"count": 0, "status": "empty"}

    # 1) 批次組文字
    texts = [build_seeker_text(s) for s in seekers]

    # 2) 批次 encode（GPU/CPU 都支援）
    vecs = encoder.encode(texts, normalize_embeddings=True).tolist()

    # 3) 組 PointStruct list
    points = []
    for seeker, vec in zip(seekers, vecs):
        payload = seeker.dict()
        point_id = addr_to_point_id(seeker.address)
        points.append(
            PointStruct(
                id=point_id,
                vector=vec,
                payload=payload,
            )
        )

    op = qdrant_client.upsert(
        collection_name=SEEKER_COLLECTION,
        points=points,
        wait=True,
    )

    return {"count": len(points), "status": op.status}


@app.post("/jobs/batch")
def create_or_update_jobs_batch(batch: JobBatchIn):
    """
    批次建立/更新 jobs：
    - 一次向量化多個 job
    - 一次 upsert 多個 points 到 hr_jobs
    """
    jobs = batch.items
    if not jobs:
        return {"count": 0, "status": "empty"}

    # 1) 批次組文字
    texts = [build_job_text(j) for j in jobs]

    # 2) 批次 encode
    vecs = encoder.encode(texts, normalize_embeddings=True).tolist()

    # 3) 組 PointStruct list
    points = []
    for job, vec in zip(jobs, vecs):
        payload = job.dict()
        point_id = job_to_point_id(job)
        points.append(
            PointStruct(
                id=point_id,
                vector=vec,
                payload=payload,
            )
        )

    op = qdrant_client.upsert(
        collection_name=JOB_COLLECTION,
        points=points,
        wait=True,
    )

    return {"count": len(points), "status": op.status}
