# Tasks: 回测盘中执行语义收口

> 分阶段门禁：每阶段完成即停顿汇报；未获批准不进入下一阶段。

---

## Phase 1: 执行层修正（libs/strategy/execution）

- [x] **1.1** arbiter 冷却机制整体删除（options/计数器/trigger/查询/调用点/executor
  传参）；既有 cooldown 单测删除
- [x] **1.2** T+1 盘中边界回归锁：D 日 10:30 30m bar 买入 → D 日 13:00 30m bar 卖单
  被 frozen 拒绝 → 日结算 → D+1 首根 30m bar 可卖
- [x] **1.3** 门禁：`pnpm -C mist test libs/strategy/src/execution && pnpm -C mist typecheck`

## Phase 2: executor 首日昨收注入（apps/backtest）

- [x] **2.1** 回放起点前一交易日收盘从 prewarm/日线 context 提取，
  `registerSecurity(code, { name, preClose })` 注入；无前置 bar 保持回退
- [x] **2.2** 单测：首日一字涨停买入拒单（preClose 生效）；无前置 bar 回退路径断言
- [x] **2.3** 门禁：三大刚性守卫（薄网关/同构/双时间戳）+ `apps/backtest` 全测

## Phase 3: 验证基线

- [x] **3.1** `pnpm -C mist test:ci` 全绿
- [x] **3.2** `typecheck` / `lint:check` 绿；`check:magic` 新增违规为 0
- [x] **3.3** `openspec validate add-backtest-intraday-execution --strict` 0 错误 0 警告
- [x] **3.4** 汇报：自动化通过 / 跳过项（本 change 无生产 HIL——无 DB/部署变更）
