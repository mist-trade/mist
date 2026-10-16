# 任务清单：斐波那契锚点迁移到缠论笔/段端点

- [x] **阶段一：因子插件迁移（`libs/strategy`）**
  - [x] 1.1 `fibonacci.plugin.ts` 锚点改造：新建共享 `analysis/chan-derivation.ts`（`toChanKSeries` / `deriveCompletedBis/Duans` / `findLastCompletedSwing`），经 `@app/chancore` 推导笔/段并按 `Complete && Valid` 过滤取最近一根；`units: 'bi' | 'duan'` 参数（默认 `'bi'`），移除 `period`；levels / zone / isGoldenPocket 复用 `computeStaticSwingFibonacci`；无已完成单元或根数不足 → `NEUTRAL`（禁止 rolling 回退）；`evidence` 增加 units / swingDirection / 起止时间 / swingHigh / swingLow；版本升至 2.0.0。
  - [x] 1.2 `fibonacci.ts`（rolling 算子）JSDoc 声明窗口口径（滚动窗口极值、恒从高点向下计 ratio，非缠论笔/段端点），算子保留。
  - [x] 1.3 `chan-bsp.plugin.ts` 改用共享 `toChanKSeries`（删除私有重复实现，行为不变，既有测试守门通过）。
- [x] **阶段二：可视化同源切换（`libs/visual-command`）**
  - [x] 2.1 `fibonacci-visual.adapter.ts` 改用同一套"最近已确认笔/段"锚点（新增本地 `chan-swing.util.ts`）；输入类型改为 `ChanK[]`；绘图跨度 = 摆动起点 → 最新 bar；无已完成摆动 → 空指令集；选项移除 `period`、新增 `units`。
  - [x] 2.2 `visual-command.service.ts` 接线：`fibOptions` 类型透传（服务无需逻辑改动，klines 已是 `ChanK[]`）。
- [x] **阶段三：测试、影响面与门禁**
  - [x] 3.1 `fibonacci.plugin.spec.ts` 重写：合成序列经真实 ChanCore 验证（向上笔 89.5→108.5 回撤 61.6% → BUY；向下笔 110.5→97.5 反弹 54.6% → SELL；单调序列无笔 → NEUTRAL 且无 rolling 锚；`units: 'duan'` 无段/根数不足 → NEUTRAL；evidence 锚点断言；确定性断言）。
  - [x] 3.2 可视化 spec：存在摆动 → 5 band / 7 line / 7 text 与 TradingView 样式 + 跨度（起点=笔起点）断言；无摆动 → fib 层为空；service spec 同步更新。
  - [x] 3.3 检索生产 DB 中引用 `plugin.technical.fibonacci` / `fibonacci` 的策略定义：22 条版本中引用数 0，无存量策略受影响。
  - [x] 3.4 `libs/strategy` + `libs/visual-command` 定向全量通过；`pnpm typecheck`、`pnpm lint:check` 零报错（`check:magic` 基线缺口属并行提交文件，与本 change 无关）。
  - [x] 3.5 `openspec validate anchor-fibonacci-on-chan-swing-endpoints --strict` 通过（四个 change 一并复验全绿）。

> 证据：合成序列的笔结构（端点价格/时间）在实现前以真实 `deriveCompletedBis` 探针锁定；
> 因子与可视化使用同一过滤契约（`Complete && Valid`），同源一致。
