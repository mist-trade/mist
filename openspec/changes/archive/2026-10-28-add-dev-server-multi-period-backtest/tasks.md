# Tasks: add-dev-server-multi-period-backtest

## Phase 1: context 推导复用（libs/strategy）

- [x] 1.1 `stored-definition-compiler.ts`：`deriveContextRequirements(flow, registry)`
  参数化 registry 并导出；`compileStoredDefinitionVersion` 同步支持显式 registry
  （dev lane 解析外部私有插件必需）；缺省 = 全局单例 + 自动补注册（生产路径零变化）
- [x] 1.2 单测：plugin 未注册 → 有界错误；声明非法（非正整数）→ 有界错误；
  多插件取 max 合并；无声明 → `{}`；自定义 registry 同语义
  （`stored-definition-compiler.context.spec.ts`，10 用例）

## Phase 2: 内存 replay port

- [x] 2.1 `libs/strategy/src/kernel/adapters/in-memory-replay-port.ts`：per-period
  内存序列 + `loadReplayWindow`（endAt 严格早于 + 最近 N 根）/ `readReplayPage`
  （页序 + nextAfterTimestamp 链 + 耗尽判定）；构造校验缺失周期 →
  `ReplaySeriesMissingError`（附 dev:sync 提示）、时间戳非严格递增抛错。
  落位调整：libs（入 jest roots）而非 tools/，dev server 构造时注入序列——
  spec 语义不变
- [x] 2.2 单测：窗口截取严格性、分页翻页与耗尽、`afterTimestamp` 不重复、
  缺周期报错、乱序拒收（8 用例）

## Phase 3: 回测路径多周期化（tools/strategy-dev/server.ts）

- [x] 3.0 存量定义本地重放：`.data/strategy-definitions/<id>_v<n>.json` 命中时走
  `compileStoredDefinitionVersion`（显式 registry）编译（flow/contextRequirements
  与生产同源）；内置预设仅 1/2/3，其余 id 缺文件 → 422 `DEFINITION_NOT_FOUND`
- [x] 3.1 `runUnifiedSimulationBacktest`：删除手写 `for (bars)` 推进循环，改
  `HistoricalBarSource.drive()`；onBar（求值周期）承载日结/撮合/持仓/风控裁决，
  onSignal 承载信号收集与委托下达，onPushed 承载让渡与日志
  （已知语义注记：drive 序为 push→onBar→onSignal，同 Bar 风控单先于信号单下达，
  与旧循环相反；两者皆清仓卖单，经济结果等价——代码注释已记录）
- [x] 3.2 plan 构造：`contextRequirements = deriveContextRequirements(flow, registry)`；
  请求级错误映射：StoredDefinitionCompileError → 422、`DATA_MISSING`
  （context 周期数据缺文件）、`DEFINITION_NOT_FOUND`、
  `DEFINITION_EXPORT_INVALID`
- [x] 3.3 响应诊断：`replay`（prewarmStatus/prewarmActual/barCount/publicBarCount/
  perPeriodPrewarm）只读字段；既有字段零破坏
- [x] 3.4 `getBacktestCacheKey` 追加 context 指纹 + definitionVersionLabel；
  压力套件 runner 透传 strategyDefinitionId/enableStopLoss；
  `DEV_SERVER_AUTOSTART=false` 会话级复用开关 + `runUnifiedSimulationBacktest` 导出
- [x] 3.5 会话级单测（`apps/test/strategy-dev-multi-period-backtest.spec.ts`，
  6 用例）：单周期信号因果与预热诊断、多周期归并 + per-period 预热、
  context 缺数据 422、未注册插件 422、存量定义重放
  （definitionVersionLabel + 编译生效）、未知定义 422

## Phase 4: sync 保真（tools/strategy-dev/sync.ts + provider.ts）

- [x] 4.0 `--definition <id>` 模式：导出 `strategy_definitions` + 最新
  `strategy_versions.rule` 至私仓 `mist-alpha-private/market-data/strategy-definitions/<id>_v<n>.json`
  （gitignored，含私有参数仅存本地）；README 注明保密红线
- [x] 4.1 SQL：`LEFT JOIN k_quality`；**默认裸值透传（生产回测不消费掩码，对账
  同数据）**；`--mask-quality` opt-in：OHLC 任一掩码失效 → 整行丢弃、量/额失效 →
  NULL；SELECT 增加 `k.source` 并落盘每行
- [x] 4.2 分段拉取：canonical 分段 ∩ 年份桶分片循环 + 本地时间戳合并去重
  （5m 一年 ≈ 46k 行，maxBuffer 安全）
- [x] 4.3 大序列紧凑 JSON（>50k 行无缩进）；README 用法补记
- [x] 4.4 provider `exact` 选项：多周期装载禁用"同 symbol 任意数据集"静默回退
  （会话测试实锤该回退会用 30m 冒充 1d context——数据污染防线）

## Phase 5: 门禁与验证

- [x] 5.1 `dev-server-boundary.guard.spec.ts` 新增断言：必须 import
  `HistoricalBarSource`；禁 `mergeByAvailability`/`kernel/availability` 直算；
  禁硬编码 contextRequirements 字面量；禁 `execSync|mysql|docker exec` 直连 DB
- [x] 5.2 `pnpm -C mist typecheck` 全绿；三大守卫 +
  `dev-server-api-boundary.guard.spec.ts` 全绿（21/21）；触及文件 eslint 零违规；
  `test:ci` 全量结果见 change evidence（提交前附）
- [x] 5.3 数据同步（操作，2026-10-27）：`pnpm dev:sync --code 000001 --periods 1d,30m,5m` 全量
  - 30m 41,335 行（2005-01-04 → 2026-10-26，vendor_a 38,855 + qmt 2,480）
  - 5m 248,005 行（同区间，紧凑 JSON）；1d 7,464 行（1996→2026-10-15，qmt——生产库日线即此范围）
  - 数据落点已迁私仓 `mist-alpha-private/market-data/kline/`（随私仓提交 ac4dac9）
- [x] 5.4 同构对账（验收，2026-10-27 PASS）：`pnpm dev:sync --definition 23` 导出
  （run 48 = strategyVersionId 23 → definition 23 v1）→ 私仓 dist 重建 → dev HTTP
  回测 2005-01-04T00:00+08 → 2026-10-20T23:59+08（strategyDefinitionId=23，
  编译路径与生产同源）→ 信号逐条一致：
  - ① signalTime 2008-03-03 10:00(+08) / pivot 02-29 11:00 / third_sell(3卖) /
    tag E2E_MULTI_PERIOD / confidence 90 —— 与 run 48 落库行全等
  - ② signalTime 2012-06-14 14:30(+08) / pivot 06-13 15:00 —— 全等
  - 决策证据链 degraded=true 节点数 = 0（extractor_bull/extractor_bear 均 live）
  - 预热诊断：插件声明 5=40 / 30=200 / 1440=10，与 run 48 记录逐字一致
  - 复算耗时 ~14 分钟/全窗（42k 求值 Bar + 3 周期归并）
- [ ] 5.5 `openspec validate add-dev-server-multi-period-backtest --strict` 通过；
  按 governance guide 逐项校对后归档

## Phase 6: 评测报告（操作，非代码）

- [x] 6.1 评测矩阵 9/9 组重跑完成（2026-10-28）：基准纯缠论 / 5 单因子消融 /
  复合 composite / 全增强树 def3 / 定义23树，全窗 2005-01-04→2026-10-26；
  结果 + 信号明细 + 复用 manifest 存档私仓
  `market-data/backtest-results/2026-10-28-multilevel-30m/`
- [x] 6.2 五大压力沙盒（⑦ composite 载体）：ROBUST / 健康分 75 / 无破产 /
  最差单日 −2.53%（CRASH_2015 SAFE 3.36%、CIRCUIT_2016 SAFE 0%、BEAR_2018
  WARNING 11.53%、SQUEEZE_2024 SAFE 1.55%、PULSE_2024 SAFE 0%）
- [x] 6.3 更新版夏普率对比报告已贴对话界面（2026-10-28 最终版，含 caveats）
