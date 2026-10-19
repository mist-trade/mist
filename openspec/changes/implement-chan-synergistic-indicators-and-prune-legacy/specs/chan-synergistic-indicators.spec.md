# Spec: 缠论协同指标数学规约与遗留接口清理 (Delta Specification)

## 1. 均线吻态与缠绕度算子规约 (Kiss States Specification)

### 1.1 模块与导出
- **文件路径**: `libs/indicators/src/force/kiss-states.ts`
- **导出函数**:
  - `computeKissStatesSeries(close: readonly number[], options?: KissStatesOptions): KissStatesSeriesResult`
  - `computeKissStatesObservation(close: readonly number[], options?: KissStatesOptions): KissStatesObservationResult`

### 1.2 参数规格
- `fastPeriod`: 整数，默认 `5`，必须 `> 0`；
- `slowPeriod`: 整数，默认 `20`，必须 `> fastPeriod`；
- `windowSize`: 整数，局部吻态分析窗口，默认 `10`，必须 `> 0`。

### 1.3 行为规约
- 输入序列长度不足 `slowPeriod` 时，`computeKissStatesSeries` 必须返回 `{ begIndex: close.length, fastMa: [], slowMa: [], entanglementIndex: [], kissTypes: [] }`，绝不抛出未捕获异常；
- 尾部标量计算 `computeKissStatesObservation` 数据不足时抛出标准 `IndicatorInputError`；
- `kissType` 判定必须严格遵循：
  - `FLYING`：无交叉（同号）且最小相对距离 $\le 0.006$；
  - `LIP`：交叉次数为 1 且迅速脱离；
  - `WET`：交叉次数 $\ge 2$ 或均线相对距离连续极窄；
  - `NONE`：发散或正常距离状态。

---

## 2. 笔斜率与速度衰竭比算子规约 (Bi Slope Ratio Specification)

### 2.1 模块与导出
- **文件路径**: `libs/indicators/src/force/chan-slope.ts`
- **导出函数**:
  - `computeBiSlopeObservation(current: BiSlopeUnitInput, prior?: BiSlopeUnitInput): BiSlopeObservationResult`
  - `computeBiSlopeSeries(units: readonly BiSlopeUnitInput[]): BiSlopeSeriesResult`

### 2.2 行为规约
- 若传入单段（无 `prior`），返回当期物理速度与斜率，比值字段回退为 `undefined`，`isMomentumExhausted = false`；
- 速度计算必须防御零除：`barCount = Math.max(1, barCount)`；
- 衰竭判定：当同向且 $v_C / v_A < 0.65$ 时标记 `isMomentumExhausted = true`。

---

## 3. 动态中枢相对指标规约 (Zhongshu Oscillation Index Specification)

### 3.1 模块与导出
- **文件路径**: `libs/indicators/src/force/zhongshu-oscillation.ts`
- **导出函数**:
  - `computeZhongshuOscillationSeries(closes: readonly number[], zd: number, zg: number): ZhongshuOscillationSeriesResult`
  - `computeZhongshuOscillationObservation(close: number, zd: number, zg: number): ZhongshuOscillationObservationResult`

### 3.2 行为规约
- 防御中枢平盘异常：当 $zg \le zd$ 时，$ZOI$ 安全回退为 $0.5$；
- 分区逻辑：
  - $ZOI \in [0.0, 0.20] \implies \text{'LOWER_SUPPORT'}$
  - $ZOI \in [0.80, 1.00] \implies \text{'UPPER_RESISTANCE'}$
  - $ZOI \in (0.20, 0.80) \implies \text{'NEUTRAL_CORE'}$
  - $ZOI > 1.00 \implies \text{'OUTSIDE_ABOVE'}$
  - $ZOI < 0.00 \implies \text{'OUTSIDE_BELOW'}$

---

## 4. 遗留指标退役规约 (Deprecation & Pruning)

### 4.1 核心库剪枝
- `libs/indicators/src/classic/rsi.ts` 物理删除；
- `libs/indicators/src/classic/adx.ts` 物理删除；
- `libs/indicators/src/classic/index.ts` 移除相关重导出；
- `@app/indicators` 根出口不再提供 `computeRsiSeries` 与 `computeAdxSeries`。

### 4.2 控制器与服务层清理
- `apps/mist/src/indicator/indicator.service.ts` 移除 `runRSI` 与 `runADX`；
- `apps/mist/src/indicator/indicator.controller.ts` 移除 `@Post('rsi')`；
- `apps/mist/src/indicator/vo/rsi.vo.ts` 物理删除。
