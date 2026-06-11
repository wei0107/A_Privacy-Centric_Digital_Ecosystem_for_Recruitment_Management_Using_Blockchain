# Privacy-Centric Recruitment Management System Using Blockchain

This repository contains a research prototype of a privacy-centric digital ecosystem for recruitment management using blockchain technologies.

The system integrates decentralized identity management, privacy-preserving profile and resume management, verifiable recruitment records, semantic matchmaking, and arbitration support. It was developed as a master's thesis prototype and is intended for research, demonstration, and reference purposes.

> **Note:** This project is a research prototype. Some components require manual setup and local services before the full system can run correctly.

---

## System Components

The system consists of the following major components:

| Component      | Description                                                                    |
| -------------- | ------------------------------------------------------------------------------ |
| `did-chain/`   | Ethereum smart contracts for DID registration and identity management          |
| `app-chain/`   | Hyperledger Fabric chaincodes for access control and recruitment records       |
| `application/` | Backend server, controllers, services, database models, and Python services    |
| `frontend/`    | React + Vite frontend interface                                                |
| `test/`        | Testing and evaluation scripts for gas fee, matching, and on-chain performance |
| `Makefile`     | Helper commands for starting services and installing dependencies              |

---

## Repository Structure

```text
A_Privacy-Centric_Digital_Ecosystem_for_Recruitment_Management_Using_Blockchain/
├── app-chain/                  # Hyperledger Fabric / Fablo configuration and chaincodes
│   ├── chaincodes/
│   │   ├── enterprise_access_control/
│   │   ├── government_management/
│   │   └── person_access_control/
│   ├── fablo
│   └── fablo-config.json
├── application/                # Backend application
│   ├── controllers/
│   ├── DB-data/
│   ├── routes/
│   ├── scripts/
│   ├── services/
│   ├── views/
│   ├── app.js
│   └── package.json
├── did-chain/                  # Ethereum DID smart contracts
│   ├── contracts/
│   ├── migrations/
│   └── truffle-config.js
├── frontend/                   # React frontend
│   ├── src/
│   ├── public/
│   ├── vite.config.js
│   └── package.json
├── test/                       # Evaluation and testing scripts
├── Makefile
└── README.md
```

---

## Recommended Environment and Prerequisites

### Tested Environment

This project was tested under the following environment:

```text
OS: Ubuntu 24.04.3 LTS
Kernel: Linux 6.14.0-33-generic
Desktop Environment: GNOME 46.0
Node.js: v18.20.8
```

Other Linux-based environments may also work, but additional configuration may be required.

### Required Tools

Please install the following tools before running the system:

* Node.js >= 18 and npm
* Python 3, `venv`, and `pip`
* MongoDB
* IPFS Kubo
* Ganache CLI
* Truffle
* Docker
* Hyperledger Fabric dependencies required by [Fablo](https://github.com/hyperledger-labs/fablo)

You can verify the installed versions with:

```bash
node -v
npm -v
python3 --version
docker --version
mongod --version
ipfs --version
ganache --version
truffle version
```

### Basic Ubuntu Dependencies

For Ubuntu-based systems, install the basic required packages with:

```bash
sudo apt update
sudo apt install -y make git curl python3 python3-venv python3-pip
```

### Ganache and Truffle

Ganache CLI and Truffle can be installed globally with npm:

```bash
npm install -g ganache truffle
```

After installation, verify that both tools are available:

```bash
ganache --version
truffle version
```

---

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd A_Privacy-Centric_Digital_Ecosystem_for_Recruitment_Management_Using_Blockchain
```

### 2. Install backend dependencies

```bash
make backend-install
```

### 3. Install frontend dependencies

```bash
make frontend-install
```

### 4. Install Python dependencies

The backend uses Python services for Qdrant and semantic matching.

```bash
make qdrant-venv
```

This command creates a virtual environment under:

```text
application/venv/
```

and installs dependencies from:

```text
application/requirements.txt
```

---

## Configuration

### X25519 Key File

The system uses an X25519 key pair for encryption-related operations.

A testing key file may be provided for local development. For production or real deployment, do not use the example private key.

Recommended setup:

```bash
cp application/secrets/org_x25519_keys.example.json application/secrets/org_x25519_keys.json
```

Example warning inside the key file:

```json
{
  "x25519_pubkey_base64": "your_public_key_here",
  "x25519_privkey_base64": "your_private_key_here"
}
```

> Do not upload real private keys to a public repository.

> Example secret files are included under `application/secrets/` for local testing convenience. For real deployment, replace them with your own keys and add `application/secrets/` to `.gitignore` to avoid committing sensitive data.

---

## Running the System

This project consists of multiple services. Each service should be started in a separate terminal.

Recommended startup order:

1. MongoDB
2. IPFS
3. Ganache
4. DID smart contract deployment
5. Hyperledger Fabric network
6. Qdrant
7. Qdrant Python service
8. Matching service
9. Backend server
10. Frontend

---

### 1. Start MongoDB

Create the database directory if it does not exist:

```bash
mkdir -p application/DB-data/DB
```

Start MongoDB:

```bash
make db
```

---

### 2. Start IPFS

For the first time only:

```bash
ipfs init
```

Start the IPFS daemon:

```bash
make ipfs
```

---

### 3. Start Ganache for the DID Chain

```bash
make ganache
```

This starts a local Ethereum blockchain for the DID smart contracts.

---

### 4. Deploy DID Smart Contracts

After Ganache is running, deploy the DID contracts:

```bash
make truffle
```

If contract addresses are required by the backend or frontend, update the corresponding configuration files after deployment.

---

### 5. Start the Hyperledger Fabric Network

The HR Trust Chain is managed by Fablo.

```bash
make fablo-up
```

To stop the network:

```bash
make fablo-down
```

To remove the network and related resources:

```bash
make fablo-prune
```

---

### 6. Start Qdrant

The default Qdrant service runs with Docker:

```bash
make qdrant
```

This stores Qdrant data under:

```text
qdrant/
```

To stop Qdrant:

```bash
make qdrant-stop
```

To remove the Qdrant container:

```bash
make qdrant-remove
```

To view logs:

```bash
make qdrant-logs
```

Optional GPU mode:

```bash
make qdrant-gpu
```

> GPU mode requires NVIDIA GPU support and Docker GPU runtime.

---

### 7. Start the Qdrant Python Service

```bash
make qdrant-service
```

By default, this starts the service on port `8081`.

Before running this service, make sure the Python virtual environment has been created:

```bash
make qdrant-venv
```

---

### 8. Start the Matching Service

The matching service is used for semantic job/candidate matching.

```bash
make match-service
```

Before running this service, make sure the Python virtual environment has been created:

```bash
make qdrant-venv
```

If semantic embedding models are used, additional machine learning dependencies such as `sentence-transformers` may be required.

---

### 9. Start the Backend Server

```bash
make backend
```

The backend is located under:

```text
application/
```

---

### 10. Start the Frontend

```bash
make frontend
```

The frontend is located under:

```text
frontend/
```

The Vite development server usually runs at:

```text
http://localhost:5173
```

---

## Useful Makefile Commands

| Command                 | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `make frontend-install` | Install frontend dependencies                                     |
| `make backend-install`  | Install backend dependencies                                      |
| `make frontend`         | Start the React frontend                                          |
| `make backend`          | Start the backend server                                          |
| `make db`               | Start MongoDB with local database path                            |
| `make ipfs`             | Start IPFS daemon                                                 |
| `make ganache`          | Start Ganache for the DID Chain                                   |
| `make truffle`          | Deploy DID smart contracts                                        |
| `make fablo-up`         | Start the Hyperledger Fabric network                              |
| `make fablo-down`       | Stop the Hyperledger Fabric network                               |
| `make fablo-prune`      | Remove the Fabric network resources                               |
| `make qdrant-venv`      | Create Python virtual environment and install Python dependencies |
| `make qdrant`           | Start Qdrant with Docker                                          |
| `make qdrant-gpu`       | Start Qdrant with GPU support                                     |
| `make qdrant-service`   | Start the Qdrant Python service                                   |
| `make match-service`    | Start the matching service                                        |
| `make dummy-generator`  | Run the dummy data generator                                      |
| `make qdrant-stop`      | Stop Qdrant containers                                            |
| `make qdrant-remove`    | Remove Qdrant containers                                          |
| `make qdrant-logs`      | Show Qdrant logs                                                  |

---

## Frontend Notes

The frontend is built with React and Vite.

Some Ethereum-related signing utilities may require Node.js polyfills when running in the browser. If the frontend reports errors related to Node.js modules such as `events`, `buffer`, `process`, or `stream`, make sure the Vite polyfill configuration is enabled.

For example, the frontend may require:

```bash
cd frontend
npm install --save-dev vite-plugin-node-polyfills
```

and a Vite configuration similar to:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['events', 'buffer', 'process', 'stream', 'util'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
})
```

---

## Python Service Notes

The Python virtual environment is created under:

```text
application/venv/
```

This directory should not be committed to Git.

If the matching service requires machine learning models, additional packages such as `sentence-transformers` may be needed. These packages may install large dependencies such as PyTorch.

For lightweight setup, install only the required dependencies first. Install large ML dependencies only when running the semantic matching module.

---

## Practical Usage Notes

### 1. CSR and Private Key for Registration

During the registration process, users are required to upload a CSR and an encrypted private key.

It is recommended to generate the CSR and private key using OpenSSL. For example, an EC P-256 private key and CSR can be generated with the following commands:

```bash
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:prime256v1 -out appkey_pkcs8.pem
openssl req -new -key appkey_pkcs8.pem -out appkey.csr -subj "/CN=your-appkey-name/OU=client"
```

To inspect the generated private key and CSR:

```bash
openssl pkey -in appkey_pkcs8.pem -text -noout
openssl req -in appkey.csr -text -noout
```

The generated files are:

```text
appkey_pkcs8.pem  # Private key in PKCS#8 format
appkey.csr        # Certificate Signing Request
```

> Do not upload or commit real private keys to a public repository. For production deployment, generate your own keys and keep them securely.

---

### 2. Government Account Configuration

The government account uses the following default Ethereum address for local testing:

```text
0xe092b1fa25DF5786D151246E492Eed3d15EA4dAA
```

This address is configured in:

```text
application/public/javascripts/did_config.js
```

For example, the `labor` organization account can be configured as follows:

```js
"labor": {
  "address": "0xe092b1fa25DF5786D151246E492Eed3d15EA4dAA",
  "prvkey": "0cc0c2de7e8c30525b4ca3b9e0b9703fb29569060d403261055481df7014f7fa",
  "pubkey": "j+RKu+f3B47jMOrftObdXGcsFEME0LLZYwS3SbbTQGI="
}
```

If you want to use a different government account, update the corresponding `address`, `prvkey`, and `pubkey` fields under:

```js
didConfig.orgs.labor
```

For local testing, the provided account can be used directly. For real deployment, replace it with your own government organization account.

> The private key shown above is for local testing only. Do not use it in production or commit real private keys to a public repository. It is also recommended to add the DID configuration file to `.gitignore` if it contains real contract addresses, organization accounts, or private keys.

### 3. Fabric Discovery Access Issue

If you encounter a Fabric discovery error similar to the following:

```text
2026-06-12T06:07:43.Z123 - error: [DiscoveryResultsProcessor]: parseDiscoveryResults[access-control-channel] - Channel: access-control-channel received discovery error: access denied
```

This issue may be caused by outdated or invalid wallet credentials generated from a previous Fabric network instance.

To resolve this issue, remove the local wallet directory and restart the Fabric network:

```bash
rm -rf application/services/wallet/
make fablo-down
make fablo-up
```

If the issue persists, you can fully prune and recreate the Fabric network:

```bash
make fablo-prune
make fablo-up
```

> **Note:** Removing `application/services/wallet/` deletes the locally stored Fabric identity credentials. New credentials will be regenerated when the system reconnects to the Fabric network.


---

## Testing and Evaluation

The `test/` directory contains testing and evaluation scripts for:

* DID Chain gas fee analysis
* Semantic matching results
* DID Chain on-chain performance tests
* HR Trust Chain performance tests

Some generated result files, such as CSV and JSON outputs, may be excluded from Git.

Recommended `.gitignore` rules:

```gitignore
test/**/*.csv
test/**/result*.json
test/**/gas-results/*.json
```

If JSON payload files are required as test inputs, do not ignore all JSON files under `test/`.

---

## Current Limitations

This project is a research prototype and is not fully production-ready.

Known limitations:

* The full system is not yet fully containerized.
* Each service must be started manually in a separate terminal.
* Some local services must be installed manually, including MongoDB, IPFS, Ganache, Truffle, and Docker.
* Hyperledger Fabric setup depends on Fablo and Docker.
* Contract addresses may need to be updated manually after deployment.
* Some dependencies are legacy packages and may report security warnings during installation.
* The semantic matching service may require large machine learning dependencies.
* The provided testing keys are for local development only and must not be used in production.

---

## Security Notice

Do not commit real private keys, credentials, production secrets, wallet files, or sensitive configuration files.

Recommended `.gitignore` entries:

```gitignore
.env
.env.local
application/venv/
application/secrets/org_x25519_keys.json
qdrant/
node_modules/
frontend/node_modules/
application/node_modules/
```

If an example key or configuration file is provided, it should be clearly marked as testing-only.

---

## License

This repository is currently provided for academic and research purposes.

Please add a license file before distributing or reusing the project in other contexts.
