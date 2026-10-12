# Design: differentiate-chan-central-extension-upgrade-and-expansion

## 1. 核心理论与架构设计

根据《教你炒股票 108 课》第 17、20、35、52、57 课，缠论中枢的生长与层级演化严格分为三个正交阶段：

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

---

## 2. 字段语义正交契约矩阵（刚性规范）

全系统对所有层级走势中枢赋予严格唯一的字段组合：

| 业务场景 | 适用级别 | `extended` | `expanded` | `upgradedLevel` | `absorbed` | 说明 |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **基础中枢** | 笔 / 段 | `false` | `false` | `undefined` | `false` | 初始 3~4 构件 |
| **普通延伸中枢** | 笔 / 段 | `true` | `false` | `undefined` | `false` | 5~8 构件，或核心重叠吞并 $<9$ 构件 |
| **9段延伸升级** | **仅段级别** | **`true`** | **`false`** | **`ChannelLevel.Macro`** | `false` | **单体内部累积 9 段自然升级**，内部无构件 |
| **波动扩展外层大框** | 笔 / 段 | `false` | **`true`** | **`ChannelLevel.Macro`** | `false` | **多中枢极值重叠扩展外框**，包裹内部构件 |
| **被扩展吸收的子中枢** | 笔 / 段 | 保持原值 | `false` | `undefined` | **`true`** | 供图表衬托显示，不发射买卖点 |

---

## 3. 详细改动实现

### 3.1 `libs/chancore` 计算引擎

1. **`duan-channel-policy.ts`（单中枢生命周期）**：
   ```typescript
   // 修改前：
   const isNineDuans = internalDuans.length >= 9;
   const isExpanded = expanded || isNineDuans;
   ...
   extended,
   expanded: isExpanded,
   upgradedLevel: isExpanded ? ChannelLevel.Macro : undefined,

   // 修改后：
   const isNineDuans = internalDuans.length >= 9;
   const isExtended = extended || internalDuans.length >= 4; // 内部超过3段即为延伸
   return {
     ...
     extended: isExtended,
     expanded: expanded, // 绝不被 isNineDuans 污染！
     upgradedLevel: (expanded || isNineDuans) ? ChannelLevel.Macro : undefined,
   };
   ```

2. **`duan-channel.ts`（相邻延伸融合）**：
   ```typescript
   // 修改前：
   const isNineDuans = mergedDuans.length >= 9;
   const isExpanded = c1.expanded || c2.expanded || isNineDuans;
   ...
   extended: true,
   expanded: isExpanded,
   upgradedLevel: c1.upgradedLevel || c2.upgradedLevel || isNineDuans ? ChannelLevel.Macro : undefined,

   // 修改后：
   const isNineDuans = mergedDuans.length >= 9;
   return {
     ...
     extended: true,
     expanded: c1.expanded || c2.expanded, // 绝不被 isNineDuans 污染！
     upgradedLevel: (c1.upgradedLevel || c2.upgradedLevel || isNineDuans) ? ChannelLevel.Macro : undefined,
   };
   ```

### 3.2 `libs/visual-command` 绘图适配层

1. **`BandVisualCommand` 扩展**：
   增加 `readonly upgradedLevel?: ChannelLevel;`；
2. **`ChanVisualAdapter` 转换解耦**：
   ```typescript
   const isExpanded = Boolean(zs.expanded);
   const isMacroUpgrade = zs.upgradedLevel === ChannelLevel.Macro;
   const isExtended = Boolean(zs.extended);

   // 段中枢颜色分级：
   // 1. 波动扩展大框：玫紫色 #E879F9
   // 2. 9段延伸升级：深紫罗兰色 #A855F7
   // 3. 普通/延伸段中枢：经典靛蓝色 #818CF8
   let duanColor = zhongshuDuanColor;
   if (isExpanded) {
     duanColor = '#E879F9';
   } else if (isMacroUpgrade) {
     duanColor = '#A855F7';
   }

   const bandCmd: BandVisualCommand = {
     ...
     color: isDuan ? duanColor : (isExpanded ? '#F59E0B' : zhongshuBiColor),
     extended: isExtended,
     expanded: isExpanded, // 忠实反映 expanded，不再赋 isMacro！
     upgradedLevel: zs.upgradedLevel,
     absorbed: zs.absorbed,
   };
   ```

### 3.3 `mist-fe` 图表渲染层

在 `TradingViewChart.tsx` 中解耦样式与标签：
```typescript
const isDuan = band.layer === "chan_zs_duan";
const isExpanded = Boolean(band.expanded);
const isExtended = Boolean(band.extended);
const isUpgraded = band.upgradedLevel === "macro";
const isAbsorbed = Boolean(band.absorbed);

// 颜色确定：
let strokeColor: string;
let fillColor: string;

if (isDuan) {
  if (isExpanded) {
    strokeColor = "#E879F9"; // 亮玫紫
    fillColor = "rgba(232, 121, 249, 0.18)";
  } else if (isUpgraded) {
    strokeColor = "#A855F7"; // 深紫罗兰 (9段延伸升级)
    fillColor = "rgba(168, 85, 247, 0.18)";
  } else {
    strokeColor = "#818CF8"; // 经典靛蓝
    fillColor = isAbsorbed ? "rgba(129, 140, 248, 0.12)" : "rgba(129, 140, 248, 0.20)";
  }
} else {
  // 笔中枢：所有延伸保持天蓝，仅扩展使用琥珀橙
  strokeColor = isExpanded ? "#F59E0B" : "#38BDF8";
  fillColor = isExpanded ? "rgba(245, 158, 11, 0.15)" : "rgba(56, 189, 248, 0.20)";
}

// 线宽与线型：
const lineWidth = (isExpanded || (isDuan && isUpgraded)) ? 2.5 : (isAbsorbed ? 1.5 : (isDuan ? 2 : 1.5));
// 9段升级为实线；扩展大框为长虚线 [8, 4]
const lineDash = isUncomplete ? [6, 3] : (isExpanded ? [8, 4] : (isDuan ? [] : [4, 2]));

// 标签文案确定：
let baseLabel = isDuan ? "段中枢" : "笔中枢";
if (isAbsorbed) {
  baseLabel = isDuan ? "段中枢[构件]" : "笔中枢[构件]";
} else if (isExpanded) {
  baseLabel = isDuan ? "段中枢[高一级扩展]" : "笔中枢(扩展)";
} else if (isDuan && isUpgraded) {
  baseLabel = "段中枢[9段延伸升级]";
} else if (isExtended) {
  baseLabel = isDuan ? "段中枢(延伸)" : "笔中枢(延伸)";
}
```
