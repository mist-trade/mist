# Design: 经典技术指标的纯 Polars 向量化重构设计

## 1. 核心约束与设计哲学

根据架构决策，本次迁移有两大核心军规：
1. **纯 Polars 原生原语（禁止手写 JS 循环）**：
   - 所有的移动平均、指数平滑、滑动极值、差分、比率计算，**必须严格调用 Polars 原生 Rust 向量化原语（`ewmMean`, `rollingMean`, `rollingMin/Max`, `diff`, `shift`, `when/then/otherwise`）**。
   - 严禁在 TypeScript 侧手写命令式 `for` / `while` 循环来执行指标数值迭代。
2. **对外契约 100% 绝对兼容（零外部改造）**：
   - 函数入参格式、返回对象接口（`MacdSeriesResult`, `KdjSeriesResult` 等）严格保持不变；
   - 严禁泄露任何 Polars 内部对象（`Series`, `DataFrame`, `Expr`）。

---

## 2. 各经典指标的 Polars 表达式映射

### 2.1 双均线（`DualMA`）
- **底层原语**：`s.rollingMean(period)`
- **映射规则**：
  ```typescript
  const s = pl.Series(closes);
  const shortMA = s.rollingMean(shortPeriod).toArray().slice(shortPeriod - 1);
  const longMA = s.rollingMean(longPeriod).toArray().slice(longPeriod - 1);
  ```
- **暖机位**：`begIndex = closes.length - shortMA.length`。

### 2.2 MACD（指数平滑异同移动平均线）
- **底层原语**：`s.ewmMean(alpha, false)`（等价于通达信递推公式，精度达 $1.77 \times 10^{-15}$）
- **映射规则**：
  ```typescript
  const s = pl.Series(closes);
  const fastEma = s.ewmMean(2 / (fastPeriod + 1), false);
  const slowEma = s.ewmMean(2 / (slowPeriod + 1), false);
  const dif = fastEma.sub(slowEma);
  const dea = dif.ewmMean(2 / (signalPeriod + 1), false);
  const hist = dif.sub(dea);
  ```
- **暖机位对齐**：慢线需要 $slowPeriod$ 暖机，信号线需要 $signalPeriod$ 暖机，总暖机位 $begIndex = slowPeriod + signalPeriod - 2$（默认 $26 + 9 - 2 = 33$）。通过切片完美匹配现有的暖机长度。

### 2.3 RSI（相对强弱指标）
- **底层原语**：`diff(1)` + `pl.when/then/otherwise` + Wilder `ewmMean(1 / period, false)`
- **映射规则**：
  ```typescript
  const df = pl.DataFrame({ close: closes });
  const diff = pl.col('close').diff(1, 'ignore');
  const gain = pl.when(diff.gt(0)).then(diff).otherwise(pl.lit(0));
  const loss = pl.when(diff.lt(0)).then(diff.abs()).otherwise(pl.lit(0));
  const alpha = 1 / period;
  const avgGain = gain.ewmMean(alpha, false);
  const avgLoss = loss.ewmMean(alpha, false);
  const rs = avgGain.div(avgLoss);
  const rsiExpr = pl.when(avgLoss.eq(0)).then(pl.lit(100)).otherwise(
    pl.lit(100).sub(pl.lit(100).div(pl.lit(1).add(rs)))
  );
  ```
- **纯 Rust 运行**：整个 RSI 计算在单个 Polars DataFrame 查询中一次性出结果，零中间 JS 数组。

### 2.4 KDJ（随机指标）
- **底层原语**：`rollingMin(period)` + `rollingMax(period)` + `ewmMean`
- **映射规则**：
  ```typescript
  const df = pl.DataFrame({ high: highs, low: lows, close: closes });
  const lowN = pl.col('low').rollingMin(period);
  const highN = pl.col('high').rollingMax(period);
  const denom = highN.sub(lowN);
  const rsv = pl.when(denom.eq(0)).then(pl.lit(50)).otherwise(
    pl.col('close').sub(lowN).div(denom).mul(100)
  );
  const k = rsv.ewmMean(1 / kSmoothing, false);
  const d = k.ewmMean(1 / dSmoothing, false);
  const j = k.mul(3).sub(d.mul(2));
  ```

### 2.5 ATR（真实波幅均值）
- **底层原语**：`shift(1)` + `pl.maxHorizontal` + `ewmMean(1 / period, false)`
- **映射规则**：
  ```typescript
  const df = pl.DataFrame({ high: highs, low: lows, close: closes });
  const prevClose = pl.col('close').shift(1);
  const tr1 = pl.col('high').sub(pl.col('low'));
  const tr2 = pl.col('high').sub(prevClose).abs();
  const tr3 = pl.col('low').sub(prevClose).abs();
  const tr = pl.maxHorizontal([tr1, tr2, tr3]);
  const atr = tr.ewmMean(1 / period, false);
  ```

### 2.6 ADX（平均趋向指标）
- **底层原语**：利用 Polars 差分、Directional Movement (`+DM`, `-DM`) 及连续 `ewmMean` 计算 `+DI`, `-DI` 与 `DX`，最终平滑为 `ADX`。

---

## 3. 依赖清理与架构防线

1. **卸载 `technicalindicators`**：
   - 执行 `pnpm remove technicalindicators`；
   - 彻底移出 `package.json` 与 `pnpm-lock.yaml`。
2. **守卫升级**：
   - 在 `libs/indicators/src/indicators-boundary.guard.spec.ts` 中移除针对 `technicalindicators` 的收敛检查；
   - 维持并强化 `nodejs-polars` 作为唯一数学底座的物理收敛检查。
