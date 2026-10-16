# 提案：斐波那契锚点迁移到缠论笔/段端点（rolling 窗口 → 已确认笔/段）

## 1. 背景（Why）

2026-10-16 口径审计（A9）确认：`plugin.technical.fibonacci` 与斐波那契可视化适配器当前都使用
**滚动窗口极值**（默认 50 根）作为斐波那契摆动锚点。这不是交易语境下的经典做法——交易者画斐波那契
回撤永远是"从一段完整摆动（swing）的低点到高点"，而缠论体系里这个摆动的标准定义就是**笔/段**：

- 滚动窗口极值可能落在无结构意义的半路位置（窗口跨越了多笔，极值点不是任何笔的端点）；
- 项目的缠论结构推导（`@app/chancore`）已生产可用，`plugin.chan.bsp` 已建立
  "最近一根 `Complete && Valid` 单元"的成熟过滤模式（`chan-bsp.plugin.ts:381`）；
- 库内 `computeStaticSwingFibonacci` / `computeFibonacciLevels` 两个纯函数本就是为"静态摆动锚点"
  设计的，但当前零生产调用（rolling 版独占消费方）——本变更将其转正，消除死代码。

## 2. 变更内容（What Changes）

1. **因子插件**（`libs/strategy`，`plugin.technical.fibonacci`）：
   - 锚点改为**最近一根已确认且有效的笔**（`BiType.Complete && BiStatus.Valid` 过滤后取最后一根）；
     新增 `units: 'bi' | 'duan'` 参数（默认 `'bi'`），段同理过滤 `DuanType.Complete && DuanStatus.Valid`；
   - 方向语义与现有两个分支一一对应：向上笔 → 回撤做多（`ratio = (high − close) / diff`）；
     向下笔 → 反弹做空（`ratio = (close − low) / diff`）；levels / zone / 黄金口袋判定复用
     `computeStaticSwingFibonacci` / `computeFibonacciLevels`；
   - 无已完成笔、或 K 线不足以完成缠论推导时 → `NEUTRAL`，**禁止回退 rolling 锚点**（不做混合口径）；
   - 参数 `period` 移除（rolling 专属）；`evidence` 增加摆动锚点信息（units / direction / 起止时间与价格）；
   - 复用缠论推导的既有根数约定（`DEFAULT_REQUIRED_BARS_BI` 先例）。
2. **可视化**（`libs/visual-command`，`fibonacci` layer）：同源切换——锚点使用同一套"最近已确认笔/段"；
   绘图跨度从摆动起点延伸到最新 bar；无已完成摆动时 **不产出任何 fib 指令**（不得回退 rolling）。
   TradingView 色带/虚线/标签样式与数量（5 band / 7 line）不变。
3. **rolling 算子保留**：`computeFibonacciSeries / computeFibonacciObservation` 作为纯数学库原语保留
   （不再有生产消费方），JSDoc 声明其"滚动窗口极值、恒从高点向下计 ratio"的窗口口径。

## 3. 影响（Impact）

- **行为变化（确定性语义升级）**：使用 `plugin.technical.fibonacci` 的存量策略信号变化（锚点从滚动窗口
  变为笔/段端点）；斐波那契可视化覆盖层的锚点与跨度变化，无摆动时输出为空。
- 规范：`chan-fibonacci-overlay` 的 "Fibonacci Retracement Factor Plugin" 与
  "TradingView-Styled Fibonacci Visual Commands" 两条 requirement 以 MODIFIED delta 更新；
  "Pure Vectorized Fibonacci Indicator via Polars Rust Engine" 保持不变（rolling 算子保留）。
- 测试：`fibonacci.plugin.spec` / 可视化适配器 spec / `chan-fibonacci-overlay` 相关用例更新。
- 无 HTTP 契约结构变化、无 DB/部署变更；`/v1/visual/commands` 在"无已完成摆动"场景下 fib 指令数变为 0
  （数量场景以"存在已完成摆动"为前提重新表述）。
- 明确不做：运行极值锚点（levels 逐 bar 漂移、信号闪烁）；rolling 锚点回退；删除 rolling 算子
  （保留为库原语，另行评估）。
- **未来函数安全**：只使用 `Complete && Valid` 单元（确认后才进入锚点），与 `plugin.chan.bsp` 同一纪律；
  笔端点被后续结构重画是其既有动态特性，信号随之更新属预期行为。
