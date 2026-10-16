# 设计：指标计算口径修正与学派声明

## 审计基线

- 范围：`mist@master dae510fb`（工作区含未提交改动）+ `mist-alpha-private@master 3d4a24b`，只读审计。
- 影响链：DB/Redis bars → `k-strategy-bar-mapper` → 内核滑窗（`StrategySeriesImputer`）→ `volume-features.extractor` → 内核黑板 `volumeFeatures` → 因子插件（squeeze / VPCI）与决策流字段（`indicator.kdj.*` / `indicator.macd.*`）。
- 审计输出为 A 组（算法口径）/ B 组（数据口径）/ C 组（规范缺口）Findings；本 change 仅承接 A 组。

## 决策记录（对应 Findings A1–A9）

### D1 · BOLL 采用总体标准差（ddof = 0）— A1

- **实现事实**：nodejs-polars `rollingStd` 默认 ddof=1，且实测传 `{ddof: 0}` 被忽略（返回样本标准差），选项不可用。
- **决策**：`bollinger.ts` 的 std 改由共享算子 `computeRollingStdSeries(prices, period, { ddof: 0 })` 提供（其内部以 polars rollingStd × √((W−1)/W) 换算，是库内唯一 ddof 真源）；上下轨/带宽继续保持 Polars 表达式计算。禁止在 bollinger 内联重复换算因子（治理指南 §6.8 强制复用）。
- **备选与否决**：内联换算（重复 ddof 逻辑，两处漂移风险）；squeeze 单独保留 ddof=1（两套口径并存，加剧不一致）。
- **影响**：带宽收窄 √(19/20) ≈ 2.5% → "BB 在 KC 内部"的挤压判定更易成立 → squeeze 触发频率略升、放量爆发信号略增多（确定性方向，单测锁定）。

### D2 · KDJ 采用经典 SMA(X,3,1) 平滑 — A2

- **决策**：RSV 保持 `(close − LLV(low,9)) / (HHV(high,9) − LLV(low,9)) × 100`（平窗 50）；`K = SMA(RSV,3,1)`、`D = SMA(K,3,1)`，实现为 EWMA α = M/N = 1/3、`adjust=false`、种子为第一个满窗 RSV/K（`K_first = RSV_first`）；`J = 3K − 2D` 不变。
- **对齐契约不变**：`minRequired = 13`、首个输出仍对齐 index 12、`computeKdjObservation` = Series 尾部值；`STRATEGY_KDJ_CALCULATION_BAR_COUNT = 13` 与内核 insufficient_history 语义零改动。
- **已知残差**：通达信在 RSV 早期使用部分窗口（首根即有值），本实现丢弃预热、从满窗起算，早期数值存在与软件的 warm-up 学派差异（与 RSI/MACD 现有学派一致），收敛后一致；不追 partial-window parity。
- **影响**：`/v1/indicators/kdj` 数值变化；`indicator.kdj.*` 决策流字段值变化 → 存量策略信号可能翻转（验证任务中枚举并记录）。

### D3 · MACD 学派冻结（只声明，不改值）— A3

- **决策**：维持 TA-Lib 学派（EMA 以首窗 SMA 为种子；`histogram = DIF − DEA`）并在 `indicators-core` 显式声明为稳定约定；改为通达信口径（首值种子 / 柱 ×2）必须走显式 spec 变更。
- **理由**：`indicator.macd.histogram` 是策略可引用字段，×2 变更会静默放大/缩小所有存量策略阈值；种子差异只影响 warm-up 收敛路径，收益低。缠论力度（`force.ts`）只做同序列比较，不受任何子项影响。

### D4 · ADX 零真实波幅守卫 — A4

- **决策**：`pdi/mdi` 除 `tr` 前加 `tr > 0` 守卫（否则 0）；`dx` 侧 `diSum = 0 → 0` 守卫已有，补上后 NaN 源头消除。同时声明 DMI/ADX/ATR/RSI 统一采用 Wilder RMA 学派。
- **验证**：新增全平盘回归用例（断言有限、全 0、无 NaN）+ 常规序列 golden 回归。

### D5 · VWAP 精确口径与不可用语义 — A6

- **语义决策**：维持"窗口内累计"语义（不做 session 日内重置、不做锚定 VWAP；两者属未来单独立项），并在 spec 显式声明。
- **精度决策**：`computeVwapSeries / computeVwapObservation` 增加可选 `amounts` 输入——提供时加权源为 amount（窗口 VWAP = `Σamount / Σvolume`，等价真实成交均价）；未提供时保持 close×volume（兼容路径保留并有单测）。extractor 始终传 amounts。
- **不可用语义（fail-closed）**：extractor 读取 `amount.effective ?? amount.raw`；窗口内任一 bar 的 amount 缺失/非有限，或 `Σamount ≤ 0`（如历史 QMT amount 全 0 的已知病灶），则**返回 undefined、不装配 `volumeFeatures`**（复用既有"预热或降级相" insufficient 路径），插件按现约返回 NEUTRAL。
- **否决"局部降级（vwap 缺省）"**：会把"特征束可信性"决策下推到每个插件（含私有仓），并触发插件内 `vwap ?? 0` 的静默通过隐患（`close >= 0` 恒真）。
- **影响**：squeeze/VPCI 的 vwap 证据值变为精确口径；amount 不可用时两插件保守让位（符合治理指南"缺失不静默"）。

### D6 · OBV 首根语义（文字修正）— A5

- **决策**：代码不动（首根 OBV = 0，其后涨 `+volume` / 跌 `−volume` / 平盘不变）。修正 owning change delta 的表述（原文"首根自身的 volume（若涨）或 0"含糊）。

### D7 · volumeRatio 口径声明 — A7

- **决策**：不改行为；在 owning change delta 显式声明"Mist 口径 = 当期量 / 含当根的 5 根平滑均量；非时间归一的标准量比"。标准量比口径留给未来量比因子立项。

### D8 · TSRANK ↔ GTJA 映射注记（非规范）— A8

- 原语维持归一化 `(rank − 1)/(W − 1) ∈ [0,1]`（已被 extractor 的 `volumeTsRank` 阈值 0.75 消费，不可静默改默认）。
- GTJA Alpha191 的 TSRANK 消费口径为 pct-rank `rank / W ∈ (0,1]`；两者为线性映射：`pct = v × (W−1)/W + 1/W`，或使用 `normalize: false` 取原始平均秩后 `/W`。实现 Alpha191 因子层时按此换算，不新增原语参数（YAGNI）。
- 平窗语义：全等窗口 → 0.5；GTJA 社区 pct 实现为 `(W+1)/2W = 0.5 + 1/(2W)`，差 `1/(2W)`，在因子层逐因子对齐时记录。

### D9 · 斐波那契 rolling 口径声明 — A9

- 声明：`computeFibonacciSeries / computeFibonacciObservation` 的 ratio 为"滚动窗口极值"口径（窗口 high/low、恒从高点向下计），**非**缠论笔/段极值；rebound 方向由消费者自行换算 `(close − low)/diff`。落入 JSDoc + 本 design 记录；未来因子规范细化时正式化。

### D10 · 明确不做（本次排除）

- A3 换 TDX 种子 / histogram ×2（破坏存量策略阈值语义）；
- A7 改排除当根量比；
- A6 session VWAP / 锚定 VWAP；
- B 组数据口径（TDX volume 单位假设矛盾、复权链路、volume 静默补零、混合源滑窗）——均属治理指南 §5 "必须停下讨论"类事项，单独立项。

## 规范落点（跨 change 协调）

- **本 change**：`indicators-core` 三条 ADDED requirement（KDJ / MACD / ADX）。
- **`introduce-volatility-squeeze-and-vpci-plugins`**：flat spec 文件转换为合法 delta（`specs/volatility-indicators/`、`specs/vpci-indicator/`），并入 BOLL ddof=0 与提取器 amount/fail-closed 修正；tasks.md 加补正注记。**该 change 归档前须确认本 change 已完成**。
- **`introduce-naked-k-volume-plugin-and-clean-legacy`**：flat spec 文件转换为 `specs/volume-indicators/` 合法 delta，并入 OBV / VWAP / volumeRatio 修正；同上补正注记。

## 验证策略

- 确定性语义修正，**不做 shadow 观察**（既定规矩）：以独立 oracle 单测锁定：
  - KDJ：测试内按递推公式手写参考实现（独立 oracle）生成 golden，禁止用改后实现自生成 golden；
  - BOLL：手算总体标准差带值（已知序列），并断言与 ddof=1 值不同；
  - ADX：全平盘 → 全 0 且无 NaN，常规序列 golden 不变；
  - VWAP：构造 `amount/volume ≠ close` 的序列验证精确口径；amount 缺失/全零 → extractor 返回 undefined。
- 存量策略影响排查：检索引用 `indicator.kdj.*` 的策略定义（DB `strategy_definition` 与测试夹具），人工确认行为变化可接受。
- 门禁：`libs/indicators` + `libs/strategy` 全量单测、`pnpm typecheck`、`pnpm lint:check`、`pnpm check:magic`、三个 change 的 `openspec validate` 全绿。
