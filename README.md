# Mist - 智能股票分析系统

<p align="center">
  <strong>A 股市场智能分析与预警系统</strong>
</p>

---

## 📖 项目简介

Mist 是一个功能完整的股票市场分析系统，支持 A 股全市场（沪深两市）的技术分析与智能决策支持。采用 Monorepo 架构，集成了传统技术分析、缠论分析，以及面向 AI/机器人调用的 `mist-skills` 集成路径。

### ✨ 核心功能

- **技术指标计算**：MACD、RSI、KDJ、ADX、ATR 等 164+ 种技术指标
- **缠论分析**：笔（Bi）、分型（Fenxing）、中枢（Channel）自动识别与计算
- **AI/机器人集成**：通过 `mist-skills` 为外部 AI 工具与 AstrBot 提供结构化分析能力
- **多数据源管理**：支持东方财富（ef）、通达信（tdx）、大 QMT（qmt）等多个数据源
- **多周期数据**：支持 1min、3min、5min、15min、30min、60min、daily、weekly、monthly 等多种时间周期
- **定时任务**：自动数据采集与指标计算
- **数据源桥接**：mist-datasource 模块支持 TDX/QMT SDK 的跨平台 HTTP/WebSocket 服务

---

## 🏗️ 系统架构

### Monorepo 结构

```
mist/
├── apps/                  # 应用程序
│   ├── mist/              # 主应用 - 技术分析与缠论 (Port 8001)
│   ├── schedule/          # 定时任务 (Port 8003)
│   └── chan/              # 缠论测试入口 (Port 8008)
├── libs/                  # 共享库
│   ├── config/            # 配置管理
│   ├── utils/             # 共享工具
│   ├── shared-data/       # 数据模型
│   ├── timezone/          # 时区处理
│   └── constants/         # 常量定义（错误码、趋势方向等）
└── test-data/             # 测试数据
```

### 应用模块

| 应用         | 端口 | 功能描述                              |
| ------------ | ---- | ------------------------------------- |
| **mist**     | 8001 | 主应用 - 数据采集、技术指标、缠论分析 |
| **schedule** | 8003 | 定时任务 - 周期性数据采集             |
| **chan**     | 8008 | 缠论测试 - K 线合并、笔计算、中枢识别 |

---

## 🚀 部署方式

本项目提供两种部署方式：

### 方式一：Docker 部署（推荐用于生产环境）

Windows API 机器的正式部署以 `mist-deploy` 仓库为入口：Docker Desktop
运行 `mysql`、`mist-backend`、`chan-api`，`mist-tdx-datasource` 继续作为
WinSW 服务运行在 Windows Host。详细说明见
[`deploy/docker/README-Windows-Docker.md`](deploy/docker/README-Windows-Docker.md)。

#### 快速启动

```bash
# 1. 配置环境变量
cd mist
cp .env.example .env
vim .env  # 设置 MYSQL_PASSWORD 等配置

# 2. 启动所有服务
docker-compose up -d

# 3. 查看状态
docker-compose ps
```

#### 服务架构

```
┌──────────────────────────────────────────────────────┐
│              Docker Network: mist-network             │
│                                                      │
│  ┌────────────┐                                     │
│  │   mist     │                                     │
│  │  (8001)    │                                     │
│  │  主应用    │                                     │
│  └────────────┘                                     │
│                                                      │
│  ┌────────────┐                                      │
│  │   chan     │                                      │
│  │   (8008)   │                                      │
│  │  缠论测试  │                                      │
│  └────────────┘                                      │
└──────────────────────┼───────────────────────────────┘
                       │
                       ▼
                ┌────────────┐
                │   MySQL    │
                │  (外部DB)   │
                └────────────┘
```

#### 环境变量配置

编辑 `.env` 文件：

```bash
# 必需配置
MYSQL_PASSWORD=your_mysql_password

# 可选配置
REPO_OWNER=your-github-username  # 默认: moyui
VERSION=latest                    # 或指定版本: v1.0.0
NODE_ENV=production              # 运行环境
```

#### 服务端口

| 服务     | 端口 | 说明                 |
| -------- | ---- | -------------------- |
| **mist** | 8001 | 主应用 API           |
| **mist** | 8008 | Chan Theory 测试入口 |

#### 版本管理

```bash
# 查看当前版本
docker-compose images

# 升级到新版本
VERSION=v1.2.0 docker-compose pull
docker-compose up -d

# 回滚到指定版本
VERSION=v1.1.0 docker-compose up -d
```

#### 健康检查

```bash
# 检查所有服务状态
docker-compose ps

# 检查服务健康状态
curl http://localhost:8001/app/hello # 主应用
```

#### 停止和清理

```bash
# 停止服务
docker-compose down

# 停止并删除数据卷
docker-compose down -v

# 查看日志
docker-compose logs -f --tail=100
```

---

### 方式二：本地开发（推荐用于开发调试）

#### 前置要求

- **Node.js** 20+
- **MySQL** 8.0+
- **pnpm** 包管理器

#### 安装依赖

```bash
# 安装所有依赖
pnpm install
```

#### 配置环境变量

```bash
# 复制示例配置
cp apps/mist/src/.env.example apps/mist/src/.env

# 编辑配置文件
# apps/mist/src/.env - MySQL、Redis 等配置
```

#### 数据库设置

```sql
CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;
```

#### 运行应用

```bash
# 开发模式 - 运行特定应用
pnpm run start:dev:mist       # 主应用 (port 8001)
pnpm run start:dev:schedule   # 定时任务 (port 8003)
pnpm run start:dev:chan       # 缠论测试入口 (port 8008)

# 调试模式
pnpm run start:debug:chan       # 调试缠论

# 生产模式
pnpm run build
pnpm run start:prod
```

---

## 📚 功能模块

### 主应用 (mist)

**技术指标**：

- MACD - 指数平滑移动平均线
- RSI - 相对强弱指标
- KDJ - 随机指标
- ADX - 平均趋向指标
- ATR - 真实波幅

**缠论分析**：

- 合并 K（Merge K）- 基于包含关系的 K 线合并
- 分型（Fenxing）- 顶分型和底分型识别
- 笔（Bi）- 显著价格变动识别
- 中枢（Channel）- 整理区间识别

**多数据源管理**：

- 支持多个数据源（东方财富 ef、通达信 tdx、mimiQmt）
- 统一的股票管理接口
- 灵活的数据采集配置
- 自动数据源切换和故障转移

**WebSocket 实时行情**：

- 通过 `ws` 库作为客户端连接 mist-datasource WebSocket 服务
- 支持实时行情快照推送和 K 线数据流聚合
- 自动重连和心跳保活机制

**API 文档**：http://localhost:8001/api-docs

### AI/机器人集成

当前支持路径是外部 AI 工具和 AstrBot 通过 `mist-skills` 调用 Mist REST
API。策略信号和主动告警由 Mist 后端持久化，`mist-skills` 只消费
`/v1/strategy-alert-events` 并回写投递结果，不执行策略规则或直连
datasource。

### mist-skills

| 分类             | 工具                                                             | 功能         |
| ---------------- | ---------------------------------------------------------------- | ------------ |
| **缠论工具**     | merge_k / create_bi / get_fenxing / analyze_chan                 | 缠论分析     |
| **技术指标工具** | MACD / RSI / KDJ / ADX / ATR                                     | 单项指标计算 |
| **数据查询工具** | list_indices / get_index_info / get_kline_data / get_daily_kline | 市场数据查询 |
| **策略告警工具** | strategy-alerts shared helpers                                   | 告警消费     |

### 定时任务 (schedule)

- 定时数据采集（多种时间周期）
- 定时指标计算
- K 线采集成功后自动触发同周期策略扫描，复用 `StrategyScanService`
- 定时分析与预警事件生成

### 缠论测试 (chan)

专门的测试入口，用于：

- 测试缠论算法
- 调试 K 线合并逻辑
- 验证笔识别算法
- 检查中枢识别结果

---

## 🔧 开发指南

### 代码规范

```bash
# Lint 检查
pnpm run lint

# 代码格式化
pnpm run format
```

Git 提交前会自动运行检查（Husky + lint-staged）

### 测试

```bash
# 单元测试
pnpm run test

# E2E 测试
pnpm run test:e2e

# 测试覆盖率
pnpm run test:cov

# 监听模式
pnpm run test:watch

# 运行特定测试
pnpm run test:chan:shanghai-2024-2025

# 运行测试并同步到前端
pnpm run test:full

# 生成 TypeScript 类型定义
pnpm run test:gen-types
```

### 数据库迁移

```bash
# 生成迁移
pnpm run migration:generate -- -n MigrationName

# 运行迁移
pnpm run migration:run

# 回滚迁移
pnpm run migration:revert
```

### 构建

```bash
# 构建所有项目
pnpm run build
```

---

## 📖 API 文档

### Swagger UI

启动应用后访问：http://localhost:8001/api-docs

### 主要端点

新业务 API 优先使用 `/v1/<resource>` 风格。历史路径继续保留为兼容入口，
生产网关前缀 `/api/mist`、`/api/chan` 由部署层添加，不写入后端控制器路径。

| 首选端点              | 方法 | 兼容端点          | 描述         |
| --------------------- | ---- | ----------------- | ------------ |
| `/app/hello`          | GET  | -                 | 健康检查     |
| `/v1/indicators/k`    | POST | `/indicator/k`    | K 线数据获取 |
| `/v1/indicators/macd` | POST | `/indicator/macd` | MACD 计算    |
| `/v1/indicators/rsi`  | POST | `/indicator/rsi`  | RSI 计算     |
| `/v1/indicators/kdj`  | POST | `/indicator/kdj`  | KDJ 计算     |
| `/v1/chan/merge-k`    | POST | `/chan/merge-k`   | K 线合并     |
| `/v1/chan/bi`         | POST | `/chan/bi`        | 笔识别       |
| `/v1/chan/channel`    | POST | `/chan/channel`   | 中枢识别     |
| `/v1/chan/fenxing`    | POST | `/chan/fenxing`   | 分型识别     |

### 统一响应格式

所有 HTTP 端点返回统一格式的响应：

**成功响应：**

```json
{
  "success": true,
  "code": 200,
  "message": "SUCCESS",
  "data": {},
  "timestamp": "2026-03-19T10:30:00.000Z",
  "requestId": "http-1710819800000-abc123xyz"
}
```

**错误响应：**

```json
{
  "success": false,
  "code": 1001,
  "message": "INVALID_PARAMETER",
  "timestamp": "2026-03-19T10:30:00.000Z",
  "requestId": "err-1710819800000-def456uvw"
}
```

**错误码范围：**

- `200`：成功
- `1xxx`：客户端错误（参数验证、格式错误）
- `2xxx`：业务错误（数据未找到、数据不足）
- `5xxx`：服务端错误（数据库、外部服务）

### 证券与采集 API

| 首选端点                          | 方法   | 兼容端点                        | 描述               |
| --------------------------------- | ------ | ------------------------------- | ------------------ |
| `/v1/securities`                  | POST   | `/security/v1/initialize`       | 初始化股票         |
| `/v1/securities`                  | GET    | `/security/v1/all`              | 获取全部启用股票   |
| `/v1/securities/:code`            | GET    | `/security/v1/:code`            | 获取股票信息       |
| `/v1/security-sources`            | POST   | `/security/v1/sources`          | 添加/更新数据源    |
| `/v1/security-sources`            | DELETE | `/security/v1/sources`          | 删除数据源配置     |
| `/v1/securities/:code/sources`    | GET    | `/security/v1/:code/sources`    | 获取股票数据源配置 |
| `/v1/securities/:code/deactivate` | PUT    | `/security/v1/:code/deactivate` | 停用股票           |
| `/v1/securities/:code/activate`   | PUT    | `/security/v1/:code/activate`   | 启用股票           |
| `/v1/collector/collect`           | POST   | -                               | 采集 K 线数据      |

### 策略平台 API

策略平台第一阶段提供策略定义注册、版本查看、信号/告警查询边界、手动扫描
触发，以及 signal-level 回测。当前扫描只基于最新 K 线生成信号和告警事件；
回测接口会同步执行历史 K 线回放并写入 signal-level 结果，不包含资金、仓位、
订单、费用、滑点或组合收益模拟。

前端操作入口位于 `mist-fe` 的 `/strategies`，通过同源 Mist 网关路径调用
下列 `/v1/*` 后端 API，不直连 datasource 或 raw provider 服务。

| 端点                                    | 方法  | 描述                       |
| --------------------------------------- | ----- | -------------------------- |
| `/v1/strategies`                        | POST  | 创建策略定义和初始版本     |
| `/v1/strategies`                        | GET   | 列出策略定义               |
| `/v1/strategies/:id`                    | GET   | 获取策略定义详情           |
| `/v1/strategies/:id`                    | PATCH | 更新策略并创建新版本       |
| `/v1/strategies/:id/enable`             | POST  | 启用策略                   |
| `/v1/strategies/:id/disable`            | POST  | 停用策略                   |
| `/v1/strategies/:id/versions`           | GET   | 查看策略版本               |
| `/v1/strategy-signals`                  | GET   | 查询策略信号               |
| `/v1/strategy-alert-events`             | GET   | 查询策略告警事件           |
| `/v1/strategy-alert-events/:id/delivered` | POST  | 标记告警已投递             |
| `/v1/strategy-alert-events/:id/failed`  | POST  | 标记告警投递失败           |
| `/v1/strategy-alert-events/:id/ack`     | POST  | 确认策略告警事件           |
| `/v1/strategy-scans/run`                | POST  | 手动触发启用策略扫描       |
| `/v1/strategy-backtests`                | POST  | 执行 signal-level 历史回放 |
| `/v1/strategy-backtests/:runId`         | GET   | 查看回测 run 和聚合统计    |
| `/v1/strategy-backtests/:runId/signals` | GET   | 查看回测信号结果           |

---

## 🔌 AI/机器人集成

Mist 的当前 AI/机器人集成路径是独立 `mist-skills` 仓库。Skills 通过
`MIST_API_BASE_URL` 调用 Mist REST API，不再启动独立工具服务。

### 可用 Skills

| 分类             | 工具                         | 功能             |
| ---------------- | ---------------------------- | ---------------- |
| **缠论工具**     | `merge_k`                    | K 线合并（缠论） |
|                  | `create_bi`                  | 计算笔（缠论）   |
|                  | `get_fenxing`                | 分型识别（缠论） |
|                  | `analyze_chan_theory`        | 完整缠论分析     |
| **技术指标工具** | MACD / RSI / KDJ / ADX / ATR | 单项指标计算     |
|                  | `analyze_indicators`         | 综合指标分析     |
| **数据查询工具** | `get_index_info`             | 获取指数信息     |
|                  | `get_kline_data`             | 获取 K 线数据    |
|                  | `get_daily_kline`            | 获取日线数据     |
|                  | `list_indices`               | 列出所有指数     |

`mist-skills` 的安装、环境变量和 AstrBot 部署方式见相邻仓库
`../mist-skills/README.md`。

---

## 🗄️ 数据库

### TypeORM 配置

- 所有环境：自动同步关闭（`synchronize: false`）
- Schema 变更：使用 `pnpm run db:migrate` 执行仓库 SQL 迁移

### 时间周期

支持的时间周期：

- **1min** - 1 分钟
- **5min** - 5 分钟
- **15min** - 15 分钟
- **30min** - 30 分钟
- **60min** - 60 分钟
- **daily** - 日线

---

## 🐳 Docker 镜像

### 镜像构建

项目使用 GitHub Actions 自动构建和发布 Docker 镜像：

- **触发条件**：Push to `master` 分支或创建 Git Tag
- **镜像仓库**：`ghcr.io/moyui/mist`
- **构建内容**：
  - 主应用镜像：`ghcr.io/moyui/mist`（Node.js 24 + NestJS）

### 本地构建镜像

```bash
cd mist

# 构建主应用镜像
docker build -t mist:latest .
```

---

## 🛠️ 技术栈

| 组件             | 技术                               |
| ---------------- | ---------------------------------- |
| 应用框架         | NestJS 10                          |
| AI/机器人集成    | mist-skills/AstrBot                |
| 技术分析         | node-talib (164+ 函数)             |
| 数据库           | MySQL with TypeORM                 |
| WebSocket 客户端 | ws (连接 mist-datasource 实时行情) |
| 调度器           | @nestjs/schedule                   |
| 时区             | date-fns-tz                        |
| 数据验证         | class-validator                    |
| 前端             | Next.js 16, React 19, ECharts 6    |

---

## 🐛 故障排查

### Docker 部署问题

**MySQL 连接失败**

```bash
# 检查 host.docker.internal 配置
docker exec mist-backend ping -c 3 host.docker.internal

# 测试 MySQL 端口
docker exec mist-backend nc -zv host.docker.internal 3306
```

### 本地开发问题

**端口被占用**

```bash
# 查看占用端口的进程
lsof -i :8001
lsof -i :8008

# 停止进程
kill -9 <PID>
```

**MySQL 连接失败**

```bash
# 测试 MySQL 连接
mysql -h localhost -u root -p

# 检查数据库
SHOW DATABASES LIKE 'mist';

# 创建数据库
CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;
```

### 常用命令

```bash
# 查看当前运行的版本
docker-compose images

# 只重启单个服务
docker-compose restart mist

# 进入容器调试
docker exec -it mist-backend sh

# 查看日志
docker-compose logs -f --tail=100
```

---

## 🔐 安全性

- ✅ 已实现 API 限流（@nestjs/throttler）
- ✅ TypeORM 生产模式同步已禁用
- ✅ 环境变量敏感信息已分离

---

## 📝 许可证

BSD-3-Clause

---

## 📮 相关文档

- [开发指南](CLAUDE.md) - Claude Code 开发指引
- [AstrBot 集成规范](openspec/specs/astrbot-integration/spec.md)
- [缠论算法说明](apps/chan/README.md)
- [项目路线图](Roadmap.md)
- [技术指标文档](Talib.md)
