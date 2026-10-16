# 任务清单：斐波那契锚点迁移到缠论笔/段端点

- [ ] **阶段一：因子插件迁移（`libs/strategy`）**
  - [ ] 1.1 `fibonacci.plugin.ts` 锚点改造：经 `@app/chancore` 推导笔/段，按 `Complete && Valid` 过滤取最近一根；`units: 'bi' | 'duan'` 参数（默认 `'bi'`），移除 `period`；levels / zone / isGoldenPocket 复用 `computeStaticSwingFibonacci` / `computeFibonacciLevels`；无已完成单元或根数不足 → `NEUTRAL`（禁止 rolling 回退）；`evidence` 增加 units / direction / 起止时间与价格。
  - [ ] 1.2 `fibonacci.ts`（rolling 算子）JSDoc 声明窗口口径（滚动窗口极值、恒从高点向下计 ratio），算子保留不作删除。
- [ ] **阶段二：可视化同源切换（`libs/visual-command`）**
  - [ ] 2.1 `fibonacci-visual.adapter.ts` 改用同一套"最近已确认笔/段"锚点；绘图跨度 = 摆动起点 → 最新 bar；无已完成摆动 → 空指令集；选项移除 `period`、新增 `units`。
  - [ ] 2.2 `visual-command.service.ts` 接线：复用服务层的缠论推导结果（如已为 chan layer 推导则一次推导多处复用），不重复计算。
- [ ] **阶段三：测试、影响面与门禁**
  - [ ] 3.1 `fibonacci.plugin.spec.ts`：向上笔黄金口袋 → BUY；向下笔黄金口袋 → SELL；无已完成笔 → NEUTRAL 且无 rolling 锚点；`units: 'duan'` 无段 → NEUTRAL；evidence 锚点断言。
  - [ ] 3.2 可视化 spec：存在摆动 → 5 band / 7 line 与 TradingView 样式断言；无摆动 → fib 层为空。
  - [ ] 3.3 检索使用 `plugin.technical.fibonacci` 的存量策略定义，确认行为变化可接受并记录。
  - [ ] 3.4 `libs/strategy` + `libs/visual-command` 相关全量单测 100% PASS；`pnpm typecheck`、`pnpm lint:check`、`pnpm check:magic` 零报错。
  - [ ] 3.5 `openspec validate anchor-fibonacci-on-chan-swing-endpoints --strict` 通过（并与 `fix-indicator-conventions` 及两个 owning change 一并复验）。
