# 缠论走势中枢延伸（Extension）、升级（Upgrade）与扩展（Expansion）系统全景审计与架构规范

> **文档位置**：`mist/docs/chan-central-extension-expansion-audit-and-specification.md`  
> **制定时间**：2026-10-07  
> **关联源码**：  
> - 核心计算：[`libs/chancore/src/contracts.ts`](file:///Users/moyui/sean/mist/mist/libs/chancore/src/contracts.ts)、[`internal/duan-channel.ts`](file:///Users/moyui/sean/mist/mist/libs/chancore/src/internal/duan-channel.ts)、[`internal/duan-channel-policy.ts`](file:///Users/moyui/sean/mist/mist/libs/chancore/src/internal/duan-channel-policy.ts)、[`internal/bi-channel.ts`](file:///Users/moyui/sean/mist/mist/libs/chancore/src/internal/bi-channel.ts)  
> - 绘图适配：[`libs/visual-command/src/adapters/chan-visual.adapter.ts`](file:///Users/moyui/sean/mist/mist/libs/visual-command/src/adapters/chan-visual.adapter.ts)  
> - 前端图表：[`mist-fe/app/components/tv-chart/TradingViewChart.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/components/tv-chart/TradingViewChart.tsx)  
> **权威依据**：原典《教你炒股票 108 课》（重点：第 17、18、20、35、39、52、57 课）

---

## 一、背景与问题根因诊断

### 1.1 用户反馈现象
在 5 分钟图表的段级别中枢显示中：
> **“为什么有些段的‘高一级扩展’里面没有之前被包含的扩展中枢，有些里面又有？”**

### 1.2 核心根因定位
经过对全仓代码审计，该现象由**理论概念混淆**与**工程实现偷懒**双重导致：

1. **理论概念上**：
   缠论中能够演化为“高一级别走势中枢”的路径本质上有两种完全不同的形态：
   - **形态 A（多中枢波动扩展）**：前后两个独立的同级别中枢，核心区间 $[ZD, ZG]$ 不重叠，但波动极值区间 $[DD, GG]$ 接触重叠。此时两中枢通过外层大框扩展为一个高一级中枢，**大框内部天然包含着这两个原初中枢构件**。
   - **形态 B（单中枢/延伸中枢累积 $\ge 9$ 段升级）**：一个中枢自身在核心区间 $[ZD, ZG]$ 内部持续震荡，内部构件段数达到 9 段（$3+3+3$ 结合）自然升级为高一级中枢。**它自始至终是单一中枢在生长，中间并未走出过其他独立中枢，其内部根本不存在任何被包含的子中枢**。

2. **工程实现上**：
   - **后端赋值污染**：在 [`duan-channel-policy.ts`](file:///Users/moyui/sean/mist/mist/libs/chancore/src/internal/duan-channel-policy.ts#L394) 中，当检测到 `internalDuans.length >= 9` 时，代码执行了 `const isExpanded = expanded || isNineDuans`，直接把“9 段延伸升级”打上了 `expanded = true`；
   - **绘图指令粗暴合并**：在 [`chan-visual.adapter.ts`](file:///Users/moyui/sean/mist/mist/libs/visual-command/src/adapters/chan-visual.adapter.ts#L259) 中，将 `isMacro = Boolean(zs.expanded) || zs.upgradedLevel === ChannelLevel.Macro` 一并映射为 command 的 `expanded: isMacro`；
   - **前端判断覆盖遮蔽**：在 [`TradingViewChart.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/components/tv-chart/TradingViewChart.tsx#L930) 中，`if (isExpanded)` 排在最前，直接显示文案 `段中枢[高一级扩展]` 并涂为玫紫色，彻底将 `extended` 与 `upgradedLevel` 遮蔽覆盖。

---

## 二、全仓核心字段资产与使用全景审计

全系统涉及中枢形态演化与层级升级的字段共有 4 个，定义于 [`contracts.ts`](file:///Users/moyui/sean/mist/mist/libs/chancore/src/contracts.ts#L126-L130) 的 `BaseChanChannel` 接口：

```typescript
export interface BaseChanChannel {
  readonly zg: number;                   // 中枢上沿
  readonly zd: number;                   // 中枢下沿
  readonly gg: number;                   // 纯内部振荡极值高点
  readonly dd: number;                   // 纯内部振荡极值低点
  readonly level: ChannelLevel;          // 物理构造型级别（血统永不变异）：Bi | Duan
  readonly type: ChannelType;            // Complete | UnComplete
  readonly status: ChannelStatus;        // Valid
  readonly expanded: boolean;            // 中枢扩展标志（原典第 35 课多中枢波动扩展）
  readonly extended?: boolean;           // 中枢延伸标志（原典第 17/20 课延伸震荡/核心重叠融合产物）
  readonly upgradedLevel?: ChannelLevel; // 升级目标级别（Macro 高一级中枢）
  readonly absorbed?: boolean;           // 被大级别扩展中枢吸收的局部原初中枢标志
  readonly startId: number;              // 真实物理起始 K 线 ID
  readonly endId: number;                // 真实物理终止 K 线 ID
}
```

### 2.1 全系统各模块使用现状清单

| 字段名称 | 模块 / 文件 | 当前代码现状 | 存在的问题 / 改进方向 |
| :--- | :--- | :--- | :--- |
| **`expanded`** | `chancore/contracts.ts:126` | 注释写着“内部构件 >= 9 或 Phase B 扩展” | 注释本身就把 9段延伸和波动扩展混写了，需纯化定义 |
| | `chancore/internal/duan-channel-policy.ts:394` | `const isExpanded = expanded \|\| isNineDuans;` | **【混淆点 1】** 单中枢 9 段震荡被误赋予 `expanded: true` |
| | `chancore/internal/duan-channel.ts:281` | `const isExpanded = c1.expanded \|\| c2.expanded \|\| isNineDuans;` | **【混淆点 2】** 延伸吞并达到 9 段被误赋予 `expanded: true` |
| | `chancore/internal/duan-channel.ts:181-186` | 扩展大框设 `expanded: true`，子中枢设 `absorbed: true` | **【正确用法】** 多中枢波动扩展的正确生成逻辑 |
| | `chancore/internal/bi-channel.ts:329` | 扩展大框设 `expanded: true`，子中枢设 `absorbed: true` | **【正确用法】** 笔级中枢多中枢波动扩展逻辑 |
| | `visual-command/chan-visual.adapter.ts:259` | `const isMacro = Boolean(zs.expanded) \|\| zs.upgradedLevel === ChannelLevel.Macro; expanded: isMacro` | **【混淆点 3】** 将升级与扩展混同，导致输出指令的 expanded 语义泛滥 |
| | `mist-fe/TradingViewChart.tsx:910, 931` | `if (isExpanded) baseLabel = "段中枢[高一级扩展]"` | **【混淆点 4】** 前端优先拦截 expanded，掩盖了 extended |
| **`extended`** | `chancore/internal/duan-channel.ts:300` | `mergeExtendedDuanChannel` 设 `extended: true` | 正确标记延伸吞并，但未在单中枢多段延伸时打标 |
| | `chancore/internal/duan-channel-policy.ts:408` | `buildChannelFromDuans` 传递入参 `extended`（默认 false） | 单中枢内部延伸 4~8 段时 `extended` 为 false，未体现延伸状态 |
| | `chancore/internal/bi-channel.ts:280` | `mergeExtendedChannel` 设 `extended: true` | 笔级延伸融合正确标记 |
| | `visual-command/chan-visual.adapter.ts:280` | `extended: zs.extended` 透传 | 正确透传，但在前端被 `isExpanded` 优先级覆盖 |
| | `mist-fe/TradingViewChart.tsx:933` | `else if (isExtended) baseLabel = "段中枢(延伸)"` | 仅在 `!isExpanded` 时生效，一旦 $\ge 9$ 段即被屏蔽 |
| **`upgradedLevel`** | `chancore/contracts.ts:128` | 定义为 `ChannelLevel.Macro` | 核心升级级别字段，但前端图表完全未使用该字段区分文案 |
| | `chancore/internal/duan-channel-policy.ts:410` | `upgradedLevel: isExpanded ? ChannelLevel.Macro : undefined` | 依附于被污染的 `isExpanded` |
| | `chancore/internal/duan-channel.ts:252` | 扩展大框设 `upgradedLevel: ChannelLevel.Macro` | 正确标记扩展大框升级为 Macro |
| | `chancore/internal/duan-channel.ts:302` | 延伸中枢达到 9 段时设 `upgradedLevel: Macro` | 正确标记 9 段升级为 Macro |
| | `apps/mist/src/chan/chan-core.mapper.ts` | DTO / VO 映射保留了 `upgradedLevel` | API 层已支持，但前端图表未消费 |
| **`absorbed`** | `chancore/internal/duan-channel.ts:179` | `absorbedGroup.map(c => ({ ...c, absorbed: true }))` | 极值重叠扩展时子中枢打标 |
| | `chancore/internal/channel-span.ts:66` | `if (zhongshu.absorbed) continue;` | 策略与买卖点跳过被吸收中枢，杜绝虚假信号，设计完全正确 |
| | `visual-command/chan-visual.adapter.ts:282` | `absorbed: zs.absorbed` 透传给前端 | 正确透传 |
| | `mist-fe/TradingViewChart.tsx:935` | `else if (band.absorbed) baseLabel = "段中枢[构件]"` | 前端正确支持构件中枢显示 |

---

## 三、缠论原典与第一性原理对照规范

根据《教你炒股票 108 课》第 17、18、20、35、52、57 课，缠论中枢的生长与层级演化严格分为三个正交阶段：

```
                ┌────────────────────────────────────────────────────────┐
                │               走势中枢生命周期演化路径                  │
                └────────────────────────────────────────────────────────┘
                                            │
                    ┌───────────────────────┴───────────────────────┐
                    ▼                                               ▼
         【单一中枢生命周期 (单中枢)】                      【跨中枢相互关系 (多中枢)】
                    │                                               │
          ┌─────────┴─────────┐                           ┌─────────┴─────────┐
          ▼                   ▼                           ▼                   ▼
     [基础成型]          [延伸震荡]                  [中枢延伸融合]      [多中枢波动扩展]
     (3~4 构件)        (5~8 构件)                  ([ZD, ZG] 重叠)     ([DD, GG] 重叠)
          │                   │                           │                   │
          │                   └─────────────┬─────────────┘                   │
          │                                 ▼                                 │
          │                     【累积达到 9 段 (3+3+3)】                      │
          │                                 │                                 │
          │                                 ▼                                 ▼
          │                        【9段延伸升级 (Macro)】            【级别扩展外框 (Macro)】
          │                        • 单体生长，无子构件               • 组合大框，包裹构件
          ▼                                 ▼                                 ▼
    [段中枢 (初生)]                 [段中枢[9段延伸升级]]              [段中枢[高一级扩展]]
```

### 3.1 核心术语与物理实质界定

1. **中枢延伸（Central Extension，原典第 17、20 课）**：
   - **实质**：次级别走势在原中枢核心区间 $[ZD, ZG]$ 内部的波动，不改变中枢级别。
   - **判据**：每个进入构件满足 $\max(d_n) \le ZG$ 且 $\min(g_n) \ge ZD$；或者两个相邻中枢核心区间存在重叠 $\max(zd_1, zd_2) < \min(zg_1, zg_2)$。
   - **构件数**：内部构件为 3, 4, 5, 6, 7, 8 段。
   - **契约定义**：`extended: true`, `expanded: false`, `upgradedLevel: undefined`。

2. **9段延伸升级（9-Segment Extension Upgrade，原典第 35、52、57 课）**：
   - **实质**：单中枢在延伸过程中未被第三类买卖点破坏，且累计内部振荡构件达到 9 段（3+3+3 次级别走势结合）。按原典公理，**直接完成并升级为更高一级别的走势中枢**。
   - **特点**：属于**单体时间维度的生长质变**，绝非两个空间分离的中枢发生重叠组合。因此其内部**没有被包含的子中枢**。
   - **契约定义**：`extended: true`, **`expanded: false`**（严禁设为 true！）, **`upgradedLevel: ChannelLevel.Macro`**。

3. **多中枢波动扩展（Central Expansion，原典第 35 课定理二/三）**：
   - **实质**：两个（或多个）独立的同级别中枢，核心区间 $[ZD, ZG]$ 互不重叠（没有延伸），但后一中枢离开后的回抽或震荡触及前一中枢的极值波动区间 $[DD, GG]$（$\max(dd_1, dd_2) < \min(gg_1, gg_2)$）。
   - **特点**：属于**空间维度多个中枢的级别扩展**。按原典，这两个同级别中枢及其连接段组合成一个高一级别的中枢。
   - **结构表现**：系统生成一个外层大框（包裹全量构件与极值），并将原先的独立中枢作为内部构件保留。因此其内部**必然包含着被吸收的子中枢**。
   - **契约定义**：
     - 外层大框：`extended: false`, **`expanded: true`**, **`upgradedLevel: ChannelLevel.Macro`**, `absorbed: false`；
     - 内部子中枢：`extended: 不变`, `expanded: false`, `upgradedLevel: undefined`, **`absorbed: true`**。

---

## 四、系统架构使用规范（应当如何使用）

### 4.1 四大字段的标准赋值矩阵（刚性契约）

| 业务场景 | `extended` | `expanded` | `upgradedLevel` | `absorbed` | 说明 |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **标准基础段中枢**（3~4 构件） | `false` | `false` | `undefined` | `false` | 常规初生中枢 |
| **内部延伸中枢**（5~8 构件） | `true` | `false` | `undefined` | `false` | 单中枢正常延伸吸纳 |
| **延伸吞并中枢**（$< 9$ 构件） | `true` | `false` | `undefined` | `false` | 相邻核心重叠融合产物 |
| **9段延伸升级中枢**（$\ge 9$ 构件） | `true` | **`false`** | **`Macro`** | `false` | **单体延伸达到 9 段自然升级**（内部无子构件） |
| **波动扩展外层大框** | `false` | **`true`** | **`Macro`** | `false` | **多中枢极值重叠扩展外框**（内部包含子构件） |
| **被扩展吸收的内部子中枢** | 保持原值 | `false` | `undefined` | **`true`** | 仅供图表显示构件，不发射买卖点 |

### 4.2 绘图适配层契约规范（`ChanVisualAdapter`）

在 `libs/visual-command/src/adapters/chan-visual.adapter.ts` 中，Band 指令应当**忠实透传**后端的领域语义，不得强行把 `Macro` 覆盖到 `expanded`：

```typescript
// 规范转换逻辑：
const isExpanded = Boolean(zs.expanded);                                // 仅真正的波动扩展为 true
const isMacroUpgrade = zs.upgradedLevel === ChannelLevel.Macro;          // 级别升级标志
const isExtended = Boolean(zs.extended);                                // 延伸标志
const isAbsorbed = Boolean(zs.absorbed);                                // 构件标志

const bandCmd: BandVisualCommand = {
  ...
  // 颜色体系分层：
  // 1. 波动扩展大框：玫紫色 #E879F9
  // 2. 9段延伸升级：深紫罗兰色 #C084FC（区分于扩展）
  // 3. 普通/延伸段中枢：经典靛蓝色 #818CF8
  color: isExpanded ? '#E879F9' : (isMacroUpgrade ? '#C084FC' : zhongshuDuanColor),
  extended: isExtended,
  expanded: isExpanded,
  upgradedLevel: zs.upgradedLevel,
  absorbed: isAbsorbed,
};
```

### 4.3 前端图表展示层规范（`TradingViewChart.tsx`）

前端标签判定与颜色分级必须按照如下优先级严格解耦：

```typescript
// 规范标签渲染逻辑：
let baseLabel = isDuan ? "段中枢" : "笔中枢";

if (band.absorbed) {
  // 1. 被大框吸收的构件优先标明
  baseLabel = isDuan ? "段中枢[构件]" : "笔中枢[构件]";
} else if (band.expanded) {
  // 2. 真正的多中枢波动扩展（外层大框，里面套着构件）
  baseLabel = isDuan ? "段中枢[高一级扩展]" : "笔中枢(扩展)";
} else if (band.upgradedLevel === "macro" || (band.extended && isNineDuans)) {
  // 3. 9段延伸升级中枢（单中枢生长升级，里面无构件）
  baseLabel = isDuan ? "段中枢[9段延伸升级]" : "笔中枢[9笔延伸升级]";
} else if (band.extended) {
  // 4. 普通延伸中枢
  baseLabel = isDuan ? "段中枢(延伸)" : "笔中枢(延伸)";
}

const label = isUncomplete ? `${baseLabel}(进行中)` : baseLabel;
```

---

## 五、下游业务消费契约（买卖点与背驰）

1. **被吸收中枢（`absorbed === true`）**：
   - 必须在 [`channel-span.ts:66`](file:///Users/moyui/sean/mist/mist/libs/chancore/src/internal/channel-span.ts#L66) 中跳过定位；
   - 绝不独立参与背驰（`divergence`）力度比较；
   - 绝不发射一买/二买/三买买卖点（`buy-sell-point`），避免在扩展大框内部产生杂乱冲突的重复信号。

2. **9段延伸升级中枢（`upgradedLevel === Macro` 且 `expanded === false`）**：
   - 视为完成的独立宏观中枢；
   - 正常参与高级别走势类型划分与背驰判定；
   - 其离开段产生的三类买卖点具有高级别中枢买卖点效力。

3. **波动扩展外层大框（`expanded === true` 且 `upgradedLevel === Macro`）**：
   - 作为宏观中枢整体参与趋势背驰链条计算；
   - 其离开段为离开整个扩展形态的次级别走势。

---

## 六、实施改造行动指南（下一步落地任务）

1. **修正后端段中枢策略**：
   - 修改 [`duan-channel-policy.ts`](file:///Users/moyui/sean/mist/mist/libs/chancore/src/internal/duan-channel-policy.ts#L393-L411)：`isNineDuans` 时仅设置 `extended = true` 与 `upgradedLevel = ChannelLevel.Macro`，**严禁将 `expanded` 置为 `true`**；
   - 修改 [`duan-channel.ts`](file:///Users/moyui/sean/mist/mist/libs/chancore/src/internal/duan-channel.ts#L281-L305)：`mergeExtendedDuanChannel` 内部达到 9 段时，同样仅设置 `extended = true` 与 `upgradedLevel = ChannelLevel.Macro`，严禁污染 `expanded`。
2. **规范 VisualCommand 契约**：
   - 在 `BandVisualCommand` 中补充 `upgradedLevel?: ChannelLevel` 字段；
   - 在 `chan-visual.adapter.ts` 中停止将 `isMacro` 粗暴塞入 `expanded`，忠实透传 `expanded` 与 `upgradedLevel`。
3. **升级前端渲染器**：
   - 更新 `TradingViewChart.tsx` 标签与颜色逻辑，使 `[高一级扩展]` 与 `[9段延伸升级]` 视觉与文案彻底分离。
4. **单测套件回归与锁定**：
   - 更新 `duan-channel.spec.ts` 与 `channel-extension-expansion.spec.ts`，增加专门针对“9段延伸升级”vs“波动极值扩展”的独立断言。
