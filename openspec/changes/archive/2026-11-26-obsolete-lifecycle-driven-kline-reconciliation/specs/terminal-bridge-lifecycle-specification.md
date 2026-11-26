# Terminal Bridge Lifecycle Specification (极简三态生命周期全景规范)

## 一、规范目标与三态哲学
终端健康度的本质只需回答两个问题：
1. **进程与脚本还活着吗？**（心跳有没有）
2. **能拿到有效行情/数据吗？**（券商通道通不通）

基于此，彻底摒弃多重复杂状态机，全系统统一收敛为**极简三态模型 (3 Canonical States)**：

```text
                     ┌────────────────────────────────────────┐
                     │            极简三态模型 (3 States)       │
                     └────────────────────────────────────────┘

    [状态 1: DEAD] ────────────────── 客户端未启动、崩溃退出、死锁卡死
    (心跳死了)                         • 判定：>15s 无心跳，或本地端口连接拒绝

         │ 启动/注册成功
         ▼
    [状态 2: BROKER_DOWN] ─────────── 进程与桥脚本活着，但券商行情通道断开
    (心跳活着，行情挂了)               • 判定：心跳正常，但无数据流/探针返回非当日

         │ 券商网络畅通/开市
         ▼
    [状态 3: HEALTHY] ─────────────── 心跳正常，且能正常获取行情/K线数据
    (正常存活)                         • 判定：心跳正常 且 券商数据通道就绪
                                      • 触发：一旦由 DEAD/BROKER_DOWN 进入 HEALTHY，
                                              自动触发一次后台缺口对账与补录！
```

---

## 二、状态定义与判定契约

| 状态标识 | 中文定义 | 客观判定物理事实 | 外部能力与行为 |
| :--- | :--- | :--- | :--- |
| **`DEAD`** | **心跳死了** | 超过 15 秒未收到独立心跳包，或者宿主机进程/端口不可达 | 网关标记 `ready=false`，拒收任何业务命令，触发告警。 |
| **`BROKER_DOWN`** | **心跳活着，行情挂了** | 独立心跳每 5 秒正常上报，但券商 TCP 断开、或上证指数探针 Bar 无法读出当日数据 | 网关标记 `ready=false, degraded=true`，静默等待重连，暂停推流。 |
| **`HEALTHY`** | **正常存活** | 独立心跳正常 且 券商行情/数据探针验证有效 | 网关标记 `ready=true, degraded=false`，全面承接行情广播与数据读取；**自愈触发补齐**。 |

---

## 三、三态跃迁与历史补全的自然对齐

将历史 K 线的补齐自愈，直接挂载在状态机的自然跃迁上：

1. **跃迁规则（`DEAD -> HEALTHY` 或 `BROKER_DOWN -> HEALTHY`）**：
   - 当终端完成开机登录（已有 `register_owner`），且探针核验券商就绪、状态进入 `HEALTHY` 时：
   - 网关**异步启动一次缺口对账任务**：
     1. `GET /v1/collector/sync-manifest` 获取目标标的与待追赶缺口区间；
     2. 缺口为空则秒级结束；
     3. 缺口存在则驱动本地客户端（QMT `download_history_data` / TDX `refresh_kline`）下载并提取；
     4. 打包分批调用 `POST /v1/collector/push-bars` 灌入主库；
     5. 触发**入库后 4 级全景校验**，校验全部通过后自动推进检查点；
     6. 记录 `collector_sync_events` 审计日志并发送企微/飞书通知。
2. **时段守门（Activity Window Invariant）**：
   - 盘中（09:15-15:00）：`sync-manifest` 严格只返回**前一交易日**缺口，绝不把今天未收盘的半截日K纳入补齐，且严禁长耗时大下载；
   - 盘后（>= 15:30）：`sync-manifest` 返回**当日（最新收盘日）**缺口，完成权威入库。

---

## 四、显式独立心跳契约 (`POST /v1/{source}/bridge/heartbeat`)

1. **彻底解耦**：
   - 增加纯粹的轻量心跳接口，请求体仅携带 `{ ownerId, leaseToken, generation, timestamp }`；
   - 客户端以独立的 5 秒非阻塞定时器打卡；
   - 业务轮询（Poll）和历史下载无论耗时多久，心跳定时器绝不阻塞。
2. **剔除脏补丁**：
   - 彻底删除网关中用于为长任务延寿的 `busy_until`、`extend_busy_until` 脏代码。

---

## 五、目标数据范畴规范（“补什么”业务法定规格）

### 1. 标的池界定与严格分工
- **基础标的池**：严格基于**池子 B（`realtime_subscription_assignments` 活跃订阅池）**，不扫描全量不相关的自选股。
- **核心大盘指数（永驻必补）**：
  - **QMT 专属**：`000001`（上证指数）、`399006`（创业板指）、`000688`（科创50，交易所官方标准全推）；
  - **TDX 专属**：`880003`（全A平均股价，通达信专有板块指数）。
- **严格各司其职**：
  - TDX 客户端启动时：仅返回归属 TDX 的订阅标的 + `880003`；
  - QMT 客户端启动时：仅返回归属 QMT 的订阅标的 + 官方三指数；
  - 双方互不越界，绝对保护大 QMT 桥不被过量股票拖垮。

### 2. 基线检查点机制（`sync-checkpoints.json`）
- 本地维护检查点状态文件（`mist/.data/sync-checkpoints.json`）：
  ```json
  {
    "880003": {
      "source": "tdx",
      "verified_until": "2026-11-01",
      "comment": "人工已补全该日期前的全量历史"
    },
    "000001": {
      "source": "qmt",
      "verified_until": "2026-11-05"
    }
  }
  ```
- **核心行为**：
  - 绝对封存：`verified_until` 之前的所有历史视为 100% 完整，绝不做无谓扫描；
  - 缺口区间：仅扫描和追赶 `(verified_until, latest_closed_trading_day]`，中间有任何断档空洞全量追赶；
  - 自动推进：入库且 4 级校验通过后，自动向前推进 `verified_until`；
  - 人工干预：支持操作员随时直接编辑该文件修改检查点日期。

### 3. 周期规格与派生规则
- **3 大核心必补周期**：
  - `DAY`（日线）：每天 1 条
  - `5m`（5分钟线）：每天 48 条（主力策略运行周期）
  - `30m`（30分钟线）：每天 8 条（高级别中枢与买卖点周期）
- **派生大周期（条件追加）**：
  - `WEEK`（周线）：仅在周五收盘后补录 1 条
  - `MONTH`（月线）：仅在月末最后一个交易日收盘后补录 1 条
- **明确排除周期**：
  - 排除 `1m`（通达信本地历史不下载/不常备 1m，避免无源假缺失断言失败；同时策略不依赖 1m，排除后节约 80% 传输与存储）；
  - 排除 `15m` 与 `60m`（全仓均无依赖）。

### 4. 复权口径与字段集
- **复权口径**：全仓强制统一为**前复权（`front_ratio` / `front`）**。
- **扩展表字段落库**：
  - TDX: `forward_factor` (前复权因子), `vol_in_stock` (流通盘), `turnover_rate` (换手率) -> `k_extension_tdx`；
  - QMT: `pre_close` (昨收), `suspend_flag` (停牌标), `open_interest` (持仓量), `settle` (结算价) -> `k_extension_qmt`。

---

## 六、入库后 4 级全景校验守门门禁 (Post-Sync Verification Pipeline)

在 K 线批量写入数据库后，必须通过以下 4 级刚性核验，**全部通过方可推进 `verified_until`**：

```text
 边缘端推入 K 线 ──► MySQL 事务写入
                        │
                        ▼ (触发入库后校验器)
 ┌──────────────────────────────────────────────────────────────┐
 │ 1. 单 Bar 几何与因果律校验 (Geometry Invariant)               │
 │    • 价格合法性: open > 0, high > 0, low > 0, close > 0      │
 │    • 几何包络性: high >= max(open, close) 且 low <= min(...) │
 │    • 成交量与额: volume >= 0 且 amount >= 0                  │
 ├──────────────────────────────────────────────────────────────┤
 │ 2. 数量与时序单调性校验 (Bar Count & Monotonicity)           │
 │    • 时间戳严格单调递增 (无重复、无逆序)                       │
 │    • 条数满格判定:                                           │
 │      - 日线: 1 条                                            │
 │      - 30分钟: 8 条 (不多不少)                               │
 │      - 5分钟: 48 条 (不多不少)                               │
 ├──────────────────────────────────────────────────────────────┤
 │ 3. 跨周期三维对账校验 (Cross-Period Consistency) [终极核验]   │
 │    • 日K open  == 9:35 第一根 5m open                        │
 │    • 日K close == 15:00 最后一根 5m close                    │
 │    • 日K high  == 当天 48 根 5m 中的 max(high)                │
 │    • 日K low   == 当天 48 根 5m 中的 min(low)                 │
 │    • 日K volume == 当天 48 根 5m 的 volume 累加和            │
 ├──────────────────────────────────────────────────────────────┤
 │ 4. 停牌股免死判定 (Suspended Whitelist)                      │
 │    • 若全天 0 根 Bar，核对券商 suspend_flag 或昨收:          │
 │      确认停牌则放行，记为 SUSPENDED，不卡流水线。            │
 └──────────────────────────────┬───────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼ (全部通过)                                     ▼ (有任一瑕疵)
 [推进基线检查点]                                 [拒绝推进检查点]
 自动将 verified_until 推进到该日                标记 status='verify_failed'
 记录审计表，广播成功通知                        发送告警通知（附带具体哪根 Bar 瑕疵）
```

---

## 七、旧代码简化与深度清理清单 (Legacy Pruning Checklist)

本次架构改造伴随对存量代码的全面瘦身：

### 1. `mist-datasource` 仓库清理项
- **删除网关 `busy_until` 代码**：
  - 文件：[`src/datasource/qmt/realtime/gateway.py`](file:///Users/moyui/sean/mist/mist-datasource/src/datasource/qmt/realtime/gateway.py)
  - 清理：彻底移除 `self._busy_until`、`extend_busy_until()` 以及相关延寿逻辑。
- **删除 QMT 分裂的订阅轮询通道**：
  - 文件：[`qmt/routes/bridge.py`](file:///Users/moyui/sean/mist/mist-datasource/qmt/routes/bridge.py) 与 [`mist_qmt_realtime_bridge.py`](file:///Users/moyui/sean/mist/mist-datasource/qmt/builtin_bridge/mist_qmt_realtime_bridge.py)
  - 清理：删除冗余的 `/qmt/bridge/subscription/poll` 与 `/subscription/result` 路由，合并双轮询为单轮询，精简约 400 行桥代码。
- **收敛 `/health` 接口输出**：
  - 文件：[`src/ws/health_contract.py`](file:///Users/moyui/sean/mist/mist-datasource/src/ws/health_contract.py)
  - 清理：收敛繁杂字段，顶层显式输出极简三态 `state: "DEAD" | "BROKER_DOWN" | "HEALTHY"`。

### 2. `mist` 主仓库清理项
- **删除主仓库定时器及常量**：
  - 文件：[`apps/schedule/src/data-collection.controller.ts`](file:///Users/moyui/sean/mist/mist/apps/schedule/src/data-collection.controller.ts)
  - 清理：彻底删除 `@Cron(CRON_POST_CLOSE_SYNC_NIGHTLY_2230)` 及 `handleNightlyPostCloseSync()`；
  - 清理：彻底删除 `@Cron(CRON_POST_CLOSE_SYNC_MORNING_0630)` 及 `handleMorningRetrySync()`；
  - 清理：[`libs/timezone/src/cron-schedules.constants.ts`](file:///Users/moyui/sean/mist/mist/libs/timezone/src/cron-schedules.constants.ts) 中对应的两个 Cron 常量。
- **瘦身 Collector 同步服务**：
  - 文件：[`apps/mist/src/collector/post-close-sync.service.ts`](file:///Users/moyui/sean/mist/mist/apps/mist/src/collector/post-close-sync.service.ts)
  - 清理：废除容易因网络异常裸抛崩溃的 10 分钟轮询（`HistoryDownloadClient.pollUntilDone`），将其查缺口逻辑抽取为轻量只读的 `SyncManifestService`。
- **清理旧单测**：
  - 更新 `apps/schedule/src/data-collection.controller.spec.ts`，移除旧 Cron 断言，专注于盘前巡检保护。
