# Proposal: lifecycle-driven-kline-reconciliation

## Why

1. **当前现状痛点**：
   - `mist` 主仓库目前在 `apps/schedule/src/data-collection.controller.ts` 中维护固定 Cron 任务（夜间 22:30 和次日早晨 06:30），通过 HTTP 跨网络拉取 Windows 宿主机上运行的 TDX 和 QMT 客户端历史数据。
   - 用户反馈：“定时去补充当前天数K线的情况很不好用，而且不知道有没有成功被触发过一次。因为两个 PC 客户端时不时就要重启或者卡住，没有那么牢靠。”
   - 调研实锤：
     - **零数据库审计记录**：无任务运行历史表，跑了没跑在 DB 中无痕迹；
     - **零同步结果通知**：22:30 和 06:30 同步成功或失败均无飞书/企微通知；
     - **级联雪崩与挂起**：前置下载缺少 `try/catch`，下游客户端重启时抛未捕获异常导致整批崩溃；QMT 单线程命令通道（1秒/条）容易在并发拉取时队列堵死引发 502/504；
     - **时间窗口错位**：券商夜间维护（20:00-08:00）常导致 PC 客户端断线或假死，中心定时 Pull 极易撞车。

2. **核心理念变革：彻底依赖倒置（Inversion of Control）**：
   - 废除固定时钟的中心拉取定时器，改为**基于客户端生命周期的主动对账（Lifecycle-Driven Reconciliation）**。
   - 每次 PC 客户端（TDX 或 QMT）成功登录、内置策略脚本启动并完成注册时，触发一次历史缺口对账与补齐。
   - 此时客户端状态最健康（进程刚启动无泄漏、券商认证刚通过、弹窗已处理）；触发频率极低（仅开机/重启时），自愈能力极强。

3. **双桥通信混乱与旧代码清理契机**：
   - 当前 TDX 和 QMT 两大内置桥脚本（`mist_tdx_realtime_bridge.py` 与 `mist_qmt_realtime_bridge.py`）在心跳、轮询、命令通道上存在严重割裂与概念混淆：
     - QMT 存在双轮询通道（历史命令 poll + 订阅命令 poll）叠加 30s observability 上报 + TCP 行情直推，心跳隐式绑定在 poll 动作上，长命令阻塞时必须靠服务端 `busy_until` 打补丁；
     - TDX 只有订阅 poll，历史查询完全绕过桥直连 17709 端口；
     - 两个桥缺乏极简的状态收敛。
   - 本次改造收敛为**极简三态（DEAD / BROKER_DOWN / HEALTHY）**，同时彻底删除存量包袱代码（`busy_until`、双重轮询、死板 Cron 等）。

---

## What Changes

### 1. 通信架构依赖倒置与极简三态模型
- **极简三态收敛**：
  - `DEAD` (心跳死了)：>15s 无心跳或端口连接拒绝；
  - `BROKER_DOWN` (心跳活着，行情挂了)：心跳正常，但券商通道断开或探针 Bar 拿不到当日数据；
  - `HEALTHY` (正常存活)：心跳正常且券商数据通道通畅。
- **开机登录发令枪**：客户端开机/注册且状态进入 `HEALTHY` 时，`mist-datasource` 自动触发后台异步对账工作流：
  1. 调用 `mist-backend` 的 `GET /v1/collector/sync-manifest` 获取最近闭合交易日的缺口清单；
  2. 若缺口为 0（已是最新），直接秒级退出；
  3. 若有缺口，在本地驱动客户端执行下载（`refresh_kline` / `download_history_data`）；
  4. 提取缺口 Bar 并打包主动 Push 给 `mist-backend` 的 `POST /v1/collector/push-bars`；
  5. 记录 `collector_sync_events` 审计日志并发送企微/飞书通知。
- **主仓库减负**：退役 `apps/schedule` 中的 `handleNightlyPostCloseSync` 与 `handleMorningRetrySync` 定时器。

### 2. 双桥通信契约规范化与旧代码删除
- **解耦独立心跳**：新增专有 `POST /v1/{source}/bridge/heartbeat`（5s 周期），彻底与业务命令/轮询解耦。
- **删除网关 `busy_until` 脏补丁**：彻底移除 `gateway.py` 中的 `_busy_until` 与 `extend_busy_until`。
- **QMT 双轮询合二为一**：移除 `/qmt/bridge/subscription/poll` 与 `/subscription/result` 冗余路由，桥脚本精简近 400 行。
- **健康接口归一**：`/health` 接口顶层直接输出 `state: "DEAD" | "BROKER_DOWN" | "HEALTHY"`。

---

## Capabilities

### 新增 Capabilities
- `collector-lifecycle-reconciliation`: 基于终端启动事件的缺口发现、本地驱动下载与反向 Push 入库机制。
- `unified-bridge-3state-lifecycle`: TDX 与 QMT 桥极简三态模型与独立心跳契约。

### 变更/退役 Capabilities
- `data-collection-schedule`: 退役 22:30 与 06:30 Cron 驱动的历史拉取逻辑，保留 09:05 盘前只读健康巡检。
