<p align="right">
  <strong>中文</strong> | <a href="./README.md">English</a>
</p>

# Mist 智能量化分析核心系统

<p align="left">
  <img src="https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen.svg" alt="Node Version" />
  <img src="https://img.shields.io/badge/pnpm-%5E9.0.0-blue.svg" alt="pnpm" />
  <img src="https://img.shields.io/badge/NestJS-v10-red.svg" alt="NestJS" />
  <img src="https://img.shields.io/badge/Engine-Rust%20Polars%20SIMD-orange.svg" alt="Rust Polars" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-BSD--3--Clause-green.svg" alt="License" />
</p>

Mist 是面向 A 股市场的核心量化计算与行情服务系统。采用 NestJS Monorepo 架构构建，集成了底层硬件行情接入（TDX/QMT）、实时 1 分钟蜡烛线聚合、纯正缠论（Chan Theory）算法引擎、基于 Rust Polars SIMD 向量化技术指标计算、三链路同构策略求值内核、流式推演仿真引擎与告警推送。

---

## 🌟 核心特性

- **多源实时行情接收与订阅生命周期**：严格解码 TDX / QMT 原生数据帧（schema-v2），支持声明式订阅同步、自动对账与盘前健康巡检。
- **当日 1m 蜡烛产品化（Candle Aggregator）**：基于事件驱动的高性能内存聚合与 Redis 原子封存（MULTI/EXEC），覆盖 A 股 242 桶交易宇宙与延迟 Grace 窗口。
- **纯正缠论算法库（ChanCore）**：严格遵循缠论原典算法——合并 K、宽笔、特征序列分段、对称无方向中枢延伸扩展与波动解耦、第一/二/三类买卖点（BSP）全量实时与回测求值。底层无 I/O，统一由 `apps/mist/src/chan/` 输出纯几何图元。
- **工业级 Rust SIMD 指标计算套件（libs/indicators）**：基于 Rust `nodejs-polars` SIMD 向量化表达式实现，彻底告别 JavaScript 命令式慢循环；保持 TA-Lib 风格双轨制（`compute*Series` 与 `compute*Observation`）纯数学对齐。
- **统一策略求值内核（StrategyEvaluationKernel）**：单一 push 生产管线，实现**实时行情推送 ≡ 单步推演仿真 ≡ 离线批量回测**三链路增量信号 100% 逐条同构。
- **法定双时间戳契约**：`signalTime`（决策确立时刻 = 确认 Bar 闭合时间戳）与 `pivotTime`（形态几何极值点时间戳）物理分离，交易在 Next-Bar（$t_{fill} \ge t+1 > t_{signal}$）因果撮合，从源头杜绝未来函数。
- **流式推演仿真与环境隔离（libs/strategy/src/simulation）**：以已密封 K 线推流，SSE（`text/event-stream`）长连接实时推流几何与增量信号；支持单步前后步进与帧缓存；具备本地开发环境刚性隔离与只读离线复盘能力。
- **多渠道告警通知投递**：基于第 2 层战术事件（`TacticalEvent`）驱动企业微信机器人、飞书、Webhook 矩阵投递与 OpenObserve 告警联动，杜绝高频状态刷屏。
- **收盘权威数据同步与检查点对账**：收盘后自动从数据源拉取权威 K 线覆盖入库，由 `034_create_collector_sync_events.sql` 驱动检查点防抖对账，确保历史数据纯净。

---

## 🏛️ Monorepo 架构与应用拓扑

```text
mist (NestJS Monorepo)
├── apps/
│   ├── mist/                      # 主业务 API、行情 Ingress、指标计算、缠论图元 (/v1/chan/)、盘前巡检与历史采集 (HTTP :8001)
│   ├── signal/                    # 实时策略信号评估引擎 (HTTP :8010, TCP RPC :9010)
│   ├── notification/              # 告警分发与消息通知服务 (HTTP :8006)
│   ├── backtest/                  # 离线批量回测 Worker (HTTP :8004, TCP RPC :8005，生产栈已退役)
│   ├── realtime-subscription-hil/ # 实时订阅硬件在环 (HIL) 验证工具
│   └── test/                      # 架构守门与系统集成测试
└── libs/
    ├── chancore/                  # 纯数学缠论核心库（分型/宽笔/线段/中枢/买卖点）
    ├── indicators/                # Rust nodejs-polars SIMD 向量化指标计算库
    ├── strategy/                  # 统一策略求值内核、决策流树、因子插件、推演仿真与撮合执行层
    ├── signal/                    # 实时信号调度与注册表客户端
    ├── market-data/               # 行情领域模型、vendor 供应商导入与数据源映射
    ├── visual-command/            # 图元绘图指令标准化定义 (VisualCommand)
    ├── contracts/                 # 跨应用与跨仓共享协议契约
    ├── shared-data/               # TypeORM 实体定义与数据库 Repository
    ├── timezone/                  # 上海时区 (Asia/Shanghai) 交易时段计算
    ├── transport/                 # TCP RPC 传输契约与编解码
    └── decimal/ / constants/      # 精度计算与全局常量
```

---

## 📋 环境与依赖要求

- **Node.js**：`>= 24.0.0`
- **包管理器**：`pnpm` (`pnpm install --frozen-lockfile`)
- **MySQL**：`>= 8.0`（生产与开发均通过 forward-only migrations 管理）
- **Redis**：`>= 7.0`（用于实时蜡烛封存与 BullMQ 任务队列）

---

## 🚀 快速上手

### 1. 安装依赖

```bash
pnpm install
```

### 2. 环境配置与数据库迁移

复制并配置环境变量文件：
```bash
cp .env.example .env
```

执行单向递增数据库迁移（当前基线至 `034_create_collector_sync_events.sql`，严禁使用 `synchronize: true`）：
```bash
pnpm run db:migrate
```

### 3. 启动开发服务

```bash
# 启动主业务与计算后端服务 (端口: 8001)
pnpm run start:dev:mist

# 启动实时信号评估服务 (端口: 8010, RPC: 9010)
pnpm run start:dev:signal

# 启动消息通知网关 (端口: 8006)
pnpm run start:dev:notification

# 按需启动离线回测 Worker (端口: 8004, RPC: 8005)
pnpm run start:dev:backtest
```

常用服务入口与探针：
- 主后端 Swagger 文档：`http://127.0.0.1:8001/api-docs`
- 主后端健康探针：`http://127.0.0.1:8001/app/hello`
- 缠论几何图元接口：`http://127.0.0.1:8001/v1/chan/*`
- 指标计算接口：`http://127.0.0.1:8001/v1/indicators/*`
- 盘前巡检接口：`http://127.0.0.1:8001/v1/inspection/*`
- 实时信号服务健康探针：`http://127.0.0.1:8010/health`
- 通知网关健康探针：`http://127.0.0.1:8006/health`

---

## 🧪 测试与质量门禁

为避免本地时区影响 A 股交易日边界计算，CI 与本地集成测试统一在 `TZ=UTC` 下运行：

```bash
# 运行单元与集成测试 (TZ=UTC 门禁)
env TZ=UTC pnpm run test:ci

# 代码格式与类型检查
pnpm run lint
pnpm run typecheck

# 架构守门测试 (双时间戳、三链路同构、薄网关与边界测试)
pnpm run test:parity

# 跨服务与契约校验
pnpm run ci:contracts

# 生产镜像构建检查 (验证各 app 均正确注册入 build 列表)
pnpm run build:docker

# OpenSpec 规范一致性校验
openspec validate --all --strict
```

---

## 🚢 生产部署拓扑

生产环境部署由 `mist-deploy` 统一编排，服务通过 Docker Compose 运行于 Windows 宿主环境（当前收敛至极简 8+1 容器网格）：

```text
Docker Appliance 容器网格
  ├── mysql:3306                 # 关系型数据库 (MySQL 8.0)
  ├── mist-realtime-redis:6379   # 实时 Candle 缓存与 BullMQ (Redis 7)
  ├── mist-migrate               # 单向数据库迁移容器 (前置一次性执行)
  ├── tdx-datasource             # 通达信数据源原生桥接 (端口 9001 仅绑内网)
  ├── qmt-datasource             # QMT 数据源原生桥接 (端口 9002 仅绑内网)
  ├── mist-backend:8001          # 主 API、行情 Ingress、缠论、巡检与采集
  ├── signal:8010 (RPC :9010)    # 实时策略评估引擎 (进程内调用 Chancore 与求值内核)
  ├── notification:8006          # 消息通知网关 (企业微信/飞书/Webhook 矩阵)
  └── openobserve:5080           # OTLP 统一日志、指标与分布式链路追踪平台
```

> [!NOTE]
> `backtest`、`schedule`、`chan-api`、`mist-fe` 与 `web-gateway` 均已正式从生产 Docker Compose 拓扑中退役，主后端直面请求，大幅削减了空转连接与内存开销。

---

## 📚 目录与文档入口

- **子应用说明书**：
  - [主业务 API (apps/mist)](./apps/mist/README.md)（含指标计算、缠论几何图元、盘前巡检、收盘采集）
  - [实时信号引擎 (apps/signal)](./apps/signal/README.md)
  - [通知服务 (apps/notification)](./apps/notification/README.md)
  - [离线回测运行时 (apps/backtest)](./apps/backtest/README.md)
  - [实时订阅 HIL 工具 (apps/realtime-subscription-hil)](./apps/realtime-subscription-hil/README.md)
- **核心算法与库说明**：
  - [缠论算法核心库 (libs/chancore)](./libs/chancore/README.md)
  - [Rust 向量化指标库 (libs/indicators)](./libs/indicators/README.md)
  - [策略内核与仿真引擎 (libs/strategy)](./libs/strategy/README.md)
- **工程治理规范**：
  - [Mist 规范中心与开发手册](./docs/governance/README.md)
  - [项目质量常驻治理指南](./docs/project-quality-governance-guide.md)
  - [契约与数据治理指南](./docs/governance/contract-and-data-governance-guide.md)

---

## 📄 许可证

本项目遵循 [BSD-3-Clause](https://opensource.org/licenses/BSD-3-Clause) 开源许可证。
