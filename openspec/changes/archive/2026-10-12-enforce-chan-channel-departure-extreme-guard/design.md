# Design: enforce-chan-channel-departure-extreme-guard

## 核心架构原则

1. **离开第一公理（充要性）**：
   笔级走势中枢的离开，在缠论数学拓扑上只有两种合法形态：
   - **形态 A（顺势突破极值 Trend Breakout）**：
     - 上涨中枢：$curr.high > GG$
     - 下跌中枢：$curr.low < DD$
   - **形态 B（次级别三买确认 3rd Class Confirmation）**：
     - 上涨中枢：$curr.high > ZG$ 且后续 $pullback.low > ZG$
     - 下跌中枢：$curr.low < ZD$ 且后续 $pullback.high < ZD$
   
   **非此即彼，严禁第三种顺势离开！**
   若一笔同向笔未能创出全局极值（$curr.high \le GG$ 或 $curr.low \ge DD$），且随后的回抽未能形成第 3 类买卖点（回抽跌回中枢），则该笔无论幅度多大，本质上均属于中枢震荡内部的次级别波动，绝对不具备中枢完结离开的拓扑资格。

2. **序列与切片末端封存守卫修正**：
   在旧代码中：
   ```typescript
   const shouldSealAtEnd =
     !pullback &&
     isTrendAlignedWithEntry &&
     (strategy.allowUncomplete === false ? hasBrokenOut : breaksExtreme);
   ```
   当 `strategy.allowUncomplete === false`（如父级别大笔切片划分）时，旧代码仅要求 `hasBrokenOut`（冲破 $ZG/ZD$）即草率封存为离开笔，导致在未走出 3 买且未突破 $GG$ 时提前误封存。
   修正为：**无论 `allowUncomplete` 是否为 false，没有出现 3 买/3 卖的离开终笔，必须严格满足 `breaksExtreme`（$curr.high > GG$ 或 $curr.low < DD$）！**

3. **内部延伸震荡（Strict Overlap Guard）防跨段污染**：
   当一笔同向冲高未能破 $GG$，随后的反向笔直接向下跌穿中枢对向边界（如日线下跌笔展开）：
   - 该反向跌穿笔已构成对中枢反向沿的物理破坏，不再属于“围绕中枢的价格重叠延伸”；
   - 严禁将随后的日线下跌笔及其内部次级别走势作为当前上涨中枢的延伸构件；
   - 状态机在无法吸纳时执行 `sealOrCollapseAtBestCandidate()`：
     - 若中枢历史中存在有效顺势冲破 $GG$ 的候选离开笔，回溯封存于该最佳候选笔处（使得中枢在日线最高点处干净封存，释放后续所有日线下跌笔）；
     - 若中枢自核心确立后从未突破 $GG$，且无 3 买离开，随后的反向暴跌构成对进入笔起点的物理打穿，中枢按起点破坏处理，彻底杜绝向下延伸跨段。

## 判决矩阵 (Decision Matrix)

| 走势特征 | 是否同向 | 相对 ZG/ZD | 相对 GG/DD | 回抽 pullback | 判定结果 |
|---|---|---|---|---|---|
| **常规顺势突破** | 同向 | 破 ZG/ZD | **破 GG/DD** | 走出 2s/2b 或末端 | ✅ **合法离开（封存为 Complete）** |
| **次级别 3 买离开** | 同向 | 破 ZG/ZD | 未破 GG/DD | **不跌回 ZG/ZD (3买/3卖)** | ✅ **合法离开（3买破坏封存）** |
| **冲高回落震荡** | 同向 | 触碰或微破 ZG | **未破 GG** | **跌回 ZG (无3买)** 且在区间内 | 🔄 **中枢内部震荡（尝试 absorb）** |
| **见顶暴跌（日线下跌笔启动）** | 同向 | 冲高未破 GG | **未破 GG** | **跌穿反向沿/起点 (反向破坏)** | 🛑 **拒绝离开，触发脱离收口或崩塌作废，绝不跨越** |
| **切片末端顺势笔** | 同向 | 破 ZG/ZD | **未破 GG** | 无 pullback | ❌ **禁止作为 Complete 离开笔** |

## 代码实现要点

1. 在 `CentralStateMachine` 中明确：
   - 候选离开笔的唯一来源：`isTrendAlignedWithEntry && breaksExtreme`（创出新高/新低）或者 `isThirdBuyOrSellPoint` 确认成立时生成。
2. 在 `ChannelLifecycleEngine` 的扫描推进主循环中：
   - 统一 `shouldSealAtEnd` 守卫条件：必须是 `breaksExtreme`，移除 `allowUncomplete === false ? hasBrokenOut` 的漏洞；
   - 强化 `canAbsorbExtension` 门禁：当走势已出现明显的单向脱离且伴随反向打穿时，果断阻断吸纳，移交脱离收口逻辑。
