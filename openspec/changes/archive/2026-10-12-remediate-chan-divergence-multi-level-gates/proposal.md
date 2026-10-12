# Proposal: remediate-chan-divergence-multi-level-gates

## Why

在近期对缠论买卖点（BSP）与背驰检测链路的代码审查中，发现系统存在两项严重的规范漂移（Spec Drift）与原典背离：

1. **背驰判定规范漂移与黄白线峰值弃用（F1 缺陷）**：
   - 2026-09-23 提交 `4b2c05c6` 单方面将 `isWeaker` 弱化为仅比对 MACD 柱体累积面积（`leave.area < enter.area`），将本已计算完成的黄白线峰值 `peak`（DIF 极值绝对值）从判定逻辑中彻底剔除，并将 `divergence.spec.ts:75-89` 反向改写（声称峰值新高为“毛刺”）；
   - **该代码行为直接违反了项目自身的 Live Spec**（`openspec/specs/chan-divergence/spec.md:60-64` 明确规定：`divergence MUST be reported only when the leaving unit's area AND its peak are BOTH strictly less than the entering unit's`）；
   - **致命业务危害（度量偏置）**：`area` 对 K 线根数敏感（正比于时间），而 `peak` 对斜率敏感（正比于瞬时速度）。当中枢离开段走出极速脉冲拉升（主升浪）或暴跌跳水时，因 K 线根数少，柱体面积反而在数值上小于进入段，导致系统在主升浪起点误报“一卖”（做空/提前离场），在悬崖暴跌末端误报“一买”（接飞刀）。

2. **盘整背驰越权发射一类买卖点规范漂移（F3 缺陷）**：
   - 2026-09-20 提交 `d342acb0` 在 `buy-sell-point.ts:119-132` 中引入了“优先消费趋势背驰，再补充消费盘整背驰发射一类点”的逻辑；
   - **该代码行为直接违反了项目自身的 Live Spec**（`openspec/specs/chan-buy-sell-point/spec.md:38-40, 54-58` 明确规定：`Consolidation divergence (occurring inside a Channel's oscillation) MUST NOT produce a first-type point — buy/sell points inside a Channel belong to the second type`）；
   - 缠论原典第 24、29、108 课明确确立公理：第一类买卖点只能由趋势背驰产生，中枢内部盘整背驰只产二类点或中枢震荡买卖点。消费盘整背驰发射一类点严重放大了假一买/假一卖的误报面。

3. **原典多级别背驰门禁对齐（笔 vs 段）**：
   - 缠中说禅第 34 课确立总纲：“一般来说，最重要的是黄白线，柱子面积之和一般在复杂走势里重要”；
   - 第 56 课与 108 课确立级别分工：“这里是 1 分钟以下级别的力度对比，只需要比较柱子面积；如果是 1 分钟级别的，就要同时考虑黄白线回抽 0 轴的情况”；
   - 用户已拍板确立**分级硬门禁架构**：
     - **笔级别（Bi，小级别）**：免除 $G_1$（不要求中枢期间回抽 0 轴），严格执行 $G_2$（黄白线峰值不创新高）$\land$ $G_3$（柱子面积衰竭）；
     - **段级别（Duan，大级别）**：严格执行完整三门禁：$G_1$（中枢期间 MACD 柱红绿交替回抽 0 轴）$\land$ $G_2$（黄白线峰值不创新高）$\land$ $G_3$（柱子面积衰竭）。

4. 按架构铁律，在 `CHANCORE_BUG_REGISTRY` 注册 **BUG-CHAN-009**。

## What Changes

1. **修复 `chan-divergence` 动能弱判定（纠正 Spec Drift）**：
   - 恢复 Live Spec 规定的双分量严格小于门禁：
     `leave.peak < enter.peak && leave.area < enter.area`；
   - 坚决杜绝加权打分模型（反对 `area * factor`），保持无参数确定性。

2. **新增大级别趋势背驰 $G_1$ 前提门禁（`difRetracedToZero`）**：
   - 在 `ChanDivergenceZhongshu` 接口扩展可选只读字段 `readonly difRetracedToZero?: boolean`；
   - 当中枢级别为段级别（`level === ChannelLevel.Duan`）或更高时，若 `difRetracedToZero === false`，直接否决趋势背驰判定；
   - 调用方（如 `chan-visual.adapter` 或上游分析器）根据中枢跨越区间内 MACD 柱是否同时出现正负值（红绿交替）填充该字段。

3. **纠正 `chan-buy-sell-point` 规范漂移（严禁盘整背驰产出一类点）**：
   - 在 `BuySellPointDetector.detectFirst` 中，严格仅消费 `div.type === ChanDivergenceType.Trend`；
   - 彻底删除“消费盘整背驰补充发射一类点”的逻辑，使代码严格与 `chan-buy-sell-point/spec.md` 对齐。

4. **单测反转与全量门禁保障**：
   - 反转 `divergence.spec.ts:75-89` 的错误断言：当 `area` 衰竭但 `peak` 未衰竭时，必须判定为**不背驰**；
   - 增加极速脉冲拉升（主升浪）与跳水暴跌（接飞刀）的反例防护用例；
   - 在 `buy-sell-point.spec.ts` 中增加断言：纯盘整背驰输入时，`detectBuySellPoints` 产出的 `FirstBuy`/`FirstSell` 数组必须严格为空；
   - 在 `chancore-bug-regression.guard.spec.ts` 中正式登记 `BUG-CHAN-009`。

## 影响范围

| 文件/模块 | 说明 |
|---|---|
| `mist/openspec/specs/chan-divergence/spec.md` | 更新 Live Spec：明确笔级别 vs 段级别分级门禁与 `difRetracedToZero` 契约 |
| `libs/chancore/src/contracts.ts` | `ChanDivergenceZhongshu` 增加 `difRetracedToZero?: boolean` |
| `libs/chancore/src/internal/divergence.ts` | 恢复 $G_2 \land G_3$ 双门禁，增加段级别 $G_1$ 否决门 |
| `libs/chancore/src/internal/buy-sell-point.ts` | `detectFirst` 严格仅消费趋势背驰，移除盘整背驰一类点发射 |
| `libs/chancore/src/internal/divergence.spec.ts` | 反转断言并增加脉冲突破/暴跌反例测试 |
| `libs/chancore/src/internal/buy-sell-point.spec.ts` | 增加盘整背驰不发一类点测试 |
| `libs/chancore/src/chancore-bug-regression.guard.spec.ts` | 登记 `BUG-CHAN-009` |
| `libs/strategy/src/kernel/chan-visual.adapter.ts` | 为段中枢计算并注入 `difRetracedToZero` 证据 |
