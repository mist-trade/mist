# 实施计划：指标口径修正 + 斐波那契锚点迁移（代码级）

覆盖两个 code-bearing change：`fix-indicator-conventions`、`anchor-fibonacci-on-chan-swing-endpoints`
（两个 owning change 的 spec delta 已在第一步完成，无代码工作）。
规划文档（OpenSpec）已定稿：本文件是"具体代码怎么落地"的实施计划，普通 markdown。

---

## 0. 前置与实施方式

1. **提交 spec 产出**（需用户确认）：仅 stage 本次 openspec 相关改动（`openspec/changes/fix-indicator-conventions/`
   新增、`anchor-fibonacci-on-chan-swing-endpoints/` 新增、两个 owning change 的 spec 转换与 tasks 注记），
   不动工作区里其他既有未提交改动（`apps/backtest`、`libs/market-data`、`upgrade-backtest-decision-*` 等）。
2. **建 worktree**：`mist/.worktrees/fix-indicator-conventions`（从提交后的 master 建），
   `ln -s ../../node_modules node_modules`（新 worktree 无 node_modules；`pnpm run` 的 .bin 依赖该链接）。
3. **实施顺序**：A 组指标修正 → 提取器 → 斐波那契插件 → 可视化 → 测试与门禁。
4. **不做**：external-plugins 无改动（vwap 缺省隐患已由提取器 fail-closed 消解）；无 DB / migration / 部署改动。

---

## 1. 代码改动清单

### 1.1 `libs/indicators/src/bollinger.ts` — BOLL 总体标准差（A1）

- `import { computeRollingStdSeries } from './time-series';`
- 替换 `:59-96` 计算块：

```ts
const begIndex = period - 1;
const stdResult = computeRollingStdSeries(prices, period, { ddof: 0 });
const s = pl.Series('price', prices as any).cast(pl.Float64);
const meanArr = (s.rollingMean(period).toArray() as (number | null)[]).slice(begIndex) as number[];
const df = pl.DataFrame({ mean: meanArr, std: stdResult.values });
// upper / lower / bandwidth 表达式与守卫不变（when(mean>0) 保留）
// 数组已是裁剪后形态，返回时不再二次 slice
```

- 禁止内联 Bessel 换算因子（spec 明文）。`begIndex = period - 1`、`length < period` 空返回分支不变。

### 1.2 `libs/indicators/src/kdj.ts` — 经典 SMA(X,3,1)（A2）

- 替换 `:69-83` 平滑块：

```ts
const alpha = 1 / kSmoothing; // SMA(X,N,M=1) → α = M/N = 1/N
const kFull = pl.Series(fK).ewmMean(alpha, false).toArray() as number[];
const dFull = pl.Series(kFull).ewmMean(alpha, false).toArray() as number[];
const drop = kSmoothing + dSmoothing - 2; // 保持首个输出对齐 index (period+k+d-3)
const K = kFull.slice(drop);
const D = dFull.slice(drop);
const J = pl.Series(K).mul(3).sub(pl.Series(D).mul(2)).toArray() as number[];
return { begIndex: close.length - K.length, K, D, J };
```

- 契约核验：默认 (9,3,3) → begIndex 12、长度 len−12（现状一致）；(14,3,3) → begIndex 17（现状一致）。
  `minRequired=13`、平窗 RSV=50 fallback、`computeKdjObservation` 均不动。

### 1.3 `libs/indicators/src/adx.ts` — 零真实波幅守卫（A4）

- 替换 `:84-85`：

```ts
const pdi = pl.when(pl.col('tr').gt(0)).then(pl.col('pdm').div(pl.col('tr')).mul(100)).otherwise(pl.lit(0));
const mdi = pl.when(pl.col('tr').gt(0)).then(pl.col('mdm').div(pl.col('tr')).mul(100)).otherwise(pl.lit(0));
```

- `dx` 的 `diSum=0 → 0` 守卫已存在，不动。全平盘 → ADX 恒 0、无 NaN。

### 1.4 `libs/indicators/src/vwap.ts` — amounts 精确口径（A6 指标侧）

- `VwapOptions` 增加 `readonly amounts?: readonly number[]`。
- 校验：`amounts` 提供时长度必须等于 `closes`，否则 `IndicatorInputError`。
- 计算：

```ts
const pvExpr = amounts !== undefined ? pl.col('amount') : pl.col('close').mul(pl.col('volume'));
// DataFrame 按需加入 amount 列；rollingSum / cumSum 与 window 分支不变
const vwapExpr = pl
  .when(volSumExpr.gt(0).and(pvSumExpr.gt(0)))
  .then(pvSumExpr.div(volSumExpr))
  .otherwise(pl.col('close'));
```

- 语义声明（注释 + spec 已写）：窗口内累计，无日内重置；`amounts` 提供时 `Σamount/Σvolume`。

### 1.5 `libs/indicators/src/volume.ts` — 标准量比（A7）

- 替换 `:48-70` 的 ratio 部分：

```ts
const prevVma5 = s.rollingMean(p1).shift(1); // 前 5 根均量（不含当根）
const ratioExpr = pl.when(prevVma5.gt(0)).then(pl.col('volume').div(prevVma5)).otherwise(pl.lit(1.0));
```

- `vma5/10/20`（含当根常规均线）、`begIndex = maxPeriod-1 = 19` 均不变。

### 1.6 `libs/strategy/src/factor/helpers/volume-features.extractor.ts` — amount + fail-closed（A6 消费侧）

- `ExtractedBar` 增加 `amount: number | null`；`parseBar` 三分支均解析
  `amount.effective ?? amount.raw ?? rawBar.amount`，非有限 → `null`。
- `extractVolumeFeatures`：
  1. 收集 `amounts: (number|null)[]`；
  2. `total < 30` 检查之后、计算特征之前：

```ts
const amountUsable =
  amounts.length === closes.length &&
  amounts.every((a): a is number => a !== null && Number.isFinite(a)) &&
  amounts.reduce((sum, a) => sum + (a as number), 0) > 0;
if (!amountUsable) return undefined; // 不装配 volumeFeatures，不混口径、不补零
```

  3. `computeVwapObservation(closes, volumes, { amounts: amounts as number[] })`。
- 内核 `buildContext` 已 `if (vf) attributes.set(...)`，无需改动。

### 1.7 新文件 `libs/strategy/src/analysis/chan-derivation.ts` — 共享缠论推导（§6.8 防重复实现）

```ts
export type ChanSwingUnitLevel = 'bi' | 'duan';
export function toChanKSeries(bars: readonly ProjectedStrategyBar[]): readonly ChanK[];
// 自 chan-bsp.plugin.ts 私有方法原样迁移（id=i+1 / rawBar.securityId / ohlc.effective / volume/amount effective）

export function deriveCompletedBis(klines: readonly ChanK[]): readonly ChanBi[];
// ChanCore.createBi(klines).phaseB.filter(b => b.type === BiType.Complete && b.status === BiStatus.Valid)

export function deriveCompletedDuans(klines: readonly ChanK[]): readonly ChanDuan[];
// ChanCore.createDuan(deriveBis 的 phaseB).filter(d => d.type === DuanType.Complete && d.status === DuanStatus.Valid)

export function findLastCompletedSwing(
  klines: readonly ChanK[],
  units: ChanSwingUnitLevel,
): ChanBi | ChanDuan | null; // 取对应列表最后一根；空列表 → null
```

- `chan-bsp.plugin.ts` 重构为使用 `toChanKSeries`（删私有方法）与 derive 函数（行为不变，现有测试守门）。

### 1.8 `libs/strategy/src/factor/plugins/fibonacci.plugin.ts` — 重写锚点

- `paramSchema`：移除 `period`；新增 `units: { enum: ['bi','duan'], default: 'bi' }`；保留 `toleranceRatio`（0.008）、`direction`（pullback/rebound/both）；`version` 升至 `2.0.0`。
- `evaluate` 流程：

```ts
const units = rawParams?.units === 'duan' ? 'duan' : 'bi';
const minBars = units === 'duan' ? DEFAULT_REQUIRED_BARS_DUAN : DEFAULT_REQUIRED_BARS_BI; // 200 / 50
if (context.bars.length < minBars) return NEUTRAL(/* 根数不足，无法确立缠论结构 */);

const klines = toChanKSeries(context.bars);
const unit = findLastCompletedSwing(klines, units);
if (!unit) return NEUTRAL(/* 未形成已确认的${units}，不回退滚动窗口 */);

const latestClose = 最后一根有效 bar 的 ohlc.effective.close;
const swingDirection = unit.trend === TrendDirection.Up ? 'up' : 'down';
const obs = computeStaticSwingFibonacci(unit.high, unit.low, latestClose, swingDirection, { toleranceRatio });
// pullback（up 单元）: obs.isGoldenPocket → BUY
// rebound（down 单元）: obs.isGoldenPocket → SELL
// 其余 → NEUTRAL（沿用现有 zone 文案风格）
```

- `evidence` 扩展：`units / swingDirection / swingStartTime / swingEndTime / swingStartPrice(=low) / swingEndPrice(=high)`
  + 既有 `high / low / close / diff / ratio / zone / isGoldenPocket / levels / styles`。
- 复用 `computeStaticSwingFibonacci` / `computeFibonacciLevels`（当前零生产调用，本次转正）；禁止在插件内重写档位数学。
- 移除对 `computeFibonacciObservation` 的 import。

### 1.9 `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts` — 同源锚点

- 输入改为 `readonly ChanK[]`（与 `ChanVisualAdapter` 一致）；`FibonacciVisualOptions` 移除 `period`、新增 `units?: 'bi' | 'duan'`。
- 流程：
  1. `const unit = findLastCompletedSwing(klines, units)`（见 1.10 util）；`null → return []`；
  2. `const levels = computeFibonacciLevels(unit.high, unit.low, unit.trend === Up ? 'up' : 'down')`，使用 `levels.levelsByRatio`；
  3. `startIndex = klines.findIndex(k => k.time.getTime() === unit.startTime.getTime())`（找不到时安全回退 0），`endIndex = klines.length - 1`；
  4. band（5 对）/ line（7 档）/ text 生成逻辑与 TradingView 样式**原样保留**。

### 1.10 新文件 `libs/visual-command/src/adapters/chan-swing.util.ts` — 可视化侧共享选笔

```ts
export function findLastCompletedSwing(klines: readonly ChanK[], units: 'bi' | 'duan'): ChanBi | ChanDuan | null;
```

- 与 1.7 策略侧同语义（该 lib 不能依赖 `@app/strategy`，本地实现同款过滤；`chan-visual.adapter.ts` 现有滤波逻辑保持不动，避免大改）。

### 1.11 `libs/visual-command/src/visual-command.service.ts`

- 仅类型层变更（`FibonacciVisualOptions` 变化自动透传）；`fibOptions` 传参逻辑不变。

### 1.12 `libs/indicators/src/fibonacci/fibonacci.ts` — rolling 算子 JSDoc

- 在 `computeFibonacciSeries` / `computeFibonacciObservation` 头注释声明：滚动窗口极值口径、ratio 恒从
  高点向下计、非缠论笔/段端点；算子保留（无生产消费方，保留理由记录在 change design D7）。

---

## 2. 测试改动清单

| 文件 | 改动 |
|---|---|
| `libs/indicators/src/bollinger.spec.ts` | 期望值改为 ddof=0 手算 oracle；新增"与 ddof=1 结果不同"断言；保留 flat/不足输入用例 |
| `libs/indicators/src/kdj.spec.ts` | 测试内新增独立递推 oracle（按 SMA(X,3,1) 手写）；(14,3,3) 与 (9,3,3) 两组 golden 重算并断言 == oracle；begIndex（17/12）与长度（63/68）断言保留；新增平窗 K=D=J=50 用例 |
| `libs/indicators/src/series.spec.ts` | ADX 部分新增全平盘用例：全部输出为有限 0、无 NaN；既有 golden 回归不变 |
| `libs/indicators/src/vwap.spec.ts` | 新增：amounts 精确口径（构造 amount/volume ≠ close，断言 Σamount/Σvolume）；amounts 长度不匹配抛错；全零 amounts → fallback close；保留累计/滚动既有用例 |
| `libs/indicators/src/volume.spec.ts` | ratio 期望改为 `v[t]/mean(v[t−5..t−1])`；新增"当根巨量不改变分母"用例；零分母 guard 用例更新 |
| `libs/strategy/src/factor/helpers/volume-features.extractor.spec.ts` | fixtures 已带 amount；新增：vwap == Σamount/Σvolume oracle；构造 amount 缺失 → `undefined`；Σamount=0 → `undefined` |
| `libs/strategy/src/factor/plugins/fibonacci.plugin.spec.ts` | 重写：构造合成序列（先跌后涨形成已完成笔，再小幅回撤进黄金口袋），以真实 ChanCore 输出为行为基准固化断言。用例：向上笔 GP → BUY（evidence 含锚点）；向下笔反弹 GP → SELL；无已完成笔 → NEUTRAL 且不产 rolling 锚；`units:'duan'` 无段 → NEUTRAL；根数不足 → NEUTRAL；metadata/paramSchema（默认 bi、无 period） |
| `libs/strategy/src/factor/plugins/chan-bsp.plugin.spec.ts` | 仅守门（共享化重构后必须全绿，行为不变） |
| `libs/visual-command/src/adapters/fibonacci-visual.adapter.spec.ts` | 重写：存在已完成笔 → 5 band / 7 line + Golden Pocket 色值断言 + 起点=笔起点；无笔 → 空数组 |
| `libs/visual-command/src/visual-command.service.spec.ts` | `fibOptions: { period: 50 }` → `{ units: 'bi' }`；fibonacci layer 用例 fixture 调整为含已完成笔序列；补无笔 → 空用例 |

**测试构造注意**：合成序列需过真实 `ChanCore.createBi`（宽笔：顶底分型不共用 K、极值 K 相隔 ≥3 根）。
实施时先用临时调试脚本确认笔结构与端点值，再固化到断言；不对 chancore 逻辑做任何改造。

---

## 3. 影响面排查

1. **存量策略**：`ssh mist-box` 只读查询 MySQL（`strategy_definition` / `strategy_version` 定义 JSON）
   `LIKE '%indicator.kdj%'` 与 `LIKE '%plugin.technical.fibonacci%'`，输出引用的策略清单并人工确认行为变化可接受
   （实施时先确认表名与列名）。
2. **全仓检索**：`grep -rn "volumeRatio\|fibOptions\|computeFibonacciObservation" apps/ libs/ tools/`，
   确认除已列消费方外无遗漏（含 `tools/strategy-dev`）。

---

## 4. 验证命令

```bash
# 定向（实施过程中反复跑）
pnpm -C mist test libs/indicators/src libs/strategy/src/factor libs/strategy/src/analysis libs/visual-command/src --forceExit

# 三大架构门禁（应不受影响，但必须复验）
pnpm -C mist test libs/strategy/src/dev-server-boundary.guard.spec.ts libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts libs/strategy/src/strategy-dual-timestamp.guard.spec.ts

# 静态
pnpm -C mist typecheck
pnpm -C mist lint:check
pnpm -C mist check:magic

# 全量
pnpm -C mist test:ci

# 规范
openspec validate fix-indicator-conventions --strict
openspec validate anchor-fibonacci-on-chan-swing-endpoints --strict
openspec validate introduce-volatility-squeeze-and-vpci-plugins --strict
openspec validate introduce-naked-k-volume-plugin-and-clean-legacy --strict
openspec validate --specs --strict
```

（`test` 的 jest 调用形式以 `mist/package.json` scripts 为准；`test:ci` 必须带 `--forceExit` 的既有约定不变。）

---

## 5. 提交与归档顺序

1. 代码+测试完成后：本地提交（commit 作者身份先核验 `git config`）。
2. **归档前置**：三个 change 的实现全部落地且门禁全绿后，依序归档四个 change
   （CLI `openspec archive <name> -y`；注意 CLI 1.6.0 限制与 `--skip-specs` 分支；归档后手动 commit）。
   `anchor-fibonacci` 归档时 LIVE `chan-fibonacci-overlay` 走 MODIFIED 合并（已携带全部既有场景名）。
3. 推送/部署：由用户决定（无部署动作，纯仓库变更）。

## 6. 风险与回退

- 行为变化均为确定性语义修正，由独立 oracle 单测锁定；不做 shadow 观察（既定规矩）。
- 影响半径：KDJ 数值（策略信号）、squeeze 触发频率、VWAP 证据值、量比数值、斐波那契信号、可视化覆盖层。
- 回退：按 change 粒度 revert 提交即可；无 DB/migration/部署依赖。
