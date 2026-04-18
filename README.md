# 🛰️ Web3 Process Manager

A production-grade **PM2-based process management system** purpose-built for **Stellar blockchain indexers**, featuring real-time health monitoring, crash-loop detection, webhook alerting, and an on-chain health registry powered by a **Soroban smart contract** on the Stellar network.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Smart Contract](#smart-contract)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Managing blockchain indexer processes requires more than a simple restart script. Indexers must stay in sync with block production, recover gracefully from failures, and provide operational visibility — all without introducing downtime.

**Web3 Process Manager** solves this by combining:

1. **PM2 ecosystem orchestration** for zero-downtime deployments and auto-healing
2. **A real-time health daemon** (`healthd.js`) that exposes process metrics via REST
3. **Crash-loop watchdog alerting** with configurable webhook integrations
4. **An immutable, on-chain health registry** via a Soroban smart contract that records heartbeats and crash events to the Stellar blockchain

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PM2 Ecosystem                        │
│                                                         │
│  ┌────────────────────┐  ┌────────────────────┐        │
│  │ stellar-mainnet-   │  │ stellar-testnet-   │        │
│  │ indexer (cluster)   │  │ indexer (cluster)   │        │
│  └────────┬───────────┘  └────────┬───────────┘        │
│           │                       │                     │
│  ┌────────▼───────────────────────▼───────────┐        │
│  │         process-manager-healthd             │        │
│  │         (Express REST + PM2 Bus)            │        │
│  └────────┬─────────────────┬─────────────────┘        │
│           │                 │                           │
└───────────┼─────────────────┼───────────────────────────┘
            │                 │
    ┌───────▼──────┐  ┌──────▼──────────────────┐
    │  GET /health │  │  contractService.js      │
    │  (REST API)  │  │  (Soroban SDK client)    │
    └──────────────┘  └──────┬──────────────────┘
                             │
                    ┌────────▼────────────────┐
                    │  Stellar Testnet        │
                    │  Soroban Smart Contract │
                    │  (Health Registry)      │
                    └─────────────────────────┘
```

---

## Features

| Feature | Description |
|---|---|
| 🔄 **Zero-Downtime Deploys** | PM2 `reload` with cluster mode ensures no missed blocks during updates |
| 💓 **Health Heartbeats** | REST endpoint returns real-time CPU, memory, uptime, restart count, and block-height lag per process |
| 🐕 **Crash-Loop Watchdog** | PM2 bus listener detects rapid restart patterns (≥3 crashes in 60s) and fires alerts |
| 📢 **Webhook Alerting** | Configurable Slack/Discord webhook integration for critical crash notifications |
| ⛓️ **On-Chain Registry** | Soroban smart contract records process health snapshots and crash events immutably on-chain |
| 🛡️ **Auto-Healing** | `max_memory_restart`, exponential backoff restarts, and graceful shutdown with `SIGINT` handling |
| 📊 **Block Lag Tracking** | Each indexer reports its sync distance from the network head |
| 🔐 **Admin-Gated Writes** | On-chain mutations require admin keypair authorisation |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Process Management | [PM2](https://pm2.keymetrics.io/) v6 |
| Runtime | Node.js (CommonJS) |
| HTTP Server | Express v5 |
| Blockchain | [Stellar](https://stellar.org/) / Soroban |
| Smart Contract | Rust + [soroban-sdk](https://crates.io/crates/soroban-sdk) v21 |
| SDK | [@stellar/stellar-sdk](https://www.npmjs.com/package/@stellar/stellar-sdk) |
| Alerting | Slack/Discord Webhooks |
| CI/CD | Bash deploy script with PM2 save/reload |

---

## Project Structure

```
Process Manager/
├── smart-contract/              # Soroban smart contract (Rust)
│   ├── Cargo.toml               # Rust project manifest
│   ├── README.md                # Contract-specific documentation
│   └── src/
│       └── lib.rs               # Contract: ProcessHealthRegistry
│
├── contractService.js           # JS service layer for Soroban interactions
├── healthd.js                   # Express health daemon + PM2 watchdog
├── mock_indexer.js              # Simulated Stellar indexer process
├── ecosystem.config.js          # PM2 ecosystem configuration
├── indexers.json                # Indexer process definitions
├── deploy.sh                    # Zero-downtime deployment script
├── .env                         # Environment variables (secrets)
├── package.json                 # Node.js dependencies
└── logs/                        # PM2 stdout/stderr log files
```

---

## Getting Started

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org/) | ≥18 | Runtime |
| [PM2](https://pm2.keymetrics.io/) | ≥6 | Process manager |
| [Rust](https://rustup.rs/) | stable | Smart contract compilation |
| [Soroban CLI](https://soroban.stellar.org/docs/getting-started/setup) | ≥21 | Contract deployment |

### 1. Clone & Install

```bash
git clone https://github.com/Anushamitra19/Process-Manager.git
cd Process-Manager
npm install
```

### 2. Configure Environment

Copy and edit the `.env` file with your credentials:

```env
# Alerting
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Database (if using persistent storage)
DATABASE_URL=postgres://user:pass@localhost:5432/web3

# Stellar / Soroban
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
SOROBAN_CONTRACT_ID=<your-deployed-contract-id>
STELLAR_ADMIN_SECRET=<your-admin-secret-key>
```

### 3. Start Locally

```bash
# Create logs directory
mkdir -p logs

# Start the full ecosystem (indexers + health daemon)
npx pm2 start ecosystem.config.js

# Check process status
npx pm2 status

# View health endpoint
curl http://localhost:3000/health
```

### 4. Build & Deploy Smart Contract

```bash
cd smart-contract

# Build the WASM binary
cargo build --target wasm32-unknown-unknown --release

# Deploy to Stellar Testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/process_health_registry.wasm \
  --source <ADMIN_SECRET> \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

# Initialise the contract
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_SECRET> \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- initialize --admin <ADMIN_PUBLIC_KEY>
```

Set the returned `CONTRACT_ID` in your `.env` file.

---

## Smart Contract

The **Process Health Registry** is a Soroban smart contract written in Rust that provides an immutable, on-chain ledger for process health data.

### Data Types

#### `HealthRecord`
| Field | Type | Description |
|---|---|---|
| `process_name` | String | Human-readable process identifier |
| `status` | u32 | 0=online, 1=stopping, 2=stopped, 3=errored |
| `restart_count` | u32 | Cumulative restart count |
| `uptime_secs` | u64 | Process uptime in seconds |
| `memory_mb` | u32 | Memory usage in MB |
| `cpu_pct` | u32 | CPU utilisation (0-100) |
| `block_lag` | u32 | Blocks behind network head |
| `ledger_seq` | u32 | Stellar ledger at time of recording |

#### `CrashEvent`
| Field | Type | Description |
|---|---|---|
| `process_name` | String | Process that crashed |
| `crash_count` | u32 | Number of crashes in detection window |
| `detected_at_ledger` | u32 | Ledger sequence of detection |
| `alert_message` | String | Alert description |

### Contract Functions

| Function | Auth | Description |
|---|---|---|
| `initialize(admin)` | Admin | One-time setup |
| `transfer_admin(new_admin)` | Both | Transfer admin role |
| `record_health(...)` | Admin | Push a health heartbeat |
| `record_crash(...)` | Admin | Log a crash event |
| `get_record_count()` | Public | Total heartbeats |
| `get_health(id)` | Public | Fetch record by ID |
| `get_latest_health(name)` | Public | Latest snapshot for a process |
| `get_process_names()` | Public | All registered names |
| `get_crash_count()` | Public | Total crash events |
| `get_crash(id)` | Public | Fetch crash event by ID |

### Testing

```bash
cd smart-contract
cargo test
```

---

## API Reference

### `GET /health`

Returns real-time process health data from the PM2 daemon.

**Response:**

```json
{
  "timestamp": "2026-04-17T16:00:00.000Z",
  "manager": "PM2",
  "processes": [
    {
      "id": 0,
      "name": "stellar-mainnet-indexer",
      "pid": 12345,
      "status": "online",
      "restarts": 2,
      "uptime": 86400,
      "memoryUsageMB": 128,
      "cpuUsagePercent": 15,
      "blockHeightLag": 0
    },
    {
      "id": 1,
      "name": "stellar-testnet-indexer",
      "pid": 12346,
      "status": "online",
      "restarts": 0,
      "uptime": 86400,
      "memoryUsageMB": 64,
      "cpuUsagePercent": 8,
      "blockHeightLag": 2
    }
  ]
}
```

---

## Configuration

### `indexers.json`

Define the indexer processes to manage:

```json
{
  "indexers": [
    {
      "name": "stellar-mainnet-indexer",
      "script": "./mock_indexer.js",
      "instances": 1,
      "env": {
        "NETWORK": "mainnet",
        "HORIZON_URL": "https://horizon.stellar.org",
        "TARGET_LAG": 0
      }
    }
  ]
}
```

### `ecosystem.config.js`

PM2 ecosystem file that dynamically reads `indexers.json` and adds auto-healing settings:

| Setting | Value | Purpose |
|---|---|---|
| `max_memory_restart` | `200M` | Auto-restart on memory leak |
| `exp_backoff_restart_delay` | `100` | Exponential backoff on crash |
| `kill_timeout` | `5000` | Graceful shutdown window |
| `wait_ready` | `true` | Wait for `ready` IPC signal |
| `exec_mode` | `cluster` | Enable zero-downtime reload |

---

## Deployment

### Using the deploy script

```bash
chmod +x deploy.sh
./deploy.sh
```

The script performs:
1. Dependency installation (`npm install --omit=dev`)
2. Log directory creation
3. Zero-downtime PM2 reload with `--update-env`
4. Fallback to fresh start if PM2 isn't running
5. PM2 state persistence for system reboot recovery

### System Startup

```bash
# Generate startup script for your OS
npx pm2 startup

# Save current process list
npx pm2 save
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the [MIT License](LICENSE).
