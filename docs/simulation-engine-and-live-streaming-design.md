# 流式推演仿真引擎与长连接实时推流架构设计 (Live Simulation Engine)

> **状态**：设计已对齐 (Design Approved via /grill-me)  
> **适用范围**：`mist` (策略库/开发网关)、`mist-fe` (前端回测工作台)  
> **核心目标**：彻底消除单步测试中基于本地数据 clone 多份、在 dev-server 中私自手写切片和模拟循环等偷懒与绕道行为。以「生产纯度」为最高准则，构建一等公民的流式推演仿真内核，打通 SSE 长连接实时推流与前端双向步进控制，保持后端生产链路与前端展示的纯洁性与一致性。

---

## 一、核心痛点与架构准则

### 1.1 现状与痛点反思
1. **多份伪模拟代码横生**：过去为了在本地做单步测试或复盘，往往在测试脚本、dev-server 里各自 clone 一份本地数据，并手写伪推进逻辑（如截断数组、循环重算）。开发时产生“偷懒和绕道”，导致真实线上链路的行为与本地模拟产生严重割裂。
2. **前后端缺少流式闭环**：前端单步复盘过去通过对每个时间游标不断发起 `GET /v1/visual/commands?endDate=...` 轮询重算，后端对每个时刻全量重算切片，不仅性能低下，而且并非真正的事件驱动推流。
3. **网关越界膨胀**：`tools/strategy-dev/server.ts` 逐渐积累了近千行模拟回测、切片缓存和预热代码，破坏了“开发服务器仅作为轻量薄网关”的架构准则。

### 1.2 核心设计准则
1. **生产流水线 100% 复用**：策略树、滑窗管理（`StrategySeriesImputer`）、买卖点流水线（`ChanBspPipeline`）、决策流求值器（`DecisionFlowEvaluator`）与因子插件必须直接调用生产类，严禁手写伪计算。
2. **Bar 级切片推流驱动**：从 Sealed Candle / 完整 Bar 切入仿真，直接驱动策略时钟与周期推进，避免引入不必要的底层高频毫秒级 tick 聚合器与 Redis/BullMQ 基础设施开销。
3. **单向长连接推流 (SSE) + REST 控制**：服务端通过 `Server-Sent Events`（SSE）向前端单向推流，前端通过轻量 REST 指令控制播放、暂停、调速与步进。
4. **全状态几何同步 + K 线增量追加**：每推进一帧，几何图元（笔/段/中枢）全量下发最新状态，K 线增量追加。几十 KB 级极速传输，天然杜绝残影或不同步。
5. **双向步进与任意 Seek**：仿真引擎内置时序帧缓存与快照游标，不仅支持向前推流，还支持单步后退（Step Prev）与进度条任意 Seek，便于反复观测买卖点触发前后的形态演化。
6. **薄网关与领域核心严格解耦**：核心状态机沉淀在 `libs/strategy/src/simulation/`；`tools/strategy-dev/server.ts` 仅做路由胶水，彻底清理原有切片代码。
7. **全面废弃旧版独立 chan_bsp 分支，统一收敛至决策流策略树**：彻底删除原有孤立硬编码的 `chan_bsp` 执行通道，所有买卖点判定统一收归决策流（Decision Flow）策略树流程，由 `plugin.chan.bsp`（`ChanBspFactorPlugin`）作为决策树门禁/因子节点执行，实现全系统单一求值核心。

---

## 二、架构全景与数据流

```
+-----------------------------------------------------------------------------------+
|                             前端工作台 (mist-fe: /backtests)                      |
|  - TradingViewChart (增量追加 K 线，覆盖最新态几何图元)                               |
|  - BacktestReplayBar (播放/暂停/调速/单步前进/单步后退/任意 Seek 进度条)                |
|  - BacktestSignalTable & DecisionTraceDrawer (实时捕获买卖点与深度归因抽屉)          |
+--------------------------^-----------------------------------^--------------------+
                           | SSE 事件流 (text/event-stream)    | REST 控制指令
                           | GET /api/mist/v1/simulation/stream| POST /api/mist/v1/simulation/control
+--------------------------+-----------------------------------+--------------------+
|                      开发网关胶水层 (tools/strategy-dev/server.ts)                |
|  - POST /v1/simulation/start    (按标的/周期/策略创建仿真会话，预热并返回 session 元数据)|
|  - GET  /v1/simulation/stream   (SSE 事件流推送: 当前 Bar、几何 Commands、新触发信号) |
|  - POST /v1/simulation/control  (play / pause / step_next / step_prev / seek / speed)|
|  - POST /v1/simulation/stop     (主动销毁会话，释放时钟定时器与内存)                 |
|  - 客户端连接异常断开自动暂停推流保活                                                 |
+--------------------------^--------------------------------------------------------+
                           | 严格薄网关调用
+--------------------------+--------------------------------------------------------+
|                      核心仿真引擎 (libs/strategy/src/simulation/)                 |
|  - StrategySimulationEngine (纯领域计算核心，无 I/O，受严格单元测试守门):           |
|      * StrategySeriesImputer (生产级滑动窗口与对齐补齐)                            |
|      * ChanVisualAdapter.convert (生成当前时刻严格缠论点位几何图元)                 |
|      * 生产策略统一求值流水线 (ChanBspPipeline / DecisionFlowEvaluator)             |
|      * 四象限私有战术标准适配器 (输出规范化的 Signal 与 DecisionTrace)              |
|      * Timeline Frame Cache (轻量时间轴快照缓存，支持双向前进/后退/任意 Seek)       |
+-----------------------------------------------------------------------------------+
```

---

## 三、协议契约与接口设计

### 3.1 会话创建 (`POST /v1/simulation/start`)
- **请求体 (Request)**:
  ```json
  {
    "securityCode": "000001",
    "period": 30,
    "strategyId": "chan-four-quadrant-v1",
    "startDate": "2024-01-01T09:30:00.000Z",
    "endDate": "2026-03-01T15:00:00.000Z",
    "filterFenxingContainment": false
  }
  ```
- **响应体 (Response)**:
  ```json
  {
    "sessionId": "sim-1727332800000-abcd",
    "securityCode": "000001",
    "period": 30,
    "totalBars": 2412,
    "startIndex": 0,
    "currentCursor": 0,
    "preWarmBars": 600
  }
  ```

### 3.2 控制指令 (`POST /v1/simulation/control`)
- **请求体 (Request)**:
  ```json
  {
    "sessionId": "sim-1727332800000-abcd",
    "action": "play" | "pause" | "step_next" | "step_prev" | "seek" | "set_speed",
    "param": 500 // seek 目标下标，或 speed 毫秒值 (50ms ~ 2000ms)
  }
  ```

### 3.3 SSE 事件流 (`GET /v1/simulation/stream?sessionId=...`)
- **Header**:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
  - `X-Accel-Buffering: no`
- **事件 Payload 规范**:
  ```json
  event: frame
  data: {
    "sessionId": "sim-1727332800000-abcd",
    "cursor": 125,
    "total": 2412,
    "bar": {
      "time": "2024-03-01 10:30",
      "open": 10.52,
      "high": 10.65,
      "low": 10.48,
      "close": 10.60,
      "volume": 1250000,
      "amount": 13200000
    },
    "commands": [
      { "layer": "chan_bi", "type": "polyline", "points": [...] },
      { "layer": "chan_zs_bi", "type": "box", "bounds": [...] }
    ],
    "signals": [
      {
        "signalTime": "2024-03-01 10:30",
        "signalType": "first_buy",
        "badgeText": "1买",
        "triggerPrice": 10.60,
        "isBuy": true,
        "confidence": 0.85,
        "decisionTrace": {
          "quadrant": "LeftBuy",
          "action": "Buy",
          "factors": { "macd_divergence": true, "vol_shrink": 0.45 }
        }
      }
    ]
  }
  ```

---

## 四、模块规划与职责分层

| 层次 | 路径 | 核心职责 |
|------|------|----------|
| **核心领域模型** | `libs/strategy/src/simulation/strategy-simulation.types.ts` | 仿真会话、帧快照、控制动作与 SSE 事件契约 |
| **仿真帧状态机** | `libs/strategy/src/simulation/strategy-simulation.session.ts` | 维护游标推进、自动播放 Timer、双向 Seek、帧缓存 |
| **纯算力驱动引擎** | `libs/strategy/src/simulation/strategy-simulation.engine.ts` | 生产 Imputer 滑窗推进、ChanVisualAdapter 生成几何、策略/战术评估与信号收集 |
| **门禁单元测试** | `libs/strategy/src/simulation/strategy-simulation.engine.spec.ts` | 验证预热对齐、单步推进、Seek 回跳与信号一致性 |
| **薄网关胶水层** | `tools/strategy-dev/server.ts` | 暴露 SSE 与控制路由，彻底删除手写切片和模拟循环旧代码 |
| **前端 API 客户端** | `mist-fe/app/api/client.ts` | 增加仿真会话管理与 SSE `EventSource` 订阅封装 |
| **前端工作台** | `mist-fe/app/backtests/BacktestWorkspace.tsx` | 增加仿真模式开关，对接流式帧更新，驱动 TradingView 与播放条 |

---

## 五、历史代码清理与重构准则

1. **废弃旧式切片缓存**：
   - 彻底移除 `tools/strategy-dev/server.ts` 中的 `pointInTimeVisualCache` 与 `evaluateSignals` 内部手写的 `for (const k of fullKlines)` 伪回测循环；
   - 移除前端通过 `fetchVisualCommands({ endDate: timeKey })` 逐 Bar 请求全量截断图元的做法。
2. **统一策略归口**：
   - 所有回测列表与单步推演统一由 `StrategySimulationEngine` 提供支撑；
   - 严格守卫 `dev-server-boundary.guard.spec.ts` 架构红线。
3. **全面清理旧版 chan_bsp 孤立通道**：
   - 彻底废弃与清理原本孤立硬编码的 `chan_bsp` 执行分支；
   - 缠论买卖点与战术求值全面归口统一的决策流策略树（Decision Flow Tree），以 `plugin.chan.bsp`（`ChanBspFactorPlugin`）作为标准节点统一求值；
   - 彻底清理 `server.ts` 和评估服务中对 `chan_bsp` 的特化硬编码，全仓一律走策略树流程。

---

## 六、运行环境隔离与使用场景限制（严格仅限本地 Dev）

为保证生产环境的高可靠性与严格的架构边界，整个流式推演仿真体系（包含会话创建、控制指令、SSE 长连接推流与诊断快照导出）**严格仅允许在本地开发环境 (`local dev`) 中运行和调用，禁止在生产环境或公开网络中暴露**：

1. **后端网关刚性门禁 (`tools/strategy-dev/server.ts`)**：
   - **生产启动熔断**：`server.ts` 启动时强制校验 `process.env.NODE_ENV !== 'production'`，若在生产模式下启动直接退出进程；
   - **请求来源白名单**：所有 `/v1/simulation/*` 路由强制经由 `checkLocalDevAccess` 拦截，仅允许本地回环地址（`127.0.0.1`、`::1`、`localhost` 等）访问，非本地 IP 或生产调用一律返回 `403 Forbidden`；
   - **生产微服务零暴露**：生产环境中的主后端（`apps/mist`、`apps/backtest`、`apps/signal` 等）不挂载任何 `/v1/simulation/*` 路由与仿真调度器。

2. **前端客户端与工作台安全分流 (`mist-fe`)**：
   - **客户端防漏闸门 (`app/api/client.ts`)**：`startSimulation`、`controlSimulation`、`getSimulationStreamUrl`、`fetchSimulationDump` 均内置 `isLocalDevEnvironment()` 校验，在生产构建中直接拒绝请求；
   - **工作台双轨自适应 (`BacktestWorkspace.tsx`)**：
     - **本地开发环境 (`isDev = true`)**：激活全量 SSE 推演仿真长连接，支持播放/暂停/调速/步进/Seek 以及“📥 导出诊断快照”；
     - **生产/非本地环境 (`isDev = false`)**：自动降级为只读的离线历史复盘模式（基于 MySQL 已有回测结果切片展示），完全禁用并隐藏诊断快照导出按钮，界面明确标示 `[📜 历史复盘]`。
