# Tasks: 为 @app/indicators 扩充现代量化时序纯数学原语算子库

## Phase 1: 契约与类型定义 (`libs/indicators`)

- [x] 1.1 在 `libs/indicators/src/time-series/time-series.types.ts` 中定义 `TimeSeriesResult` 基础返回契约（`{ begIndex, values }`）与参数类型
- [x] 1.2 确认复用 `IndicatorInputError` 作为参数非法门禁的标准异常

## Phase 2: 核心时序原子算子实现（基于 Polars 引擎，双轨制 Series + Observation）(`libs/indicators/src/time-series/`)

- [x] 2.1 实现 `ts-rank.ts`：`computeTsRankSeries` 与 `computeTsRankObservation`（平坦序列中位数 0.5 平滑）
- [x] 2.2 实现 `ts-extreme.ts`：`computeTsArgMax*` 与 `computeTsArgMin*`（0 到 $W-1$，并列极值取最近 Bar）
- [x] 2.3 实现 `ts-decay-linear.ts`：`computeDecayLinearSeries` 与 `computeDecayLinearObservation`（权重 $w_k = k$）
- [x] 2.4 实现 `rolling-corr.ts`：`computeRollingCorrSeries` 与 `computeRollingCorrObservation`（零方差平坦序列安全返回 0.0，数值截断至 $[-1.0, 1.0]$）
- [x] 2.5 实现 `rolling-std.ts`：`computeRollingStdSeries` 与 `computeRollingStdObservation`（基于 Polars `s.rollingStd`，内置 Bessel 校正）
- [x] 2.6 实现 `ts-delta-delay.ts`：`computeTsDelta*` 与 `computeTsDelay*`（基于 Polars `s.diff` 与 `s.shift`）
- [x] 2.7 在 `libs/indicators/src/time-series/index.ts` 中汇总导出所有算子与接口

## Phase 3: 顶层导出与纯边界校验

- [x] 3.1 在 `libs/indicators/src/index.ts` 中集中导出所有 `compute*Series` 与 `compute*Observation` 函数与类型契约
- [x] 3.2 在 `indicators-boundary.guard.spec.ts` 中增加断言，确保 `nodejs-polars` 依赖被严格收敛在 `libs/indicators/src/` 内部，运行全绿通过

## Phase 4: 完备单元测试与金标准验证 (`time-series.spec.ts`)

- [x] 4.1 在 `libs/indicators/src/time-series.spec.ts` 中为 8 个算子编写精确手工核算的基准用例（Golden tests）
- [x] 4.2 编写平坦序列、全同值、单调递增/递减等极端统计边界测试用例（包括零方差除零保护）
- [x] 4.3 编写参数门禁异常用例（非正窗口、非整数窗口、双序列长度不匹配抛出 `IndicatorInputError`）
- [x] 4.4 编写数据量不足时 Series 优雅返回 `{ begIndex: length, values: [] }` 与 Observation 抛错的契约测试用例
- [x] 4.5 编写输入数组不可变性测试，确保冻结（`Object.freeze`）输入不被原地修改
- [x] 4.6 编写 Series 尾部值与 Observation 标量值严格等值对齐的不变量测试

## Phase 5: 综合质量门禁与 OpenSpec 校验

- [x] 5.1 运行全量测试套件：`pnpm test libs/indicators`
- [x] 5.2 运行全仓静态检查：`pnpm typecheck`
- [x] 5.3 运行 OpenSpec 校验：`openspec validate add-indicators-time-series-primitives`

