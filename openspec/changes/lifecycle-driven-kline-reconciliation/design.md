# Design: lifecycle-driven-kline-reconciliation

> **详细生命周期全景规范参见**：[`specs/terminal-bridge-lifecycle-specification.md`](specs/terminal-bridge-lifecycle-specification.md)

## 一、系统架构与时序图

### 1. 终端启动触发、缺口自愈与 4 级校验全链路时序

```text
[用户/系统启动 TDX 或 QMT]
         │
         ▼
[终端内运行内置桥脚本]
         │ 1. init() 注册成功且状态进入 HEALTHY
         ▼
[桥脚本向 datasource 通报] ── POST /v1/{source}/bridge/heartbeat (独立心跳打卡)
         │
         ▼
[mist-datasource: Background Reconciler] (异步协程，不阻塞行情推流)
         │
         │ 2. 获取已闭合交易日缺口清单与基线检查点
         ├────────────────────────────────────────► GET /v1/collector/sync-manifest
         │                                          • 校验 source 身份 (TDX / QMT)
         │                                          • 读取 sync-checkpoints.json 基线
         │                                          • 查目标标的池 B (活跃订阅标的 + 归属指数)
         │ 3. 返回缺口清单 [{code, range: [start, end], missingDates, periods}] ◄───┘
         │
         ├───► 若缺口为空 (0 gaps): 记录一条 info 日志，秒级退出完毕。
         │
         ▼ 若存在缺口标的:
         │ 4. 本地驱动终端下载补全
         │    • TDX: 调本地 17709 refresh_kline
         │    • QMT: 调 ContextInfo.download_history_data(code, period, start, end)
         │
         │ 5. 本地提取缺口 Bar (纯读取，前复权)
         │
         │ 6. 分批打包 Push 入库 (Chunked 1000 bars/batch)
         ├────────────────────────────────────────► POST /v1/collector/push-bars
         │                                          • 事务写入 `k` 表，ON DUPLICATE KEY UPDATE
         │                                          • 触发【入库后 4 级全景校验】:
         │                                            - ① 单Bar几何 (价格>0, high>=open/close, low<=min)
         │                                            - ② 数量与单调性 (条数满格: day=1, 30m=8, 5m=48, 1m=240)
         │                                            - ③ 跨周期三维对账 (日K OHLCV 与 5m 极值和累加和无偏)
         │                                            - ④ 停牌免死判定 (suspend_flag 放行)
         │                                          • 校验 100% 通过 ──► 自动推进 sync-checkpoints.json
         │                                          • 记录 `collector_sync_events` 审计事实
         │ 7. 返回入库与校验结果 {savedCount, verifiedUntil, status} ◄───────────────┘
         │
         ▼
 8. 发送企微/飞书通知 (通过 notification 模块或 Webhook):
    "[客户端启动自愈] TDX 启动自愈完成：
     • 补齐 2026-11-11 的 4800 条 K 线
     • 4 级校验 100% 满格通过
     • 基线检查点已安全推进至 2026-11-11"
```

---

## 二、目标数据范畴规范（“补什么”业务法定规格）

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
  - **绝对封存**：`verified_until` 之前的所有历史视为 100% 完整，绝不做无谓扫描；
  - **缺口区间**：仅扫描和追赶 `(verified_until, latest_closed_trading_day]`，中间有任何断档空洞全量追赶；
  - **自动推进**：入库且 4 级校验通过后，自动向前推进 `verified_until`；
  - **人工干预**：支持操作员随时直接编辑该文件修改检查点日期。

### 3. 周期规格与派生规则
- **3 大核心必补周期**：
  - `DAY`（日线）：每天 1 条
  - `5m`（5分钟线）：每天 48 条（主力策略周期）
  - `30m`（30分钟线）：每天 8 条（高级别中枢周期）
- **派生大周期（条件追加）**：
  - `WEEK`（周线）：仅在周五收盘后补录 1 条
  - `MONTH`（月线）：仅在月末最后一个交易日收盘后补录 1 条
- **排除周期**：
  - 排除 `1m`（避免 TDX 本地历史无 1m 数据导致假缺失断言失败；策略不依赖 1m，排除后节约 80% 传输与存储）；
  - 排除 `15m` 与 `60m`。

### 4. 复权口径与字段集
- **复权口径**：全仓强制统一为**前复权（`front_ratio` / `front`）**。
- **扩展表字段落库**：
  - TDX: `forward_factor` (前复权因子), `vol_in_stock` (流通盘), `turnover_rate` (换手率) -> `k_extension_tdx`；
  - QMT: `pre_close` (昨收), `suspend_flag` (停牌标), `open_interest` (持仓量), `settle` (结算价) -> `k_extension_qmt`。

---

## 三、入库后 4 级全景校验守门门禁 (Post-Sync Verification Pipeline)

在 K 线批量写入数据库后，必须通过以下 4 级刚性核验，**全部通过方可推进 `verified_until`**：

1. **第 1 级：单 Bar 几何与因果律校验 (Geometry Invariant)**
   - 价格合法性：`open > 0, high > 0, low > 0, close > 0`
   - 几何包络性：`high >= max(open, close)` 且 `low <= min(open, close)`
   - 成交量与额：`volume >= 0` 且 `amount >= 0`
2. **第 2 级：数量与时序单调性校验 (Bar Count & Monotonicity)**
   - 时间戳严格单调递增（无重复、无逆序）
   - 条数满格判定：日线=1条，30m=8条，5m=48条（不多不少）
3. **第 3 级：跨周期三维对账校验 (Cross-Period Consistency) [终极核验]**
   - 日K `open` == 09:35 第一根 5m `open`
   - 日K `close` == 15:00 最后一根 5m `close`
   - 日K `high` == 当天 48 根 5m 中的 `max(high)`
   - 日K `low` == 当天 48 根 5m 中的 `min(low)`
   - 日K `volume` == 当天 48 根 5m 的 `volume` 累加和
4. **第 4 级：停牌股免死判定与检查点推进 (Suspended Whitelist & Checkpoint Advance)**
   - 若全天 0 根 Bar，核对券商 `suspend_flag` 或昨收：确认停牌则放行，记为 `SUSPENDED`；
   - 校验全部通过后，自动推进 `sync-checkpoints.json` 中的 `verified_until`；
   - 若校验有任何瑕疵，**拒绝推进检查点**，标记 `verify_failed` 并报警，保障下游策略零污染。

---

## 四、双桥（TDX vs QMT）整合方案与极简三态

### 1. 极简三态收敛
全系统只维护三个明确状态：
- `DEAD` (心跳死了)：>15s 无心跳或端口连接拒绝；
- `BROKER_DOWN` (心跳活着，行情挂了)：心跳正常，但券商通道断开或探针 Bar 拿不到当日数据；
- `HEALTHY` (正常存活)：心跳正常且券商数据通道通畅。**由非 HEALTHY 跃迁至 HEALTHY 时自动触发自愈对账**。

### 2. 显式心跳与命令解耦
- 独立端点：`POST /v1/{source}/bridge/heartbeat`（每 5s 一次）；
- 彻底剔除网关内部的 `busy_until` 脏补丁。

---

## 五、旧代码简化与深度清理清单

- **`mist-datasource` 清理项**：
  - 删除 `gateway.py` 中的 `busy_until`、`extend_busy_until()`；
  - 删除 `qmt/routes/bridge.py` 中的分裂订阅轮询路由，QMT 桥合并为单轮询，精简 ~400 行；
  - 收敛 `/health` 接口，顶层输出极简三态。
- **`mist` 主仓清理项**：
  - 彻底删除 `apps/schedule` 中的 22:30 和 06:30 Cron 方法与常量；
  - 解除 `schedule.module.ts` 对 `HistoricalCollectorModule` 的强依赖；
  - 废弃 `HistoryDownloadClient.pollUntilDone` 10 分钟轮询，抽取为轻量只读 `SyncManifestService`。
