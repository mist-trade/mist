# Design: remediate-chan-divergence-multi-level-gates

## 架构与核心代数

背驰判定的本质是衡量中枢离开段相对于进入段的动能衰竭程度。
根据缠论原典第 24、34、56、108 课，系统建立**分级合取硬门禁系统（Level-Differentiated Conjunctive Hard Gates）**，严格消除加权打分模型带来的补偿漏洞。

### 1. 门禁矩阵与执行流

```
                    中枢离开段与进入段背驰判定
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
       【盘整背驰判定】                 【趋势背驰判定】
      (单中枢进入/离开比较)             (同向中枢链末中枢比较)
               │                               │
               │                               ├─ G0 几何极值门：离开段价格突破末中枢沿/创价格新高低
               │                               │
               │                               ├─ G1 零轴回拉前提门 (级别分级)：
               │                               │   ├─ 笔级别 (Bi)：免除 G1 门禁
               │                               │   └─ 段级别 (Duan)：必查 difRetracedToZero !== false
               │                               │
               └───────────────┬───────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   G2 黄白线峰值否决门 (主判)             G3 柱体面积确认门 (辅判)
   leave.peak < enter.peak               leave.area < enter.area
            │                                     │
            └──────────────────┬──────────────────┘
                               │ (逻辑与 &&)
                               ▼
                        报告背驰成立
```

### 2. 接口契约演进（Contracts）

在 `libs/chancore/src/contracts.ts` 中增强中枢接口：

```typescript
export interface ChanDivergenceZhongshu {
  readonly startTime: number;
  readonly endTime: number;
  readonly zd: number;
  readonly zg: number;
  readonly dd?: number;
  readonly gg?: number;
  readonly level?: ChannelLevel;
  readonly zhongshuIndex?: number;
  /**
   * G1 前提门证据：中枢 B 跨度内 MACD 柱是否红绿交替（回抽 0 轴）。
   * - true: 中枢期间能量有效贴合/穿越 0 轴，具备趋势背驰资格；
   * - false: 明确违反（柱体单边未翻转），在段级别及以上一票否决趋势背驰；
   * - undefined: 调用方未提供时默认放行（向后兼容）。
   */
  readonly difRetracedToZero?: boolean;
}
```

### 3. 核心计算实现（Chancore 纯函数）

#### ① 动能弱判定（`isWeaker` 恢复双分量严格小于）
```typescript
/**
 * 动能弱判定（恢复 Live Spec 与第 24/34 课口径）：
 * 1. G2 峰值否决门：黄白线 DIF 峰值不创新高/新低（leave.peak < enter.peak）；
 * 2. G3 面积确认门：柱体累积面积衰竭（leave.area < enter.area）。
 * 严格小于，无 epsilon，无加权参数。
 */
private isWeaker(leave: ChanUnitForce, enter: ChanUnitForce): boolean {
  return leave.peak < enter.peak && leave.area < enter.area;
}
```

#### ② 趋势背驰级别分化判定
```typescript
// 在 evaluateTrendDivergence 中：
const isDuanOrHigher = (lastSpan.level ?? inputLevel) === ChannelLevel.Duan;

// 段级别及以上执行 G1 前提门
if (isDuanOrHigher && lastSpan.difRetracedToZero === false) {
  return null;
}

// 执行 G2 && G3
if (!this.isWeaker(forces[leave], forces[enter])) {
  return null;
}
```

#### ③ 纠正 `BuySellPointDetector.detectFirst`（严禁盘整背驰发射一类点）
```typescript
private detectFirst(
  input: ChanBspInput,
  divergences: readonly ChanDivergence[],
  out: ChanBuySellPoint[],
): void {
  const { units } = input;
  const seenLeaves = new Set<number>();

  // 严格仅消费趋势背驰（Trend），彻底排除盘整背驰（Consolidation）
  const trendDivs = divergences.filter(d => d.type === ChanDivergenceType.Trend);

  for (const div of trendDivs) {
    if (seenLeaves.has(div.leaveIndex)) {
      continue;
    }
    // ... 既有一买/一卖发射逻辑不变
  }
}
```

### 4. 证据生成方实现（`@app/strategy` / `ChanVisualAdapter`）

调用方在调用 `detectDivergences` 时，负责从 MACD 指标序列提取段中枢的零轴回拉证据：
- 遍历段中枢 `[startTime, endTime]` 时间范围内的所有 K 线 MACD 柱体（`hist`）；
- 若既存在 `hist[i] > 0` 又存在 `hist[j] < 0`，则 `difRetracedToZero = true`，否则为 `false`；
- 该计算在 Rust nodejs-polars 指标结果或数组切片上完成，复杂度为 $O(N)$，无重复计算。

### 5. 缺陷注册与门禁（`BUG-CHAN-009`）

在 `CHANCORE_BUG_REGISTRY` 中注册条目：
```typescript
{
  id: 'BUG-CHAN-009',
  name: '背驰判定弃用黄白线峰值致脉冲假背驰与盘整背驰越权发射一类买卖点',
  rootCause:
    '2026-09-23 提交 4b2c05c6 单方面将 isWeaker 简化为仅比对 MACD 面积，弃用 DIF 极值 (peak) 并将峰值突破反向断言为毛刺，导致主升浪脉冲拉升误发一卖、暴跌飞刀误发一买；同时 buy-sell-point.ts 违背 live spec 消费盘整背驰发射一类点。修复为：1) 严格遵循原典与 live spec 恢复 G2 峰值否决门（leave.peak < enter.peak）；2) 区分级别：笔级别免除 G1，段级别必查 G1（中枢 B MACD 柱红绿交替回抽 0 轴）；3) 盘整背驰严禁发射一类买卖点。',
  specFile: 'internal/divergence.spec.ts',
  testCasePatterns: [
    '严格遵循双分量门禁：peak 未衰竭（哪怕面积衰竭）绝对不背驰',
    '主升浪脉冲突破与暴跌跳水反例防护',
    '段级别趋势背驰必须要求中枢红绿交替回抽 0 轴',
  ],
}
```
