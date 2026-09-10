# Tasks: 斐波那契（黄金分割/Golden Pocket）通用指标与TradingView工业级可视化系统

## Phase 1: 纯数学指标原语实现（基于 Rust Polars 引擎）(`libs/indicators`)

- [x] 1.1 在 `libs/indicators/src/fibonacci/fibonacci.types.ts` 中定义斐波那契比率、回撤/扩展位、区间分类（`GoldenPocket` 等）及 TradingView 官方色谱规范
- [x] 1.2 在 `libs/indicators/src/fibonacci/fibonacci.ts` 中使用 `nodejs-polars` 实现纯 Rust 向量化双轨算子 `computeFibonacciSeries` 与 `computeFibonacciObservation`，以及静态波段算子 `computeFibonacciLevels` 与 `computeStaticSwingFibonacci`
- [x] 1.3 在 `libs/indicators/src/index.ts` 中集中导出所有斐波那契算子与类型契约
- [x] 1.4 在 `libs/indicators/src/fibonacci/fibonacci.spec.ts` 中编写完备单元测试（Series 对齐、Observation 标量一致性、黄金分割区、极端与非法输入保护），全部测试通过
- [x] 1.5 在 `AGENTS.md` 中补充技术准则：全仓指标计算必须严格基于 Rust `nodejs-polars` SIMD 向量化实现

## Phase 2: 策略决策流因子插件 (`libs/strategy`)

- [x] 2.1 在 `libs/strategy/src/factor/plugins/fibonacci.plugin.ts` 中实现通用 `FibonacciRetracementPlugin`（`plugin.technical.fibonacci`，归属 `TECHNICAL` 分类）
- [x] 2.2 在 `libs/strategy/src/factor/standard-plugins.ts` 中注册 `FibonacciRetracementPlugin`
- [x] 2.3 在 `libs/strategy/src/factor/plugins/fibonacci.plugin.spec.ts` 中编写插件单元测试（黄金口袋回调 BUY、反弹做空 SELL、非关键位 NEUTRAL），全部测试通过

## Phase 3: 可视化指令层扩展 (`libs/visual-command` & `apps/mist/src/visual`)

- [x] 3.1 在 `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts` 中实现 `FibonacciVisualAdapter`，遵循 TradingView 官方半透明填充带、水平虚线与右侧标签规范
- [x] 3.2 在 `libs/visual-command/src/visual-command.service.ts` 中支持 `'fibonacci'` 图层
- [x] 3.3 在 `libs/visual-command/src/adapters/fibonacci-visual.adapter.spec.ts` 与 `visual-command.service.spec.ts` 中编写完备测试，全部测试通过

## Phase 4: 前端图层与渲染核验 (`mist-fe`)

- [x] 4.1 在 `mist-fe/app/components/tv-chart/TradingViewChart.tsx` 中增加对 `fibonacci` 图层命令的专门 Canvas 绘制支持（半透明填充色带、彩色虚线、右侧微型标签）
- [x] 4.2 运行前端测试与构建门禁（23 跑过，174 测试通过，`next build` 编译成功）

## Phase 5: 综合质量门禁与主干提交

- [ ] 5.1 运行全量测试套件与 TypeScript 类型检查
- [ ] 5.2 提交代码至 master 分支并推送
