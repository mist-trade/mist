# Design: add-dev-server-multi-period-backtest

## 1. 核心决策

### D1 数据供给：内存 replay port + 复用 `HistoricalBarSource.drive()`

dev server 不自写跨周期推进循环。新增 `InMemoryReplayPort`（tools/strategy-dev 内），
实现 `StrategyReplayMarketDataPort` 两个方法：

- `loadReplayWindow({period, endAt, requiredBars})`：从本地 JSON（parse cache 复用
  `provider.readKlineCache`）取 `endAt` 前最近 `requiredBars` 根，映射为
  `StrategyBar`（`selection: {kind:'canonical'}` 语义 = 本地拼接快照）；
- `readReplayPage({period, startAt, limit})`：页序返回，返回 `{bars, exhausted}`。

推进统一走 `HistoricalBarSource.drive(kernel, onSignal, onBar, onPushed)`：

- 归并序 = `(availabilityKey(bar), period)` 升序，与生产回测/实时触发到达序一致
  （三链路同构在 dev lane 成立）；
- `onBar` 仅求值周期触发 → broker 撮合 / 持仓 / 风控裁决 / NAV 日结全部挂 here；
- `onSignal` → 信号收集 + 委托下达（Next-Bar 撮合语义不变）；
- `onPushed` → `setImmediate` 让渡（每 50 根）+ 步进日志（每 500 根）保留。

`availabilityKey` 的周期标签约定（1m 左标、5/15/30/60m 右标、日线 00:00 身份）
由共享 helper 处理，本地数据必须满足同一约定（vendor_a 30m 右标、QMT 日线
00:00 身份——`dev:sync` 直出生产 k 表行，天然满足）。

### D2 context 推导：编译边界唯一实现复用

`stored-definition-compiler.ts` 私有函数 `deriveContextRequirements(flow)` 导出为
公共纯函数（入参补 registry 句柄以摆脱模块级单例），dev server 构造 plan 时调用。
插件未注册 / 声明非法 → 请求级有界错误（HTTP 422，`CONTEXT_REQUIREMENT_INVALID` /
`PLUGIN_UNREGISTERED`），严禁静默 `{}`。调用方请求体**不新增** context/lookback
字段（延续"策略定义不存调用方 lookback"契约）。

### D2a 存量定义本地重放（评测/对账零抄参）

- `strategyDefinitionId` 解析顺序：本地 `.data/strategy-definitions/<id>_v<n>.json`
  优先（gitignored；含私有参数，仅存本地）→ 现有 1/2/3 硬编码公共树保留；
- 命中本地文件 → 走编译边界统一入口 `compileStoredStrategyDefinition({kind, rule,
  signalKind})` → `{flow, requiredBarCount, contextRequirements}` 填充 plan——
  与生产 run 48 同一条编译路径，对账即"同定义同数据双 lane 比对"；
- `sync.ts --definition <id>` 负责导出（`strategy_definitions` +
  `strategy_versions` 最新版 rule）；未命中 → 422 `DEFINITION_NOT_FOUND`。
- 保密不变：公仓文件/guard 仅断言路径与 gitignore 状态，不出现任何参数字面量。

### D3 预热与公开相

沿用 `HistoricalBarSource` 契约：`publicFrom = options.startDate`（无 startDate 时
维持现行为=全量公开），预热按周期分别计（求值周期 `requiredBarCount=300` 保持；
context 周期取插件声明值）。`prewarmStatus` 聚合进响应诊断字段（新增
`prewarmStatus` / `perPeriodPrewarm`，只读诊断，不改既有字段）。

### D4 `sync.ts` 保真与容量

- **k_quality 关联**：SQL `LEFT JOIN k_quality q ON q.k_id = k.id`，按
  `volume_valid=0 → volume 置 NULL`、`amount_valid=0 → amount 置 NULL`（六掩码中
  OHLC 掩码命中即整行丢弃——与 finalizer 入库闸门口径一致）；
- **source 列**：`SELECT k.source` 落盘每行，dev 回放透传 `StrategyBar.source`；
- **紧凑 JSON**：大文件（>50k 行）`JSON.stringify(rows)` 无缩进；provider 解析缓存
  已按 mtime/size 失效，直接受益；
- **分段拉取**：按 `k_quality.caliber_epoch` / 年份分片循环拉取后本地合并，消除
  单次 `maxBuffer` 100MB 上限；分片边界以时间戳严格递增去重。

### D5 缓存与幂等

`getBacktestCacheKey` 追加 context 指纹（由推导结果序列化），避免同名请求因插件
升级声明变化而命中陈旧缓存。压力套件 runner 透传 `options`，多周期自动生效。

### D6 门禁

- `dev-server-boundary.guard.spec.ts` 新增断言：`tools/strategy-dev/**` 禁止出现
  自实现跨周期归并（禁词：自行排序/双指针合并模式；正招：必须 import
  `HistoricalBarSource`）；禁止在 dev server 中直连 MySQL（数据只经 `dev:sync`）；
- `dev-server-api-boundary.guard.spec.ts` 不变（评测仍必须走 HTTP API）；
- 保密红线不变：公仓不出现私有插件公式/参数。

## 2. 受影响文件

| 文件 | 改动 |
|---|---|
| `libs/strategy/src/decision-flow/stored-definition-compiler.ts` | 导出 `deriveContextRequirements`（参数化 registry） |
| `libs/strategy/src/index.ts` | barrel 导出 |
| `tools/strategy-dev/in-memory-replay-port.ts` | 新增：JSON → `StrategyReplayMarketDataPort` |
| `tools/strategy-dev/server.ts` | `runUnifiedSimulationBacktest` 改 drive 驱动；plan 多周期化；错误码 |
| `tools/strategy-dev/sync.ts` | k_quality JOIN、source 列、紧凑 JSON、分段拉取 |
| `libs/strategy/src/dev-server-boundary.guard.spec.ts` | 新增门禁断言 |
| `tools/strategy-dev/data/presets/*.json` | 30m 求值预设核对（context 不入 preset，由插件推导） |

## 3. 风险与对策

| 风险 | 对策 |
|---|---|
| 5m 全量 971k 行 JSON ~100MB+，内存/解析压力 | provider parse cache 已有；紧凑 JSON；必要时 dev:sync `--limit` 截近端，报告主口径用 30m+1d，5m context 按 2005 起全量跑一次冒烟 |
| 本地 JSON 与生产 canonical 漂移（sync 时刻快照） | 报告标注数据截止时间戳；同构对账以 run 48 区间为准 |
| vendor_a 早期量额废段污染量能因子 | k_quality JOIN 置 null，插件按 null 契约降级；报告 caveats 标注 |
| 11:30/15:00 终端桶 +1min 封存边界 | `availabilityKey` 共享 helper 统一处理，禁止本地重算 |
