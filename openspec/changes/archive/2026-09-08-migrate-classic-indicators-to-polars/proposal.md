# Proposal: 将所有经典技术指标迁移至 Polars 表达式引擎并彻底退役 technicalindicators

## Why

1. **消除双重数学引擎割裂与维护负担**：
   - 当前 `@app/indicators` 库中，新扩充的时序 Alpha 原语（`ts_rank`、`rolling_std`、`decay_linear` 等）基于高性能 Rust 原生引擎 `nodejs-polars`，而传统的 6 个经典指标（MACD, KDJ, RSI, DualMA, ADX, ATR）仍依赖数年未维护的外部 npm 库 `technicalindicators`。
   - 维持两套数学库不仅造成打包体积与内存布局的冗余，而且 `technicalindicators` 在底层存在大量低效的对象封装和 GC 垃圾回收压力。
2. **践行 Rust 级向量化与零 JS 命令式循环准则**：
   - 用户明确要求：**指标的原语绝不能用 JS 手写循环，必须统一使用 Polars 包装过的底层向量化原语（`ewmMean`, `rollingMean`, `rollingMax/Min`, `diff`, `shift`, `when/then/otherwise`）**。
   - Polars 拥有经过严格验证的指数加权移动平均（EMA/EWM）与滑动窗口算子，与中国 A 股通达信标准 EMA 具有 $10^{-15}$ 的机器零级精度吻合度。
3. **彻底完成指标底座收敛**：
   - 通过将全部 6 个经典指标重构为纯 Polars 向量化表达式，可从根上彻底卸载 `technicalindicators`（`pnpm remove technicalindicators`），使 Mist 拥有全仓唯一、纯粹、极速的 Rust 数学底座。

---

## What Changes

1. **经典指标实现重构（`libs/indicators/src/`）**：
   - `dual-ma.ts`：使用 Polars `s.rollingMean` 原生计算短周期与长周期均线；
   - `macd.ts`：使用 Polars `s.ewmMean`（Rust SIMD 递推）计算快线、慢线与信号线；
   - `rsi.ts`：使用 Polars `diff`、条件过滤与 `ewmMean`（Wilder RMA）纯表达式计算；
   - `kdj.ts`：使用 Polars `rollingMin/rollingMax`、RSV 与 `ewmMean` 平滑计算；
   - `atr.ts`：使用 Polars `shift`、`sub`、`abs` 与 `maxHorizontal` 及 Wilder 平滑计算；
   - `adx.ts`：使用 Polars 向量化方向线与平滑计算。
2. **严格保持对外契约 100% 兼容**：
   - 函数入参保持 `readonly number[]`，输出类型（`MacdSeriesResult`, `KdjSeriesResult`, `RsiSeriesResult`, `DualMaSeriesResult`, `AtrSeriesResult`, `AdxSeriesResult`）及 Observation 标量/对象契约完全不变；
   - 严禁向外部泄漏任何 Polars 类型。
3. **依赖彻底退役与架构守卫更新**：
   - 在 `package.json` 中物理卸载 `technicalindicators`；
   - 更新 `libs/indicators/src/indicators-boundary.guard.spec.ts`，移除已不存在的 `technicalindicators` 限制，确立 `nodejs-polars` 作为唯一的受限计算引擎。
4. **全套回归测试保障**：
   - 校验 `force.spec.ts`（缠论 MACD 力度积分与峰值）、指标测试以及 `libs/chancore` 全量测试套件（183 tests），确保背驰与中枢检测零破坏。

---

## Scope and Non-Goals

- **Scope**：
  - 重构 `libs/indicators/src/` 中的 `macd.ts`, `kdj.ts`, `rsi.ts`, `dual-ma.ts`, `atr.ts`, `adx.ts`；
  - 卸载 `technicalindicators`；
  - 更新测试套件与架构守卫。
- **Non-Goals**：
  - 不改变外部 API 签名与数据结构；
  - 不修改下游 `chancore` 或策略模块的业务消费逻辑。
