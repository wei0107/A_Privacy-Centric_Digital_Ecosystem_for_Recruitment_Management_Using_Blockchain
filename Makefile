.PHONY: frontend backend db ipfs ganache truffle fablo-up fablo-down fablo-prune all

frontend-install:
	cd frontend && npm install

backend-install:
	cd application && npm install

# === Frontend ===
frontend:
	cd frontend && npm run dev

# === Backend ===
backend:
	cd application && npm start

# === MongoDB ===
db:
	mongod --dbpath application/DB-data/DB

# === IPFS ===
ipfs:
	ipfs daemon

# === Ganache (DID-chain) ===
ganache:
	cd did-chain && ganache -s 0 --gasPrice 0 --blockTime 0.5 --accounts 10

# === Truffle migrate (DID-chain) ===
truffle:
	cd did-chain && truffle migrate

# === Hyperledger Fabric (App-chain) ===
fablo-up:
	cd app-chain && ./fablo up

fablo-down:
	cd app-chain && ./fablo down

fablo-prune:
	cd app-chain && ./fablo prune

# === All together ===
all: backend frontend db ipfs ganache truffle fablo-up

# === Python Env Setting ===
qdrant-venv:
	cd application && \
	if [ ! -d "venv" ]; then \
		python3 -m venv venv; \
	fi && \
	venv/bin/pip install --upgrade pip && \
	venv/bin/pip install -r requirements.txt

# === Python services ===
match-service:
	cd application && venv/bin/python services/matchService.py

dummy-generator:
	cd application && venv/bin/python scripts/dummyGenerator.py

qdrant-service:
	cd application && venv/bin/python -m uvicorn services.qdrantService:app --reload --port 8081

# === Qdrant Docker ===
QDRANT_DATA_DIR := $(CURDIR)/qdrant

qdrant:
	-docker stop qdrant qdrant-gpu
	-docker rm qdrant qdrant-gpu
	mkdir -p $(QDRANT_DATA_DIR)
	docker run -d \
		-p 6333:6333 \
		-p 6334:6334 \
		-v $(QDRANT_DATA_DIR):/qdrant/storage \
		--name qdrant \
		qdrant/qdrant:latest

qdrant-gpu:
	-docker stop qdrant qdrant-gpu
	-docker rm qdrant qdrant-gpu
	mkdir -p $(QDRANT_DATA_DIR)
	docker run -d \
		-p 6333:6333 \
		-p 6334:6334 \
		--gpus all \
		-v $(QDRANT_DATA_DIR):/qdrant/storage \
		--name qdrant-gpu \
		qdrant/qdrant:latest

qdrant-stop:
	-docker stop qdrant qdrant-gpu

qdrant-remove:
	-docker rm qdrant qdrant-gpu

qdrant-restart:
	-docker restart qdrant || docker restart qdrant-gpu

qdrant-logs:
	-docker logs -f qdrant || docker logs -f qdrant-gpu