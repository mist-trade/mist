# Proposal: differentiate-chan-central-extension-upgrade-and-expansion

## Why

在 5 分钟图表的段级别中枢显示中，存在显著的语义与视觉混淆：
部分标有“段中枢[高一级扩展]”的中枢内部套着被吸收的原初中枢构件，而另一些“高一级扩展”中枢内部却空空如也，没有任何子中枢。

经代码审计与缠论原典考证，根本原因在于**理论概念混淆**与**工程实现一刀切**：

1. **原典两种级别的升级机制被代码混同（Spec & Code Drift）**：
   - **形态 A（多中枢极值波动扩展，原典第 35 课定理二/三）**：两个或多个独立中枢核心区间 $[ZD, ZG]$ 严格分离，但波动极值区间 $[DD, GG]$ 接触重叠。此时系统生成外层大框，并将原初中枢包裹吸收（打上 `absorbed: true`）。大框内部天然包含子中枢。
   - **形态 B（单中枢/延伸中枢累积 $\ge 9$ 段升级，原典第 35、52、57 课）**：一个中枢自身在核心区间 $[ZD, ZG]$ 内部持续震荡，内部构件段数达到 9 段（3+3+3 次级别走势结合）自然升级为高一级宏观中枢。**它自始至终是单一中枢在生长，中间并未走出过其他独立中枢，其内部根本不存在任何被包含的子中枢**。
   - **笔级别范围约束**：笔级别作为微观颗粒度，不参与 9 笔升级（保持微观纯净）；9 段升级仅在段级别（Duan-level）生效。
   - **代码缺陷**：`duan-channel-policy.ts:394` 和 `duan-channel.ts:281` 偷懒将 9 段延伸升级强行赋了 `expanded = true`，导致后端将形态 B 错误归类为形态 A。

2. **绘图层与前端渲染层遮蔽（Visual Masking）**：
   - `chan-visual.adapter.ts:259` 粗暴地将 `isMacro` 直接塞入 visual command 的 `expanded` 字段；
   - `TradingViewChart.tsx:930` 优先拦截 `if (isExpanded)`，导致无论 9 段升级还是波动扩展，全部显示为 `段中枢[高一级扩展]` 并刷成一模一样的玫紫色 `#E879F9`。

必须在 Live Spec、后端领域模型、绘图适配器以及前端渲染器中，将“中枢延伸（`extended`）”、“9段延伸升级（`upgradedLevel: Macro`）”与“波动重叠扩展（`expanded`）”三者彻底正交解耦。

## What Changes

1. **修正中枢领域契约与计算策略（`libs/chancore`）**：
   - **段中枢 9 段升级纯化**：在 `duan-channel-policy.ts` 与 `duan-channel.ts` 中，当段中枢构件段数 $\ge 9$ 时，仅设置 `extended = true` 与 `upgradedLevel = ChannelLevel.Macro`，**严禁设置 `expanded = true`**；
   - **笔级别维持纯净**：笔中枢（Bi-level）不触发 9 笔升级，无论多少笔延伸均保持 `extended: true, upgradedLevel: undefined, expanded: false`；
   - **波动扩展大框保持规范**：仅跨中枢极值 $[DD, GG]$ 重叠时设置 `expanded = true, upgradedLevel = ChannelLevel.Macro, absorbed = false`，被包裹子中枢标记 `absorbed = true`。

2. **规范绘图指令透传契约（`libs/visual-command`）**：
   - 在 `BandVisualCommand` 中补充 `upgradedLevel?: ChannelLevel` 字段；
   - 在 `ChanVisualAdapter` 中停止将 `isMacro` 粗暴赋给 `expanded`，忠实透传 `expanded`、`extended` 与 `upgradedLevel`。

3. **前端渲染层视觉与文案精准分级（`mist-fe`）**：
   - **色彩与线型解耦**：
     - **段中枢[9段延伸升级]**：采用**深紫罗兰色 `#A855F7`**，**2.5px 加粗实线**（单体升级，内部无构件）；
     - **段中枢[高一级扩展]**：维持**亮玫紫色 `#E879F9`**，**2.5px 加粗长虚线 `[8, 4]`**（外层大框，包裹构件）；
     - **普通段中枢 & 段中枢(延伸)**：维持**经典靛蓝色 `#818CF8`**，2.0px 实线；
     - **被吸收构件段中枢**：维持经典靛蓝色 `#818CF8`，1.5px 细实线，标记为 `段中枢[构件]`；
     - **笔中枢族系**：所有延伸保持统一**天蓝色 `#38BDF8`**，扩展大框保持**琥珀橙色 `#F59E0B`**。

4. **单测回归与 Characterization 锁定**：
   - 增加针对 9 段延伸升级与波动扩展各自独立字段组合的断言；
   - 保证下游 `channel-span`、`divergence`、`buy-sell-point` 的消费契约稳定。

## 影响范围

| 文件 / 模块 | 说明 |
|---|---|
| `mist/openspec/specs/chan-central-extension/spec.md` | 修正 Live Spec 中 9-wave accumulation 的 `expanded` 误记，确立 `upgradedLevel: Macro` 与 `extended: true` |
| `libs/chancore/src/contracts.ts` | 澄清 `BaseChanChannel` 中 `expanded`、`extended` 与 `upgradedLevel` 的正交注释 |
| `libs/chancore/src/internal/duan-channel-policy.ts` | 9 段延伸时仅打 `extended: true` 与 `upgradedLevel: Macro`，不再赋 `expanded: true` |
| `libs/chancore/src/internal/duan-channel.ts` | 延伸融合达到 9 段时同样不污染 `expanded` |
| `libs/visual-command/src/visual-command.types.ts` | `BandVisualCommand` 增加 `upgradedLevel?: ChannelLevel` |
| `libs/visual-command/src/adapters/chan-visual.adapter.ts` | 忠实透传中枢属性，分流段中枢颜色 |
| `mist-fe/app/api/types.ts` 与 `client.ts` | 确保 `VisualCommandVo` 包含 `upgradedLevel` |
| `mist-fe/app/components/tv-chart/TradingViewChart.tsx` | 重构标签与颜色判定，分离 `[9段延伸升级]` 与 `[高一级扩展]` |
| `libs/chancore/src/internal/duan-channel.spec.ts` | 增加独立形态单测断言 |
