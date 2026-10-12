# Tasks: remediate-chan-divergence-multi-level-gates

## 1. 核心契约与算法修复 (ChanCore)

- [x] 1.1 在 `libs/chancore/src/contracts.ts` 的 `ChanDivergenceZhongshu` 接口中增加 `readonly difRetracedToZero?: boolean` 字段
- [x] 1.2 在 `libs/chancore/src/internal/divergence.ts` 的 `isWeaker` 中恢复 $G_2 \land G_3$ 双分量严格小于判定 (`leave.peak < enter.peak && leave.area < enter.area`)
- [x] 1.3 在 `libs/chancore/src/internal/divergence.ts` 的 `detectTrend` 中增加段级别及以上 $G_1$ 前提门禁（`isDuanOrHigher && lastSpan.difRetracedToZero === false` 否决）
- [x] 1.4 在 `libs/chancore/src/internal/buy-sell-point.ts` 的 `detectFirst` 中严格仅过滤 `div.type === ChanDivergenceType.Trend`，移除盘整背驰一类买卖点发射

## 2. 上游证据生产与适配器增强

- [x] 2.1 在 `libs/indicators/src/force.ts` 中实现 `checkZhongshuZeroRetracement` 并在 `libs/strategy`、`libs/visual-command` 中为段级别中枢切片注入 `difRetracedToZero`

## 3. 测试反转与历史缺陷门禁 (Guard & Regression)

- [x] 3.1 在 `libs/chancore/src/internal/divergence.spec.ts` 中反转 75-89 行断言：当 `area` 衰竭但 `peak` 未衰竭时，严格断言为不背驰（修复漂移）
- [x] 3.2 在 `libs/chancore/src/internal/divergence.spec.ts` 中新增反例测试：
  - 主升浪脉冲拉升离开段（`peak` 创新高，`area` 偏小）严格不报背驰
  - 极速跳水暴跌离开段（`peak` 创新低，`area` 偏小）严格不报背驰
  - 段级别中枢未回抽 0 轴（`difRetracedToZero: false`）严格不报趋势背驰
  - 笔级别中枢在无 0 轴证据或未回抽 0 轴时放行 $G_1$（符合小级别原典规则）
- [x] 3.3 在 `libs/chancore/src/internal/buy-sell-point.spec.ts` 与 `audit-chancore-algorithms.spec.ts` 中更新测试：仅输入盘整背驰时，严格不生成任何 `FirstBuy` 或 `FirstSell`
- [x] 3.4 在 `libs/chancore/src/chancore-bug-regression.guard.spec.ts` 的 `CHANCORE_BUG_REGISTRY` 注册 `BUG-CHAN-009`，并确保门禁断言全部通过

## 4. 全局验证

- [x] 4.1 运行 TypeScript 类型检查：`pnpm run typecheck`（通过，0 错误）
- [x] 4.2 运行 Chancore 定向单测：`pnpm test libs/chancore`（25 套测试套件全部通过）
- [x] 4.3 运行全量 CI 测试套件：`pnpm test:ci`
