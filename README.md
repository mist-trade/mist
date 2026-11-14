<p align="right">
  <a href="./README.zh-CN.md">中文</a> | <strong>English</strong>
</p>

# Mist — A-share Quantitative Core System

<p align="left">
  <img src="https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen.svg" alt="Node Version" />
  <img src="https://img.shields.io/badge/pnpm-%5E9.0.0-blue.svg" alt="pnpm" />
  <img src="https://img.shields.io/badge/NestJS-v10-red.svg" alt="NestJS" />
  <img src="https://img.shields.io/badge/Engine-Rust%20Polars%20SIMD-orange.svg" alt="Rust Polars" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-BSD--3--Clause-green.svg" alt="License" />
</p>

Mist is the core quantitative compute & market-data engine tailored for the **Chinese A-share market**. Built as a NestJS monorepo, it integrates hardware market-data ingress (TDX/QMT), intraday 1m candle aggregation, authentic Chan Theory pure geometry, industrial Rust Polars SIMD vectorized indicators, a 3-pipeline isomorphic strategy evaluation kernel, a streaming simulation engine, and alert distribution.

---

## 🌟 Core Features

- **Multi-source realtime market-data ingest & subscription lifecycle**: Strict schema-v2 decoding of TDX/QMT native frames, declarative subscription synchronization, automated reconciliation, and pre-market health inspections.
- **Intraday 1m Candle Productization (Candle Aggregator)**: Event-driven in-memory aggregation with Redis atomic sealing (MULTI/EXEC), covering the A-share 242-bucket universe with a late-arrival grace window.
- **Authentic Chan Theory Core (ChanCore)**: Strictly faithful to original Chan Theory principles — recursive containment reduction for merged K, wide Bi (anti-false stroke mechanics), feature sequence Duan resolution, symmetric directionless Zhongshu expansion/extension, and complete evaluation of BSP types 1/2/3. Pure mathematics with zero I/O, exposed via `/v1/chan/*` under `apps/mist/src/chan/`.
- **Industrial Rust SIMD Technical Indicators (libs/indicators)**: Implemented using Rust `nodejs-polars` SIMD vectorized expressions, eliminating imperative JS/TS calculation loops while strictly maintaining dual-track TA-Lib parity (`compute*Series` and `compute*Observation`).
- **Unified Strategy Evaluation Kernel (StrategyEvaluationKernel)**: Single push production pipeline ensuring that **live push ≡ simulation replay ≡ batch backtesting** incremental signals are 100% isomorphic.
- **Dual-Timestamp Statutory Contract**: `signalTime` (decision confirmation time = sealed bar timestamp) and `pivotTime` (morphological extreme endpoint timestamp) are physically separated. Orders are executed on Next-Bar ($t_{fill} \ge t+1 > t_{signal}$), completely eliminating lookahead bias.
- **Streaming Simulation Engine (libs/strategy/src/simulation)**: Push-drives simulation on sealed candles with single-direction SSE (`text/event-stream`) streaming for geometry commands and accumulated signals. Enforces strict local development isolation with automatic read-only replay fallback in production.
- **Discrete Multi-Channel Alert Delivery**: Consumes discrete Tier-2 Tactical Events (`TacticalEvent`) with edge transition detection and tactical cooldowns to drive WeCom, Feishu, and generic Webhook matrices without alert flooding.
- **Authoritative Post-Close Sync & Checkpoint Audit**: Automatically ingests authoritative EOD K-lines to overwrite intraday data, backed by migration 034 checkpoint sync events for historical purity.

---

## 🏛️ Monorepo Architecture & Service Topology

```text
mist (NestJS Monorepo)
├── apps/
│   ├── mist/                      # Main business API, market-data ingress, indicators, Chan geometry (/v1/chan/), inspections & historical collection (HTTP :8001)
│   ├── signal/                    # Realtime strategy signal engine (HTTP :8010, TCP RPC :9010)
│   ├── notification/              # Alert delivery & notification gateway (HTTP :8006)
│   ├── backtest/                  # Offline batch backtest worker (HTTP :8004, TCP RPC :8005, retired from production)
│   ├── realtime-subscription-hil/ # Realtime subscription hardware-in-the-loop (HIL) verification tool
│   └── test/                      # System integration & architectural guardrail tests
└── libs/
    ├── chancore/                  # Pure math Chan Theory core library (fractal / wide Bi / Duan / Zhongshu / BSP)
    ├── indicators/                # Rust nodejs-polars SIMD vectorized indicator library
    ├── strategy/                  # Unified evaluation kernel, decision flow tree, factor plugins, simulation engine & broker matching
    ├── signal/                    # Realtime signal dispatch & registry client
    ├── market-data/               # Market domain models, vendor data importer & source mappings
    ├── visual-command/            # Standardized geometry visual commands (VisualCommand)
    ├── contracts/                 # Inter-app and cross-repo shared contract specifications
    ├── shared-data/               # TypeORM entities & repositories
    ├── timezone/                  # Asia/Shanghai trading session calculations
    ├── transport/                 # TCP RPC transport contracts & codecs
    └── decimal/ / constants/      # Precise decimal arithmetic & global constants
```

---

## 📋 Requirements

- **Node.js**: `>= 24.0.0`
- **Package manager**: `pnpm` (`pnpm install --frozen-lockfile`)
- **MySQL**: `>= 8.0` (managed via forward-only migrations)
- **Redis**: `>= 7.0` (realtime candle sealing & BullMQ queues)

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment & run migrations

Copy the env template:
```bash
cp .env.example .env
```

Run forward-only DB migrations (currently baseline `034_create_collector_sync_events.sql`; `synchronize: true` is strictly forbidden):
```bash
pnpm run db:migrate
```

### 3. Start dev services

```bash
# Main backend API & compute service (:8001)
pnpm run start:dev:mist

# Realtime signal evaluation service (:8010, RPC :9010)
pnpm run start:dev:signal

# Notification gateway service (:8006)
pnpm run start:dev:notification

# Offline backtest worker (:8004, RPC :8005)
pnpm run start:dev:backtest
```

Service endpoints & health checks:
- Main API Swagger Docs: `http://127.0.0.1:8001/api-docs`
- Main API Health Probe: `http://127.0.0.1:8001/app/hello`
- Chan Theory Geometry API: `http://127.0.0.1:8001/v1/chan/*`
- Technical Indicators API: `http://127.0.0.1:8001/v1/indicators/*`
- Pre-Market Inspection API: `http://127.0.0.1:8001/v1/inspection/*`
- Signal Service Health Probe: `http://127.0.0.1:8010/health`
- Notification Gateway Health Probe: `http://127.0.0.1:8006/health`

---

## 🧪 Testing & Quality Gates

To prevent host timezone bias from polluting A-share trading session boundaries, tests strictly run under `TZ=UTC`:

```bash
# Run unit & integration tests (TZ=UTC gate)
env TZ=UTC pnpm run test:ci

# Lint & type check
pnpm run lint
pnpm run typecheck

# Architectural guardrails (dual-timestamp, 3-pipeline isomorphism, thin-gateway tests)
pnpm run test:parity

# Cross-service contract verification
pnpm run ci:contracts

# Production Docker build check (asserts all active apps are declared in build:docker)
pnpm run build:docker

# OpenSpec compliance validation
openspec validate --all --strict
```

---

## 🚢 Production Deployment Topology

Production deployments are managed by `mist-deploy` via Docker Compose on a single Windows API host (converged to an 8+1 container appliance):

```text
Docker Appliance Mesh
  ├── mysql:3306                 # Relational database (MySQL 8.0)
  ├── mist-realtime-redis:6379   # Realtime candle cache & BullMQ (Redis 7)
  ├── mist-migrate               # One-shot forward migration runner
  ├── tdx-datasource             # TDX hardware bridge (port 9001 internal only)
  ├── qmt-datasource             # QMT hardware bridge (port 9002 internal only)
  ├── mist-backend:8001          # Main API, market ingress, Chan geometry, inspections & collection
  ├── signal:8010 (RPC :9010)    # Realtime signal evaluation (in-process Chancore & evaluation kernel)
  ├── notification:8006          # Multi-channel notification gateway (WeCom / Feishu / Webhook)
  └── openobserve:5080           # OTLP unified telemetry (logs, metrics, traces)
```

> [!NOTE]
> `backtest`, `schedule`, `chan-api`, `mist-fe`, and `web-gateway` have been formally retired from the production Docker Compose topology. The main backend serves requests directly, minimizing idle connections and memory footprint.

---

## 📚 Directory & Documentation

- **Sub-apps**:
  - [Main business API (apps/mist)](./apps/mist/README.md) (Indicators, Chan geometry, pre-market inspections, EOD collection)
  - [Realtime signal engine (apps/signal)](./apps/signal/README.md)
  - [Notification service (apps/notification)](./apps/notification/README.md)
  - [Offline backtest runtime (apps/backtest)](./apps/backtest/README.md)
  - [Realtime subscription HIL tool (apps/realtime-subscription-hil)](./apps/realtime-subscription-hil/README.md)
- **Core Libs**:
  - [Chan Theory core (libs/chancore)](./libs/chancore/README.md)
  - [Rust SIMD indicators (libs/indicators)](./libs/indicators/README.md)
  - [Strategy kernel & simulation (libs/strategy)](./libs/strategy/README.md)
- **Engineering Governance**:
  - [Mist governance hub & handbook](./docs/governance/README.md)
  - [Project quality governance guide](./docs/project-quality-governance-guide.md)
  - [Contract & data governance guide](./docs/governance/contract-and-data-governance-guide.md)

---

## 📄 License

Licensed under [BSD-3-Clause](https://opensource.org/licenses/BSD-3-Clause).
