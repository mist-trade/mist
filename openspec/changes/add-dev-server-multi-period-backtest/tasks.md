# Tasks: add-dev-server-multi-period-backtest

## Phase 1: context 推导复用（libs/strategy）

- [ ] 1.1 `stored-definition-compiler.ts`：`deriveContextRequirements(flow, registry)`
  参数化 registry 并导出；仓内唯一调用点同步改造；`index.ts` barrel 导出
- [ ] 1.2 单测：plugin 未注册 → 有界错误；声明非法（非正整数）→ 有界错误；
  多插件取 max 合并；无声明 → `{}`（等价现状）

## Phase 2: 内存 replay port（tools/strategy-dev）

- [ ] 2.1 新增 `in-memory-replay-port.ts`：per-period JSON 流 +
  `loadReplayWindow`（endAt 前最近 N 根）/ `readReplayPage`（页序 + exhausted）；
  `StrategyBar` 构造含每行 `source`；复用 `provider.readKlineCache`
- [ ] 2.2 单测：跨周期窗口截取、`availabilityKey` 会话终端桶边界（11:30/15:00 +1min）、
  数据文件缺失 → 有界错误（附 `dev:sync` 提示）、时间戳严格递增断言

## Phase 3: 回测路径多周期化（tools/strategy-dev/server.ts）

- [ ] 3.0 存量定义本地重放：`.data/strategy-definitions/<id>_v<n>.json` 命中时走
  `compileStoredStrategyDefinition` 编译（flow/contextRequirements 与生产同源）；
  未命中且非 1/2/3 → 422 `DEFINITION_NOT_FOUND`；单测：本地定义编译 plan 与
  生产编译产物字段一致（同 rule JSON 双侧编译对账）

- [ ] 3.1 `runUnifiedSimulationBacktest`：删除手写 `for (bars)` 推进循环，改
  `HistoricalBarSource.drive()`；onBar（求值周期）承载日结/撮合/持仓/风控裁决，
  onSignal 承载信号收集与委托下达，onPushed 承载让渡与日志
- [ ] 3.2 plan 构造：`contextRequirements = deriveContextRequirements(flow, registry)`；
  请求级错误码 `PLUGIN_UNREGISTERED` / `CONTEXT_REQUIREMENT_INVALID`（HTTP 422）
- [ ] 3.3 响应诊断：`prewarmStatus` + `perPeriodPrewarm` 只读字段；既有字段零破坏
- [ ] 3.4 `getBacktestCacheKey` 追加 context 指纹；压力套件 runner 透传
- [ ] 3.5 单测（node 内存会话级）：同一 bar 序列下手写序 vs drive 序信号逐条一致
  （以既有纯 chan 预设对账）；context 缺文件 → 422；context bar 不产生 broker 变动

## Phase 4: sync 保真（tools/strategy-dev/sync.ts）

- [ ] 4.0 `--definition <id>` 模式：导出 `strategy_definitions` + 最新
  `strategy_versions.rule` 至 `mist/.data/strategy-definitions/<id>_v<n>.json`
  （gitignored，含私有参数仅存本地）；README 注明保密红线

- [ ] 4.1 SQL：`LEFT JOIN k_quality`；`volume_valid=0 → NULL`、`amount_valid=0 → NULL`、
  OHLC 任一掩码失效 → 整行丢弃；SELECT 增加 `k.source` 并落盘每行
- [ ] 4.2 分段拉取：按年份分片循环 + 本地按时间戳合并去重；消除 maxBuffer 溢出
- [ ] 4.3 大序列紧凑 JSON（>50k 行无缩进）；README 用法补记

## Phase 5: 门禁与验证

- [ ] 5.1 `dev-server-boundary.guard.spec.ts`：禁自写跨周期归并（必须 import
  `HistoricalBarSource`）；禁 dev server 直连 MySQL
- [ ] 5.2 `pnpm -C mist typecheck`；三大守卫 +
  `dev-server-api-boundary.guard.spec.ts` 全绿；`pnpm -C mist test:ci` 全绿
- [ ] 5.3 数据同步（操作）：`pnpm dev:sync --code 000001 --periods 1d,30m,5m`
  （limit 0 全量），核对三份文件起止时间戳 = 2005-01-04 → 最新收盘
- [ ] 5.4 同构对账（验收）：`pnpm dev:sync --definition <run48定义id>` 导出存量
  定义 → 本地重放（`strategyDefinitionId` 编译路径，与生产同源），dev HTTP 回测
  2005-01-04 → 2026-10-20，信号与生产 run 48（2008-03-03 / 2012-06-14 段级三卖）
  逐条一致；`evidence.degraded` 不为 true
- [ ] 5.5 `openspec validate add-dev-server-multi-period-backtest --strict` 通过；
  按 governance guide 逐项校对后归档

## Phase 6: 评测报告（操作，非代码）

- [ ] 6.1 经 `POST /v1/strategy-backtests` 重跑评测矩阵：单因子消融组 + 复合决策流组
  （30m 求值，context 由插件推导），区间 2005-01-04 → 最新
- [ ] 6.2 `runStressSuite=true` 跑五大历史压力沙盒，输出生存评级
- [ ] 6.3 汇总更新版夏普率对比报告（对比矩阵 + 消融增益 + caveats），完整贴对话界面
