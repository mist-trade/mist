# Tasks: 将所有经典技术指标迁移至 Polars 表达式引擎并彻底退役 technicalindicators

## Phase 1: DualMA 与 MACD 迁移至 Polars 原生表达式

- [x] 1.1 重构 `libs/indicators/src/dual-ma.ts`：采用 Polars `s.rollingMean` 原生向量化计算
- [x] 1.2 重构 `libs/indicators/src/macd.ts`：采用 Polars `s.ewmMean` 纯向量化表达式链计算

## Phase 2: RSI, KDJ, ATR, ADX 迁移至 Polars 原生表达式

- [x] 2.1 重构 `libs/indicators/src/rsi.ts`：采用 Polars `diff` + `when/then/otherwise` + Wilder `ewmMean` 表达式计算
- [x] 2.2 重构 `libs/indicators/src/kdj.ts`：采用 Polars `rollingMin/Max` + `ewmMean` 向量化计算
- [x] 2.3 重构 `libs/indicators/src/atr.ts`：采用 Polars `shift` + `maxHorizontal` + Wilder `ewmMean` 计算
- [x] 2.4 重构 `libs/indicators/src/adx.ts`：采用 Polars 差分、方向线与 Wilder 平滑表达式计算

## Phase 3: 卸载旧依赖与更新边界守卫

- [x] 3.1 执行 `pnpm remove technicalindicators` 彻底卸载依赖并更新 `package.json`
- [x] 3.2 更新 `libs/indicators/src/indicators-boundary.guard.spec.ts`，移除已退役的 `technicalindicators` 检查，确保 `nodejs-polars` 为唯一数学内核

## Phase 4: 全量回归与多级门禁验证

- [x] 4.1 运行指标单元测试：`pnpm test libs/indicators`（包含 macd, kdj, series, force, time-series, boundary）
- [x] 4.2 运行缠论全量测试：`pnpm test libs/chancore`（183 项买卖点与背驰断言）
- [x] 4.3 运行全仓静态检查：`pnpm typecheck` 与代码格式化 `pnpm exec eslint libs/indicators`
- [x] 4.4 运行 OpenSpec 校验：`openspec validate migrate-classic-indicators-to-polars`
