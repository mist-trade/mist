# 提案：指标计算口径修正与学派声明（KDJ 经典平滑 / MACD 学派冻结 / ADX 平盘守卫 / BOLL 总体标准差 / VWAP 精确口径）

## 1. 背景（Why）

2026-10-16 对 `libs/indicators` 与因子消费链做全量口径审计（A 组 Findings），确认以下与经典定义或声明口径的偏离。这些偏离直接影响波动率挤压因子（squeeze）、量价确认因子（VPCI）与决策流 `indicator.kdj.*` / `indicator.macd.*` 字段的数值真值：

- **A1 BOLL**：`bollinger.ts` 直接使用 polars `rollingStd`（实测默认 ddof=1 样本标准差，且传 `{ddof:0}` 选项被 nodejs-polars 忽略），与经典 Bollinger/通达信 STD 的总体标准差（ddof=0）偏离，带宽系统性偏宽 √(20/19)≈+2.6%，导致 squeeze 触发频率/时点偏移。
- **A2 KDJ**：K/D 平滑使用 3 日简单均线（等价 Western Slow Stochastic），与经典 `SMA(X,3,1)`（EWMA α=1/3，通达信等主流软件口径）不符；`indicator.kdj.k/d/j` 为决策流可引用字段，属策略可见行为。
- **A3 MACD**：EMA 采用 TA-Lib 学派 SMA 种子、histogram = DIF − DEA（非通达信 2×），从未被规范声明固化，存在被无意改动的风险。
- **A4 ADX**：零真实波幅（全平盘）时 0/0 产出 NaN 并污染整条序列，无熔断（KDJ/RSI/BOLL 均有熔断）。
- **A5 / A6 / A7**：OBV 首根语义的规范文字含糊；VWAP 为 close×volume 近似且语义未声明，需切换 amount 精确口径并明确不可用时的降级语义；量比（volumeRatio）需改为标准量比口径（当期量 / 不含当根的前 5 根均量）。
- **A8 / A9**（仅声明，不改代码）：TSRANK 归一化与 GTJA pct-rank 的换算关系；斐波那契 rolling 口径（窗口极值、恒从高点向下计 ratio）。

审计同时发现：`introduce-volatility-squeeze-and-vpci-plugins` 与 `introduce-naked-k-volume-plugin-and-clean-legacy` 两个活跃 change 的 `specs/*.spec.md` 采用 flat 叙述文件，不符合 OpenSpec delta 格式（`specs/<capability>/spec.md` + `## ADDED Requirements` + `### Requirement:` + `#### Scenario:`），`openspec validate` 直接报 "No deltas found"，归档时无法自动合入 live spec。本变更将三个文件转换为合法 delta 格式（内容保真、同步并入下述口径修正），保证修正后的规范能正确进入 live spec。

## 2. 变更内容（What Changes）

1. **本 change 的 delta（`indicators-core` 三条 ADDED requirement）**：
   - KDJ 平滑改为经典 `SMA(X,3,1)`（EWMA α=1/3、adjust=false、首个满窗 RSV 为种子），保持 13 根预热/对齐契约不变；
   - MACD 学派冻结声明：SMA 种子 EMA + `histogram = DIF − DEA`（非通达信 parity），改动需显式 spec 变更；
   - DMI/ADX 零真实波幅守卫：平盘产出 0、永不 NaN；Wilder RMA 学派显式声明。
2. **`introduce-volatility-squeeze-and-vpci-plugins` delta 转换与修正**：
   - BOLL std 声明为总体标准差（ddof=0，复用 `computeRollingStdSeries`，禁止内联重复换算）；
   - 特征提取器：VWAP 切换 amount 精确口径（窗口累积 `Σamount / Σvolume`），amount 缺失/非有限或 `Σamount ≤ 0` 时不装配 `volumeFeatures`（走既有 insufficient/降级路径，不静默混口径）。
3. **`introduce-naked-k-volume-plugin-and-clean-legacy` delta 转换与修正**：
   - OBV 首根 = 0 的语义修正；
   - VWAP 支持可选 `amounts` 精确口径 + 窗口内累计语义声明（非 session 重置）；
   - `volumeRatio` 改为**标准量比口径**（当期量 / 不含当根的前 5 根均量）；盘中时间归一化版本声明为不做。
4. **只声明不改代码**：TSRANK↔GTJA pct-rank 映射注记（design.md）。斐波那契锚点迁移（A9）经评估改为独立 change `anchor-fibonacci-on-chan-swing-endpoints` 承接，rolling 算子保留为库原语。

## 3. 影响（Impact）

- 代码面：`libs/indicators`（`bollinger.ts` / `kdj.ts` / `adx.ts` / `vwap.ts`）与 `libs/strategy`（`volume-features.extractor.ts`）+ 对应 spec 测试；无 HTTP 契约/OpenAPI/DTO/数据库/部署变更。`POST /v1/indicators/kdj` 数值变化但响应结构不变。
- 行为变化（确定性语义修正，非数据迁移）：
  - BOLL 带宽收窄约 2.5% → squeeze 触发频率略升、放量爆发信号略增多；
  - KDJ K/D/J 数值变化 → `indicator.kdj.*` 决策流策略信号可能翻转（验证阶段枚举受影响策略）；
  - VWAP 变为精确口径 → squeeze/VPCI 的"站稳 VWAP"判定更准确；amount 不可用时两插件保守让位；
  - 量比改为标准口径 → `volumeRatio` 数值变化（仅证据字段，无阈值影响）。
- 明确不做：MACD 换 TDX 种子 / histogram ×2（破坏存量策略阈值语义）；量比的盘中时间归一化版本；session VWAP；B 组数据口径问题（TDX volume 单位假设、复权链路、volume 静默补零）——属"必须停下讨论"类事项，单独立项。
- 本变更完成前，两个 owning change 不得归档（其 delta 修正须先行生效）。
