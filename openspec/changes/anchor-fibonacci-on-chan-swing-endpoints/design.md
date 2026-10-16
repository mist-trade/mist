# 设计：斐波那契锚点迁移到缠论笔/段端点

## 决策记录

### D1 · 锚点选择 = 最近一根已确认且有效的单元（`Complete && Valid`）

- 取法：用与 `plugin.chan.bsp` 完全一致的过滤模式（`chan-bsp.plugin.ts:381`）——
  `bis.filter(b => b.type === BiType.Complete && b.status === BiStatus.Valid).at(-1)`；
  `units: 'duan'` 时同理过滤 `DuanType.Complete && DuanStatus.Valid`。
- 理由：只消费已确认结构 = 与缠论买卖点插件同一未来函数纪律；`ChanBi` 已含
  `startTime/endTime/high/low/trend/type/status`，锚点数据齐备。
- 备选与否决：运行极值锚点（未确认、levels 随价格逐 bar 漂移 → 信号闪烁）；duan-only（级别写死，
  不够灵活）；rolling 回退（混合口径，禁止）。

### D2 · 方向语义与纯函数复用

- 向上笔（`trend = Up`，低点 → 高点）：回撤做多分支，`ratio = (high − close) / (high − low)`；
  向下笔（`trend = Down`，高点 → 低点）：反弹做空分支，`ratio = (close − low) / (high − low)`。
  两个公式与现有插件分支、以及 `computeStaticSwingFibonacci(high, low, currentPrice, direction)`
  的既定语义完全一致。
- **复用转正**：levels / zone / `isGoldenPocket` 由 `computeStaticSwingFibonacci` +
  `computeFibonacciLevels`（均已存在、零生产调用）产出，不允许在插件内重写斐波那契档位数学。

### D3 · 无摆动的降级语义（fail-closed）

- 无已完成单元、或 K 线数量不足以完成缠论推导 → 因子返回 `NEUTRAL`；可视化不产出 fib 指令。
- 明确禁止回退 rolling 锚点：同一场景下两种锚点混用会让信号与图表互相矛盾（审计要求因子与可视化同源）。

### D4 · 参数与根数约定

- 插件参数：移除 `period`（rolling 专属），新增 `units: 'bi' | 'duan'`（默认 `'bi'`）；
  保留 `toleranceRatio`、`direction: 'pullback' | 'rebound' | 'both'`。
- 最小根数复用缠论推导既有约定（`DEFAULT_REQUIRED_BARS_BI` / `DEFAULT_REQUIRED_BARS_DUAN` 先例），
  不再使用 rolling 的 50 根窗口语义。

### D5 · evidence 扩展

- `evidence` 在既有 `levels / ratio / zone / styles` 基础上增加摆动锚点信息：
  `units`、`direction`、`startTime / endTime`、`startPrice / endPrice`（= 单元 `high / low`）。

### D6 · 可视化同源与跨度

- `FibonacciVisualAdapter` 使用与插件相同的"最近已确认笔/段"锚点；`visual-command` 已依赖
  `@app/chancore`，推导可在服务层完成一次并复用（实现细节留给实施计划）。
- 绘图跨度：从摆动**起点 bar** 延伸到**最新 bar**（levels 向右延展，符合 TradingView 斐波那契工具直觉）。
- 无已完成摆动 → 空指令集；TradingView 色带/线/标签样式与数量（5 band / 7 line）在多摆动存在时不变。

### D7 · rolling 算子保留

- `computeFibonacciSeries / computeFibonacciObservation` 保留为 `@app/indicators` 纯数学库原语
  （有测试、有领域价值、维护成本近零），JSDoc 声明"滚动窗口极值、恒从高点向下计 ratio"的窗口口径；
  若未来确认无任何用途，再单独立项删除（治理指南 §6.9 的评估留痕于此）。

### D8 · 不给笔端点做"段回退"

- `units: 'duan'` 且无已完成段 → `NEUTRAL`，不静默降级到笔（显式级别选择，避免信号级别漂移）。

## 规范落点

- `chan-fibonacci-overlay` live spec 两条 requirement 以 MODIFIED delta 更新：
  - "Fibonacci Retracement Factor Plugin"（携带全部既有场景名 + 新增场景）；
  - "TradingView-Styled Fibonacci Visual Commands"（同上）。
- "Pure Vectorized Fibonacci Indicator via Polars Rust Engine" 不动（rolling 算子保留）。

## 验证策略

- 构造能形成已知笔结构的合成序列（或复用 chancore 既有 fixture），以独立 oracle 断言：
  - 向上笔 + 价格落入 0.5~0.618 → `BUY`，evidence 含锚点；
  - 向下笔 + 反弹落入黄金口袋 → `SELL`；
  - 无已完成笔 / 根数不足 → `NEUTRAL` 且绝不使用 rolling 锚点；
  - `units: 'duan'` 无已完成段 → `NEUTRAL`。
- 可视化：存在摆动时 5 band / 7 line 与样式断言；无摆动时 fib 层输出为空。
- 检索使用 `plugin.technical.fibonacci` 的存量策略定义，人工确认行为变化可接受。
- 门禁：`libs/strategy` + `libs/visual-command` 相关全量单测、`pnpm typecheck`、`pnpm lint:check`、
  `pnpm check:magic`、四个 change 的 `openspec validate` 全绿。
