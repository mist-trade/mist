# Design: 缠论核心协同指标系统设计与遗留指标安全剪枝

## 1. 架构总览与目录拓扑 (Architecture Topology)

所有纯数学算子严格遵循 `@app/indicators` 单一路径别名与纯数学边界原则：

```
libs/indicators/src/
├── classic/
│   ├── [PRUNED: rsi.ts, adx.ts]
│   ├── dual-ma.ts, macd.ts, kdj.ts, atr.ts, bollinger.ts...
│   └── index.ts
├── force/                                    # 缠论专属动力学与结构算子库
│   ├── force.ts                             # 存量: 笔段 MACD 面积与峰值、中枢0轴检验
│   ├── kiss-states.ts                       # [NEW] 均线吻态(飞吻/唇吻/湿吻)与缠绕度
│   ├── chan-slope.ts                        # [NEW] 笔斜率与速度衰竭比 (提前感知背驰)
│   ├── zhongshu-oscillation.ts              # [NEW] 动态中枢相对指标 (ZOI)
│   ├── force.spec.ts                        # 存量单测
│   ├── kiss-states.spec.ts                  # [NEW] 吻态单测
│   ├── chan-slope.spec.ts                   # [NEW] 笔斜率单测
│   ├── zhongshu-oscillation.spec.ts         # [NEW] 中枢相对指标单测
│   └── index.ts                             # force 模块统一导出
└── index.ts                                 # 全局统一导出根入口
```

---

## 2. 三大核心算子数学建模与算法设计

### 2.1 均线吻态与缠绕度算子 (`kiss-states.ts`)

#### 2.1.1 物理建模与判定逻辑
基于缠论第 5 课与第 14 课：
1. **输入参数**：价格时序（`close: readonly number[]`），快线周期 $P_{fast}$（默认 5），慢线周期 $P_{slow}$（默认 20），吻态检测窗口 $W$（默认 10）。
2. **底层向量化均线**：
   通过 Polars 计算 `fastMa = rollingMean(close, P_fast)` 与 `slowMa = rollingMean(close, P_slow)`。
3. **相对间距时序与极值**：
   $$\text{diffRatio}_t = \frac{\text{fastMa}_t - \text{slowMa}_t}{\text{slowMa}_t}$$
4. **缠绕度得分 (MEI, Moving Average Entanglement Index)**：
   度量快慢均线的离散贴合程度：
   $$\text{stdRel}_t = \frac{|\text{fastMa}_t - \text{slowMa}_t|}{(\text{fastMa}_t + \text{slowMa}_t) / 2}$$
   $$\text{MEI}_t = \frac{1}{1 + 100 \times \text{stdRel}_t} \in (0.0, 1.0]$$
   当快慢均线完全重合时，$\text{MEI} = 1.0$；分开发散时接近 0.0。
5. **吻态类型三态分类判定（Kiss States Classification）**：
   在最近 $W$ 根 Bar 构成的局部窗口内分析均线距离变化轨迹：
   - **`FLYING`（飞吻）**：
     快线向慢线靠近，但未发生相交（窗口内 $\text{diffRatio}$ 始终同号，符号未改变）；且局部最小距离 $|\text{diffRatio}_{min}| \le 0.006$（相对间距收缩至 0.6% 以内），随后距离重新拉大发散。
   - **`LIP`（唇吻）**：
     快线与慢线发生轻度贴合触碰，窗口内交叉次数恰好为 1 次，且在交叉后 2 根 Bar 内迅速脱离并顺应原趋势。
   - **`WET`（湿吻）**：
     快线与慢线发生反复缠绕纠缠，窗口内交叉次数 $\ge 2$ 次，或近 5 根 Bar 均线平均相对间距持续低于 $0.003$（紧密粘合）。
   - **`NONE`（无吻）**：
     均线处于单边顺畅发散或正常大间距运行状态，未发生靠拢。

#### 2.1.2 双轨制接口契约
```typescript
export interface KissStatesSeriesResult {
  readonly begIndex: number;
  readonly fastMa: readonly number[];
  readonly slowMa: readonly number[];
  readonly entanglementIndex: readonly number[];
  readonly kissTypes: ReadonlyArray<'FLYING' | 'LIP' | 'WET' | 'NONE'>;
}

export interface KissStatesObservationResult {
  readonly fastMa: number;
  readonly slowMa: number;
  readonly entanglementIndex: number;
  readonly kissType: 'FLYING' | 'LIP' | 'WET' | 'NONE';
}
```

---

### 2.2 笔斜率与速度衰竭比算子 (`chan-slope.ts`)

#### 2.2.1 物理建模与判定逻辑
解决传统 MACD 面积背驰必须等待整笔完全封闭的滞后痛点，引入牛顿力学经典位移速度模型：
1. **走势单元位移速度与斜率**：
   对于任意一笔或走势单元 $U$（起始时间 $t_0$、结束时间 $t_1$、起点价 $P_0$、终点价 $P_1$）：
   - 跨度周期：$\Delta t = \text{max}(1, \text{barCount})$
   - 价格位移：$\Delta P = P_1 - P_0$
   - 物理位移速度（无符号标量）：$v = \frac{|\Delta P|}{\Delta t}$
   - 几何方向斜率（有符号标量）：$s = \frac{\Delta P}{\Delta t}$
2. **前后同向笔对比（背驰前置预警）**：
   对于相邻的两段同向笔（前序笔 $A$ 与当期推进笔 $C$）：
   - **速度衰竭比**：
     $$\text{velocityRatio} = \frac{v_C}{v_A}$$
   - **斜率衰竭比**：
     $$\text{slopeRatio} = \frac{s_C}{s_A}$$
   - **背驰判定标志**：
     若当期笔创出价格新高（多头）或新低（空头），但速度显著衰竭：
     $$\text{isMomentumExhausted} = (\text{velocityRatio} < 0.65)$$
     提供毫秒级动力学背驰提前预警，无需苦等整笔结束。

#### 2.2.2 双轨制接口契约
```typescript
export interface BiSlopeUnitInput {
  readonly priceChange: number; // 价格变动量 P1 - P0
  readonly barCount: number;    // 跨越 Bar 根数
}

export interface BiSlopeObservationResult {
  readonly currentVelocity: number;
  readonly currentSlope: number;
  readonly velocityRatio?: number;
  readonly slopeRatio?: number;
  readonly isMomentumExhausted: boolean;
}
```

---

### 2.3 动态中枢震荡相对指标 (`zhongshu-oscillation.ts`, ZOI)

#### 2.3.1 物理建模与判定逻辑
量化当前价格在中枢波动区间内的相对位置，且严格尊重 `@app/chancore` 底层中枢生命周期分层设计：
1. **中枢动态区间适配原则**：
   - **笔中枢**：支持随内部笔动态收窄（Dynamic Narrowing），计算时直接消费当期帧的最新 $[ZD_t, ZG_t]$；
   - **段中枢**：严格由前 3 段构件交集绝对锁定（Invariant），后续延伸段不改变核心区间。
2. **ZOI 归一化公式**：
   $$ZOI_t = \frac{Close_t - ZD_t}{ZG_t - ZD_t}$$
   - 平盘异常保护：若 $ZG_t \le ZD_t$，安全回退为 $0.5$；
3. **关键分区与交易意义**：
   - $ZOI_t \in [0.0, 0.20]$：**中枢下沿极限支撑区**（一二买低吸良机）；
   - $ZOI_t \in [0.80, 1.00]$：**中枢上沿极限阻力区**（高抛减仓区）；
   - $ZOI_t \in (0.20, 0.80)$：**中枢中轴震荡区**（防频繁磨损，建议观望）；
   - $ZOI_t \ge 1.0$：**离开中枢多头突破**（若回抽最低点 $ZOI_{min} \ge 1.0$，直接确立严格三买）；
   - $ZOI_t \le 0.0$：**离开中枢空头破位**（若反弹最高点 $ZOI_{max} \le 0.0$，直接确立严格三卖）。

#### 2.3.2 双轨制接口契约
```typescript
export interface ZhongshuOscillationSeriesResult {
  readonly begIndex: number;
  readonly zoi: readonly number[];
  readonly zone: ReadonlyArray<'LOWER_SUPPORT' | 'UPPER_RESISTANCE' | 'NEUTRAL_CORE' | 'OUTSIDE_ABOVE' | 'OUTSIDE_BELOW'>;
}

export interface ZhongshuOscillationObservationResult {
  readonly zoi: number;
  readonly zone: 'LOWER_SUPPORT' | 'UPPER_RESISTANCE' | 'NEUTRAL_CORE' | 'OUTSIDE_ABOVE' | 'OUTSIDE_BELOW';
}
```

---

## 3. 遗留指标剪枝退役方案 (Legacy Pruning)

按照 `code-cleanup-and-smell-remediation` 规范，对无用遗留指标执行完全物理剪枝：
1. **`libs/indicators` 核心剪枝**：
   - 彻底删除 `libs/indicators/src/classic/rsi.ts` 与 `adx.ts`；
   - 从 `libs/indicators/src/classic/index.ts` 中移除 `export * from './rsi'` 与 `export * from './adx'`；
   - 清理 `libs/indicators/src/classic/series.spec.ts` 中针对 RSI 和 ADX 的陈旧测试。
2. **`apps/mist` 消费层清理**：
   - `indicator.service.ts`：删除 `runRSI()` 与 `runADX()` 方法；
   - `indicator.controller.ts`：删除 `@Post('rsi')` 端点与相关 DTO/VO（`RSIVo`）；
   - 同步修正 `indicator.service.spec.ts` 与 `indicator.controller.spec.ts`，确保全套单测与类型检查全绿。
