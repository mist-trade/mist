# Tasks: 补齐缠论核心协同指标与遗留指标剪枝任务清单

- [x] 1. 遗留指标安全物理剪枝 (Legacy Pruning & Clean Compilation)
  - [x] 1.1 删除 `libs/indicators/src/classic/rsi.ts` 与 `libs/indicators/src/classic/adx.ts`
  - [x] 1.2 从 `libs/indicators/src/classic/index.ts` 移除 `export * from './rsi'` 与 `export * from './adx'`
  - [x] 1.3 清理 `libs/indicators/src/classic/series.spec.ts` 中针对 RSI 和 ADX 的测试用例
  - [x] 1.4 清理 `apps/mist/src/indicator/indicator.service.ts`（删除 `runRSI`、`runADX`）与 `indicator.service.spec.ts`
  - [x] 1.5 清理 `apps/mist/src/indicator/indicator.controller.ts`（删除 `@Post('rsi')` 端点）、`indicator.controller.spec.ts` 并删除 `apps/mist/src/indicator/vo/rsi.vo.ts`
  - [x] 1.6 验证 `pnpm -C libs/indicators test` 与 `pnpm -C apps/mist test` 保证编译与测试无遗留报错

- [x] 2. 均线吻态与缠绕度算子落地 (Kiss States & MEI Operator)
  - [x] 2.1 编写 `libs/indicators/src/force/kiss-states.ts`，基于 `nodejs-polars` SIMD 表达式实现快慢均线、相对间距与连续缠绕度 `MEI` 计算
  - [x] 2.2 实现局部窗口三态状态机，判定输出 `'FLYING'`(飞吻)、`'LIP'`(唇吻)、`'WET'`(湿吻)、`'NONE'`(无吻)
  - [x] 2.3 按照双轨制规范导出 `computeKissStatesSeries` 与 `computeKissStatesObservation`
  - [x] 2.4 编写 `libs/indicators/src/force/kiss-states.spec.ts`，覆盖飞吻、唇吻、湿吻典型形态及极限平盘、短序列边界测试

- [x] 3. 笔斜率与速度衰竭比算子落地 (Bi Slope & Velocity Ratio Operator)
  - [x] 3.1 编写 `libs/indicators/src/force/chan-slope.ts`，实现基于物理位移速度与方向斜率的衰竭比计算模型
  - [x] 3.2 实现同向笔速度衰竭比比对与动力学背驰前置预警 `isMomentumExhausted`
  - [x] 3.3 导出 `computeBiSlopeObservation` 与 `computeBiSlopeSeries`
  - [x] 3.4 编写 `libs/indicators/src/force/chan-slope.spec.ts`，覆盖同向笔背驰、非同向笔安全回退、零除保护与单笔输入测试

- [x] 4. 动态中枢相对震荡算子落地 (Dynamic Zhongshu Oscillation Index, ZOI)
  - [x] 4.1 编写 `libs/indicators/src/force/zhongshu-oscillation.ts`，实现基于当前活跃中枢即时 $[ZD, ZG]$ 的归一化公式 $ZOI = (Close - ZD) / (ZG - ZD)$
  - [x] 4.2 实现五大区间分类输出：`LOWER_SUPPORT`、`UPPER_RESISTANCE`、`NEUTRAL_CORE`、`OUTSIDE_ABOVE`、`OUTSIDE_BELOW`
  - [x] 4.3 导出 `computeZhongshuOscillationSeries` 与 `computeZhongshuOscillationObservation`
  - [x] 4.4 编写 `libs/indicators/src/force/zhongshu-oscillation.spec.ts`，覆盖笔中枢动态收窄、段中枢前3段锁定场景及极端倒挂平盘回退测试

- [x] 5. 模块导出、边界守门与整体质量回归 (Module Export & Gate Verification)
  - [x] 5.1 在 `libs/indicators/src/force/index.ts` 导出 3 个新算子全部函数与接口类型，并在 `libs/indicators/src/index.ts` 根入口统一对外暴露
  - [x] 5.2 运行并通过 `libs/indicators/src/indicators-boundary.guard.spec.ts` 纯数学边界刚性门禁
  - [x] 5.3 运行全库单元测试与类型检查，确保全绿并通过验收
