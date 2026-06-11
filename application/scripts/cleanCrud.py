# cleanup_qdrant_crud.py
from qdrant_client import QdrantClient, models

QDRANT_URL = "http://localhost:6333"
SEEKER_COLLECTION = "hr_seekers"
JOB_COLLECTION = "hr_jobs"

SEEKER_PREFIX = "0xQPS_CRUD_TEST_ADDR_SEEKER_"
JOB_PREFIX = "0xQPS_CRUD_TEST_ADDR_COMP_"

client = QdrantClient(url=QDRANT_URL)

def cleanup_collection(collection_name: str, prefix: str):
    print(f"[CLEAN] collection={collection_name}, prefix={prefix}")
    offset = None
    batch_ids = []

    total_found = 0
    total_deleted = 0

    while True:
        points, offset = client.scroll(
            collection_name=collection_name,
            limit=1000,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )

        if not points:
            break

        for p in points:
            payload = p.payload or {}
            addr = payload.get("address", "")
            if isinstance(addr, str) and addr.startswith(prefix):
                batch_ids.append(p.id)
                total_found += 1

                # 每 5000 筆刪一次，避免一次太大
                if len(batch_ids) >= 5000:
                    client.delete(
                        collection_name=collection_name,
                        points_selector=models.PointIdsList(points=batch_ids),
                        wait=True,
                    )
                    total_deleted += len(batch_ids)
                    print(f"  deleted {total_deleted} so far...")
                    batch_ids = []

        if offset is None:
            break

    # 把最後零頭刪掉
    if batch_ids:
        client.delete(
            collection_name=collection_name,
            points_selector=models.PointIdsList(points=batch_ids),
            wait=True,
        )
        total_deleted += len(batch_ids)

    print(f"[DONE] found={total_found}, deleted={total_deleted}")


if __name__ == "__main__":
    cleanup_collection(SEEKER_COLLECTION, SEEKER_PREFIX)
    cleanup_collection(JOB_COLLECTION, JOB_PREFIX)