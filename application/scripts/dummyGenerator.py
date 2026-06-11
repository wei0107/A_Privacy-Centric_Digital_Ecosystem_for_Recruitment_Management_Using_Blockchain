"""
dummyGenerator.py (batch 版本)

功能：
- 產生大量 dummy 的求職者 / 公司職缺資料
- 用「批次」呼叫 qdrant_hr_api 的 /seekers/batch 與 /jobs/batch
- 讓 qdrant_hr_api 負責向量化 + 寫入 Qdrant
"""

import random
import time
from typing import List

import requests


# =========================
# 0. 參數設定
# =========================

BASE_URL = "http://127.0.0.1:8081"  # 你的 qdrant_hr_api FastAPI 服務
'''NUM_SEEKERS = 7000000
NUM_JOBS = 7000000'''
NUM_SEEKERS = 30
NUM_JOBS = 30

BATCH_SIZE_SEEKER = 1000
BATCH_SIZE_JOB = 1000

LOG_EVERY_BATCH = 20   # 每多少個 batch 印一次進度
TIMEOUT = 60           # HTTP timeout 秒數

ADDR_PREFIX_SEEKER = "0xFAKEADDR_SEEKER_"
ADDR_PREFIX_COMP = "0xFAKEADDR_COMP_"


# =========================
# 1. Dummy 資料池（你提供的）
# =========================

POSITIONS = [
    # 工程師 (Engineering)
    "Backend Engineer", "Frontend Engineer", "Fullstack Engineer",
    "DevOps Engineer", "Data Engineer", "Data Scientist",
    "ML Engineer", "AI Researcher", "Embedded Systems Engineer",
    "QA Engineer", "Security Engineer", "Cloud Architect",
    "Site Reliability Engineer (SRE)", "Mobile Developer (iOS/Android)",
    "Game Developer", "Blockchain Developer", "Smart Contract Engineer",

    # 設計 (Design)
    "UX/UI Designer", "Product Designer", "Visual Designer",
    "Interaction Designer", "Motion Graphics Designer",

    # 產品/專案 (Product/Project)
    "Product Manager", "Project Manager", "Scrum Master",
    "Technical Program Manager", "Business Analyst",

    # 行銷/銷售 (Marketing/Sales)
    "Digital Marketing Specialist", "Content Strategist", "SEO Specialist",
    "Sales Manager", "Business Development Representative (BDR)",
    "Customer Success Manager (CSM)",

    # 營運/行政 (Operations/Administration)
    "Operations Manager", "HR Specialist", "Recruiter",
    "Financial Analyst", "Executive Assistant",

    # 管理/高階 (Management/Executive)
    "CTO (Chief Technology Officer)", "Engineering Manager",
    "VP of Product", "CEO (Chief Executive Officer)",
]

LOCATIONS = [
    # 亞洲 (Asia)
    "Taipei, Taiwan", "Hsinchu, Taiwan", "Taichung, Taiwan", "Kaohsiung, Taiwan",
    "Tokyo, Japan", "Osaka, Japan", "Singapore, Singapore",
    "Seoul, South Korea", "Shanghai, China", "Hong Kong",
    "Bangkok, Thailand", "Kuala Lumpur, Malaysia", "Ho Chi Minh City, Vietnam",
    "Mumbai, India", "Dubai, UAE",

    # 北美 (North America)
    "San Francisco, USA", "New York, USA", "Seattle, USA",
    "Austin, USA", "Toronto, Canada", "Vancouver, Canada",

    # 歐洲 (Europe)
    "London, UK", "Berlin, Germany", "Paris, France",
    "Amsterdam, Netherlands", "Dublin, Ireland", "Zurich, Switzerland",
    "Barcelona, Spain",

    # 澳洲 (Oceania)
    "Sydney, Australia", "Melbourne, Australia",

    # 遠端 (Remote)
    "Remote (APAC)", "Remote (Global)",
]

SKILLS = [
    # 程式語言/框架 (Programming Languages/Frameworks)
    "Python", "JavaScript", "TypeScript", "Node.js", "Go", "Java", "C++",
    "C#", "Rust", "Swift", "Kotlin", "PHP", "Solidity",
    "React", "Vue.js", "Angular", "Next.js", "Django", "Spring Boot",
    "TensorFlow", "PyTorch",

    # 資料庫/雲端/DevOps (Database/Cloud/DevOps)
    "PostgreSQL", "MongoDB", "Redis", "MySQL", "AWS", "Azure",
    "Google Cloud Platform (GCP)", "Docker", "Kubernetes", "Terraform",
    "Ansible", "Linux", "Git/GitHub", "Jenkins/GitLab CI",

    # 設計/產品/分析 (Design/Product/Analysis)
    "Figma", "Sketch", "Adobe Creative Suite", "Wireframing",
    "User Research", "Agile/Scrum", "Jira/Confluence",
    "SQL (Data Analysis)", "R", "Tableau", "Power BI",
    "Google Analytics",

    # 行銷/管理 (Marketing/Management)
    "SEO/SEM", "Content Marketing", "Social Media Strategy",
    "Budget Management", "Negotiation", "Leadership", "Recruitment Strategy",
]

DEPARTMENTS = [
    "Engineering",
    "Data",
    "AI Lab",
    "Product",
    "Design",
    "Marketing",
    "Sales",
    "Operations",
    "HR",
    "Finance",
    "Executive",
]


# =========================
# 2. 幫忙產生隨機欄位
# =========================

def random_skills(min_k: int = 3, max_k: int = 8) -> List[str]:
    k = random.randint(min_k, max_k)
    return random.sample(SKILLS, k)


def gen_seeker_payload(i: int) -> dict:
    """
    產生符合 qdrant_hr_api.SeekerIn 的 payload：
    {
      "address": str,
      "position": str,
      "skills": [str],
      "location": str,
      "expectedSalary": int,
      "notes": str
    }
    """
    address = f"{ADDR_PREFIX_SEEKER}{i:07d}"
    position = random.choice(POSITIONS)
    skills = random_skills()
    location = random.choice(LOCATIONS)
    expected_salary = random.randrange(60000, 200000, 5000)

    notes = f"Open to {position} roles in {location}. Key skills: {', '.join(skills[:3])}."

    return {
        "address": address,
        "position": position,
        "skills": skills,
        "location": location,
        "expectedSalary": expected_salary,
        "notes": notes,
    }


def gen_job_payload(i: int) -> dict:
    """
    產生符合 qdrant_hr_api.JobIn 的 payload：
    {
      "jobId": str,          # ★ 新增
      "address": str,
      "companyId": str,
      "position": str,
      "department": str,
      "requirements": [str],
      "location": str,
      "salaryMin": int,
      "salaryMax": int,
      "notes": str
    }
    """
    # 模擬一個類似 Mongo ObjectId 的字串（24 位 hex）
    job_id = f"{i:024x}"

    address = f"{ADDR_PREFIX_COMP}{i:07d}"
    company_id = f"COMP_{i:06d}"
    position = random.choice(POSITIONS)
    department = random.choice(DEPARTMENTS)
    location = random.choice(LOCATIONS)
    requirements = random_skills()

    base = random.randrange(60000, 220000, 5000)
    salary_min = base
    salary_max = base + random.choice([10000, 20000, 30000, 40000])

    notes = (
        f"Hiring {position} in {location} ({department}). "
        f"Must have: {', '.join(requirements[:3])}."
    )

    return {
        "jobId": job_id,          # ★ 新增這行
        "address": address,
        "companyId": company_id,
        "position": position,
        "department": department,
        "requirements": requirements,
        "location": location,
        "salaryMin": salary_min,
        "salaryMax": salary_max,
        "notes": notes,
    }


# =========================
# 3. 呼叫 FastAPI 的 helper
# =========================

def post_json(path: str, payload: dict):
    url = f"{BASE_URL}{path}"
    resp = requests.post(url, json=payload, timeout=TIMEOUT)
    if resp.status_code != 200:
        raise RuntimeError(
            f"POST {path} failed: status={resp.status_code}, body={resp.text[:200]}"
        )
    return resp.json()


# =========================
# 4. 批次產生 & 寫入
# =========================

def generate_seekers_batch(n: int, batch_size: int):
    print(f"[SEEKERS] Start generating {n} seekers in batch_size={batch_size}...")
    start = time.time()
    num_batches = (n + batch_size - 1) // batch_size

    for b in range(num_batches):
        s = b * batch_size
        e = min(n, (b + 1) * batch_size)
        batch_items = [gen_seeker_payload(i) for i in range(s, e)]

        try:
            post_json("/seekers/batch", {"items": batch_items})
        except Exception as ex:
            print(f"[SEEKERS] Error on batch {b} ({s}..{e-1}): {ex}")

        if (b + 1) % LOG_EVERY_BATCH == 0 or (b + 1) == num_batches:
            elapsed = time.time() - start
            print(f"[SEEKERS] Batches {b+1}/{num_batches} done "
                  f"({e}/{n} records) in {elapsed:.1f}s")

    total_time = time.time() - start
    print(f"[SEEKERS] Done {n} seekers in {total_time:.1f}s")


def generate_jobs_batch(n: int, batch_size: int):
    print(f"[JOBS] Start generating {n} jobs in batch_size={batch_size}...")
    start = time.time()
    num_batches = (n + batch_size - 1) // batch_size

    for b in range(num_batches):
        s = b * batch_size
        e = min(n, (b + 1) * batch_size)
        batch_items = [gen_job_payload(i) for i in range(s, e)]

        try:
            post_json("/jobs/batch", {"items": batch_items})
        except Exception as ex:
            print(f"[JOBS] Error on batch {b} ({s}..{e-1}): {ex}")

        if (b + 1) % LOG_EVERY_BATCH == 0 or (b + 1) == num_batches:
            elapsed = time.time() - start
            print(f"[JOBS] Batches {b+1}/{num_batches} done "
                  f"({e}/{n} records) in {elapsed:.1f}s")

    total_time = time.time() - start
    print(f"[JOBS] Done {n} jobs in {total_time:.1f}s")


def main():
    # 建議先把 NUM_SEEKERS / NUM_JOBS 改成 1000 試跑
    generate_seekers_batch(NUM_SEEKERS, BATCH_SIZE_SEEKER)
    generate_jobs_batch(NUM_JOBS, BATCH_SIZE_JOB)
    print("[DONE] All dummy seekers & jobs sent to qdrant_hr_api (batch mode).")


if __name__ == "__main__":
    main()
