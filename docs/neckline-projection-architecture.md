# 颈线映射算子引擎 (Neckline Projection Operator Engine) 架构与几何算法规范

> **所属模块**：`libs/pacore`（纯数学几何内核） & `libs/visual-command`（视觉图元指令适配）  
> **理论源流**：古典形态学 (Edwards & Magee) + Al Brooks 价格行为学 (BPA) + ICT/SMC 机构订单流  
> **架构定位**：宏观/中观波段结构反转与延续的确定性空间测算（Measured Move），与微观缺口映射（Gap Projection）正交互补。

---

## 一、 理论溯源与三大学派视角

“颈线（Neckline）”及其衍生出的“空间映射（Projection / Measured Move）”是西方价格行为学与经典形态学的核心支柱：

| 理论体系 | 颈线定义与本质 | 空间测算逻辑 (Measured Move) | 突破与回抽机制 |
| :--- | :--- | :--- | :--- |
| **古典形态学**<br>*(Edwards & Magee)* | 形态完成的**法定分水岭 (Watershed)**。<br>未破颈线前只是形态酝酿；有效击穿才宣告形态确立。 | **形态垂直高度等量释放**：<br>$Target = P_{neckline} \pm H$ | **回抽确认 (Throwback / Pullback)**：<br>原阻力位转为支撑位（S/R Flip）。 |
| **Al Brooks PA**<br>*(Brooks Price Action)* | **交易区间边界 / 突破点 (Breakout Level)**。<br>多空在震荡区间中的最后防线。 | **量度推进 (Measured Move, MM)**：<br>基于区间振幅 $H$ 的 1:1 等距对称推进。 | **突破测试 (Breakout Test)**：<br>价格回踩突破点，测试承接防守意愿。 |
| **ICT / SMC**<br>*(Michael Huddleston)* | **市场结构转变点 (MSS)**。<br>击穿颈线前的反向 Bar 转化为 **Breaker Block (破位块)**。 | **斐波那契外部扩展 (-1.0 / -1.618)**：<br>对对手盘流动性池（Liquidity Pools）的清算扫荡。 | **缓解回踩 (Mitigation)**：<br>回抽测试 Breaker Block 敏感带并继续沿主趋势加速。 |

---

## 二、 核心问题：颈线到底是怎么计算的？

在程序化与量化算法中，**坚决杜绝人工肉眼主观连线**。颈线的提取与计算遵循严格的四步因果律算法：

```
                    双底 (W底) 颈线计算全流程:
       
         (峰值确定颈线 P_neckline = Peak.high)
                         Peak (H_mid)
       颈线基准 ─────────── ∧ ─────────────────────── 水平基准线 (或回抽带)
                           / \               / (突破确立: Close > P_neckline)
                          /   \             /
                         /     \           /
                        /       \         /
                       ∨         ∨       /
                   Bottom 1   Bottom 2  /
                     (L1)       (L2)
       形态极值 ────── ┴ ───────────────────────────── P_extremum = min(L1.low, L2.low)
                                                      基准高差 H = |P_neckline - P_extremum|
```

### 第一步：客观识别局域摆动极值点 (Swing Pivots)
- 设定局域检测半宽窗口 $K$（实现默认 `swingWindow = 2`，即 $[i-2, i+2]$ 共 5 根 Bar；若按需放宽可传入 $K=3$）：
  - **摆动高点 (Pivot High)**：当且仅当第 $i$ 根 Bar 的最高价严格大于前后各 $K$ 根 Bar 时确立：
    $$High[i] > \max_{j \in [i-K, i+K], j \neq i}(High[j])$$
  - **摆动低点 (Pivot Low)**：当且仅当第 $i$ 根 Bar 的最低价严格小于前后各 $K$ 根 Bar 时确立：
    $$Low[i] < \min_{j \in [i-K, i+K], j \neq i}(Low[j])$$
- **因果律守门（绝对无未来函数）**：
  极值几何发生在时刻 $time_i$，但在时序流中，**必须等待至第 $i+K$ 根 Bar 密封收盘后方可正式判定确立**。

---

### 第二步：不同形态下的颈线基准价格计算公式

#### 1. 双底 (W底 / Double Bottom)
- **输入端点**：$L_1$（底1） $\to$ $P_{\text{mid}}$（中间反弹峰） $\to$ $L_2$（底2）；
- **拓扑约束**：$|L_1.low - L_2.low| / \min(L_1.low, L_2.low) \le 5.0\%$（默认 `maxTroughDifferenceRatio = 0.05`，两底对称度容差；高要求场景可收紧至 `0.03`）；
- **颈线基准价计算**：
  $$P_{\text{neckline}} = P_{\text{mid}}.\text{high}$$
  *含义*：两底之间反弹所达到的最高价，即多头向上突围必须攻克的第一道客观天花板。
- **形态极值价**：$P_{\text{extremum}} = \min(L_1.low, L_2.low)$；
- **空间垂直基准高差**：$H = P_{\text{neckline}} - P_{\text{extremum}}$。

#### 2. 双顶 (M头 / Double Top)
- **输入端点**：$H_1$（顶1） $\to$ $V_{\text{mid}}$（中间回调谷） $\to$ $H_2$（顶2）；
- **拓扑约束**：$|H_1.high - H_2.high| / \max(H_1.high, H_2.high) \le 3.0\%$；
- **颈线基准价计算**：
  $$P_{\text{neckline}} = V_{\text{mid}}.\text{low}$$
  *含义*：两顶之间回调所触及的最低价，即空头砸盘必须跌穿的多头承接底板。
- **形态极值价**：$P_{\text{extremum}} = \max(H_1.high, H_2.high)$；
- **空间垂直基准高差**：$H = P_{\text{extremum}} - P_{\text{neckline}}$。

#### 3. 倒头肩底 (Inverse Head & Shoulders) 与 头肩顶 (Head & Shoulders)
- **输入端点**：5 点摆动序列（左肩 $\to$ 颈线点1 $\to$ 头部极值 $\to$ 颈线点2 $\to$ 右肩）；
- **头部的显著性**：倒头肩头部最低价必须显著深于左右肩；头肩顶头部最高价必须显著高出左右肩；
- **颈线计算的两种工业方案**：
  - **方案 A（水平基准线，量化系统推荐首选）**：
    $$P_{\text{neckline}} = \frac{P_{\text{neck1}} + P_{\text{neck2}}}{2} \quad \text{或} \quad P_{\text{neckline}} = \max(P_{\text{neck1}}, P_{\text{neck2}})$$
    *优势*：100% 客观恒定，计算复杂度 $O(1)$，绝对不存在随时间推移而发生的判定点位漂移。
  - **方案 B（倾斜动态射线方程，辅助参考）**：
    通过 $(t_1, P_{\text{neck1}})$ 与 $(t_2, P_{\text{neck2}})$ 联立射线方程：
    $$k = \frac{P_{\text{neck2}} - P_{\text{neck1}}}{t_2 - t_1}, \quad P_{\text{neckline}}(t) = P_{\text{neck1}} + k \times (t - t_1)$$

---

### 第三步：影线 (Wick) 还是实体 (Body)？

- **基准线计算**：统一采用极端流动性影线（`High`/`Low`）确定绝对高差 $H$；
- **微观敏感带 (Retest Zone)**：
  颈线往往不是一个单一孤立的浮点数，而是一个微观密集成交带：
  $$Zone_{\text{retest}} = [P_{\text{neckline}} - 0.1 \times H, \; P_{\text{neckline}} + 0.1 \times H]$$
  用于判定突破后的回抽是否健康有效。

---

### 第四步：突破确立门禁 —— 严禁看影线，必须收盘价穿透！

这是消除假突破与量化噪点最关键的防线：
- **有效看涨突破 (Confirmed Breakout)**：当且仅当某根 Bar 闭合时满足：
  $$Close > P_{\text{neckline}}$$
- **影线刺破拦截 (Wick Sweep / Liquidity Sweep)**：
  如果某根 Bar $High > P_{\text{neckline}}$，但收盘价遭空头反扑打回 $Close \le P_{\text{neckline}}$：
  - **判定定性**：绝对不触发突破，定性为假突破或流动性掠夺（Liquidity Sweep）；
  - **状态机**：形态严格维持 `Forming`（构筑中），严禁发射前向空间映射靶位。

---

## 三、 空间映射测算公式 (Measured Move Targets)

突破确立后，以形态垂直高差 $H$ 为测距标尺，向突破方向展开空间映射：

设方向系数 $\mathrm{dir} = +1$（看涨突破）或 $-1$（看跌突破）：

1. **1:1 经典对称测算目标 (Standard Measured Move / 100% Projection)**：
   $$Target_{1.0} = P_{\text{neckline}} + \mathrm{dir} \times 1.0 \times H$$
   *物理意义*：形态内部筹码蓄积势能的完全等量动能释放（第一核心止盈档位）。
2. **1.272 斐波那契初级扩展目标**：
   $$Target_{1.272} = P_{\text{neckline}} + \mathrm{dir} \times 1.272 \times H \quad (\sqrt{1.618})$$
3. **1.618 斐波那契黄金分割强扩展目标**：
   $$Target_{1.618} = P_{\text{neckline}} + \mathrm{dir} \times 1.618 \times H$$
   *物理意义*：单边强趋势主升/主跌浪的标准终局。
4. **2.0 双倍空间极值目标 (Double Box)**：
   $$Target_{2.0} = P_{\text{neckline}} + \mathrm{dir} \times 2.0 \times H$$

---

## 四、 核心数据契约设计 (`libs/pacore/src/contracts.ts`)

```typescript
export enum NecklinePatternType {
  DoubleBottom = 'double_bottom',                         // 双底 (W底)
  DoubleTop = 'double_top',                               // 双顶 (M头)
  HeadAndShouldersBottom = 'head_and_shoulders_bottom',   // 倒头肩 / 头肩底
  HeadAndShouldersTop = 'head_and_shoulders_top',         // 头肩顶
}

export enum NecklineStatus {
  Forming = 'forming',                     // 形态构筑中，未收盘突破
  Breakout = 'breakout',                   // 收盘价坚决突破颈线 (因果确立)
  PullbackRetested = 'pullback_retested',   // 回抽颈线敏感带获得有效支撑/阻力
  TargetReached = 'target_reached',         // 触达 1:1 或 1.618 目标位
  Invalidated = 'invalidated',             // 恶性反向贯穿或跌破极值失效
}

export interface NecklineProjectionTargets {
  readonly baseHeight: number;             // H = |necklinePrice - extremumPrice|
  readonly necklinePrice: number;          // 颈线突破基准价
  readonly target1_0: number;              // 1:1 对称目标 (Neckline ± 1.0 * H)
  readonly target1_618: number;            // 1.618 黄金扩展 (Neckline ± 1.618 * H)
  readonly target2_0: number;              // 2.0 双倍空间目标 (Neckline ± 2.0 * H)
}

export interface NecklineProjection {
  readonly id: string;
  readonly patternType: NecklinePatternType;
  readonly status: NecklineStatus;
  readonly direction: 'up' | 'down';
  readonly pivots: readonly PaPivotPoint[]; // 构成形态的折线骨架端点
  readonly startTime: Date;
  readonly startIndex: number;
  readonly endTime: Date;
  readonly endIndex: number;
  readonly necklinePrice: number;          // 颈线基准价
  readonly extremumPrice: number;          // 核心极值价格 (底最低/顶最高)
  readonly targets: NecklineProjectionTargets;
  readonly retestZone: NecklineRetestZone;  // 支阻互换敏感带
  readonly breakout?: NecklineBreakoutInfo;// 突破 Bar 的时间、价格与成交量事实
}
```

---

## 五、 视觉图元装配映射 (`libs/visual-command`)

在 `libs/visual-command/src/adapters/pa-visual.adapter.ts` 中注册 `pa_neckline` 图层：

| 视觉元素 | 图元类型 | 颜色与样式规范 | 渲染端点与几何语义 |
| :--- | :--- | :--- | :--- |
| **颈线基准线** | `line` | 看涨青色 `#06b6d4` / 看跌琥珀色 `#f59e0b`<br>`solid`, width=2 | 自中间波峰/波谷起始，水平贯穿至最新 Bar |
| **形态折线骨架** | `line[]` | 浅灰半透 `rgba(148, 163, 184, 0.45)`<br>`dashed`, width=1 | 依次连接关键摆动极值点，清晰勾勒 W/M/头肩形态 |
| **垂直高差测距标尺** | `line` | 紫色 `#8b5cf6`<br>`dotted`, width=1 | 极值点垂直连至颈线位，直观展示垂直高度 $H$ |
| **1:1 对称目标线** | `line` | 蓝色 `#3b82f6`<br>`dashed`, width=1 | 自突破点向右延伸至最新 Bar，标定 $Target_{1.0}$ |
| **1.618 黄金扩展线** | `line` | 紫色 `#a855f7`<br>`dotted`, width=1 | 标定 $Target_{1.618}$ 扩展目标 |
| **目标价格文字** | `text` | 与对应目标线同色 | 标注文案：`1:1目标 3350.20` 与 `1.618扩展 3420.50` |
| **回抽敏感带** | `band` | 半透明填充 `rgba(6, 182, 212, 0.15)` | 覆盖 $[P_{neckline} - 0.1H, P_{neckline} + 0.1H]$ |

---

## 六、 实施计划 (WBS)

1. **Batch 1: 纯数学领域契约与算子实现 (`@app/pacore`)**
   - 在 `contracts.ts` 补充类型契约；
   - 编写 `internal/neckline-projections.spec.ts` 7 大极限场景（红灯）；
   - 编写 `internal/neckline-projections.ts`（绿灯）；
   - 扩展 `pa-core.ts` 门面并确保 `pacore-boundary.guard.spec.ts` 纯边界零违规。
2. **Batch 2: 图元指令流适配与图层编排 (`libs/visual-command`)**
   - 在 `pa-visual.adapter.ts` 扩展 `necklines` 视觉转换；
   - 补充 `pa-visual.adapter.spec.ts` 图元单测；
   - 在 `visual-command.service.ts` 注册 `pa_neckline` 图层。
3. **Batch 3: 诊断工具升级与真实行情体检**
   - 在 `tools/inspect-pa-indicators.ts` 新增颈线形态检出与 1:1 达成率统计。
4. **Batch 4: 零策略泄漏复核、CI 门禁与提交**
   - 确保全套 Jest 测试 100% 通过，合规审查无泄漏后 commit & push。
