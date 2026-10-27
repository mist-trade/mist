# Design: 回测盘中执行语义收口

## D1 架构事实（重梳后的地基，2026-10-27 用户纠正）

- **求值流 = 多周期合并流**：`HistoricalBarSource` 多序列化（多周期 change 3.1 已交付），
  k 路归并（同刻低周期先推）；kernel 多窗口（evaluationPeriod=30m 求值 + 日线 context
  黑板）；onBar/onSignal 仅对求值周期 bar 触发（3.2 已交付）；
- **执行层复用同一条流**：broker/arbiter/position 只见求值周期（30m）bar——不存在独立
  的"执行流"；K 线数据同源同序，策略层发信号后执行层才下单，因果天然有序；
- **本 change 是执行语义的收口与修正**，不再做"升粒度"（粒度已随求值周期天然就位）。

## D2 cooldown 机制整体移除（用户拍板 2026-10-27）

- 现状：`ExecutionRiskArbiter.defaultCooldownBars ?? 3`，executor 传 3；硬止损
  （risk exit）后 `triggerCooldown()`，每次 arbitrate 递减 1，激活期拒绝开仓；
- 两层问题：① 30m 求值下按 bar 递减，3 bars = 1.5 小时（语义漂移）；② 强制冷却本身
  会错过最终的开仓点（止损后买点重现应立即允许再入场）；
- 决策：**机制整体删除**——`defaultCooldownBars`/`cooldownRemainingBars`/
  `triggerCooldown`/`getCooldownRemainingBars` 及调用点全部移除，executor 构造
  不再传参；硬止损后的再入场完全由策略信号决定；
- 既有 cooldown 单测删除。

## D3 涨跌停昨收基准（自管理机制 + 首日注入）

- **次日起已正确**：broker `onBar` 按"日期跳变"自管理 `dailyPreCloseMap`——新交易日
  取前一交易日最后一根 bar 的收盘为昨收；30m 求值下即前日 15:00 30m 收盘（canonical
  数据与日线收盘一致）；一字板判定（open==high==low==close==涨停价）在 30m 上比日线
  更精确（半小时级一字）；
- **首日缺口**：executor `registerSecurity(securityCode, { name })` 未传 `preClose`
  → 首日回退 `bar.open`，一字板判定失真；
- 修复：executor 从回放 prewarm/日线 context 取**回放起点前一交易日收盘**，注册时注入
  `preClose`（broker 接口已支持，零接口变更）；prewarm 无前置 bar 时保持现有回退，
  不强行造数。

## D4 T+1 盘中边界（行为已正确，补显式回归锁）

- broker 层按 `frozenQuantity` 实现：当日买入全量冻结，`settleDayClose` 时
  `availableQuantity += frozen`——**与撮合粒度无关**；
- 30m 场景推演：D 日 10:30 30m bar 买入 → D 日 13:00 30m bar 卖单被 `isT1Locked`
  拒绝（frozen ≥ quantity）→ D 日 15:00 结算解锁 → D+1 首根 30m bar 可卖；
- 本 change 补显式单测锁定该序列（多周期重构时的护栏），无代码变更预期。

## D5 30m 缺失（删除初版降级设计，用户拍板）

- 历史缺损 → **数据源职责**：修数据或第三方补数（vendor/QMT 补录 change 在途）；
- 停牌 → 灌数前缺口处理函数已覆盖；停牌日本就无 bar、无交易机会；
- 合并流中缺 bar = 当日无撮合机会，如实不造数（仓库"缺口不补"原则）；
- 回测层不设降级、不回退日线撮合、不记标记。

## D6 绩效口径（不变，回归锁）

- NAV 仍每日一次日结（求值周期 session-close bar，3.2 已保证"每日恰好一次"）；
- 统一组合夏普 / max_drawdown / max_underwater_duration 口径全部不变；
- 既有绩效逐位断言全部保留为回归锁。

## D7 测试策略

- **arbiter**：默认无冷却（止损后下一信号 bar 允许再入场）；显式 triggerCooldown 仍生效；
- **executor**：注册 preClose 后首日一字板买入拒单断言；
- **broker/position**：T+1 盘中边界序列（D 10:30 买 → D 13:00 卖被拒 → 结算 → D+1 可卖）；
- **既有用例**：30m 撮合/止损/NAV 日结相关测试全部保留（多周期 change 已建），仅
  cooldown 相关按新语义改写。

## D8 验证命令

- `pnpm -C mist test libs/strategy/src/execution apps/backtest`
- 三大刚性守卫（薄网关/同构/双时间戳）+ `test:ci` 全绿 + `typecheck` + `lint:check`
- `openspec validate add-backtest-intraday-execution --strict`
