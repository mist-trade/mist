# 任务清单：指标计算口径修正与学派声明

- [ ] **阶段一：代码修正（`libs/indicators` + `libs/strategy`）**
  - [ ] 1.1 BOLL（A1）：`bollinger.ts` 的 std 改走 `computeRollingStdSeries(prices, period, { ddof: 0 })`，上下轨/带宽保持 Polars 表达式；`bollinger.spec.ts` 更新为独立手算 ddof=0 oracle，并断言与 ddof=1 值不同。
  - [ ] 1.2 KDJ（A2）：`kdj.ts` 的 K/D 平滑改为 SMA(X,3,1)（EWMA α=1/3、adjust=false、首个满窗 RSV/K 为种子），保持 13 根预热与对齐契约；`kdj.spec.ts` 用测试内递推参考实现（独立 oracle）重算两组 golden（14,3,3 与 9,3,3）。
  - [ ] 1.3 ADX（A4）：`adx.ts` 增加零真实波幅守卫（tr = 0 → +DI/−DI = 0；diSum = 0 → DX = 0 已有）；`adx.spec.ts` 新增全平盘无 NaN 用例 + 常规序列回归。
  - [ ] 1.4 VWAP（A6）：`vwap.ts` 增加可选 `amounts` 输入（精确口径 `Σamount / Σvolume`），保留 close×volume 兼容路径与零量守卫；`vwap.spec.ts` 新增精确口径与守卫用例。
  - [ ] 1.5 特征提取器（A6）：`volume-features.extractor.ts` 读取 amount（`effective ?? raw`）并传入 amounts；amount 缺失/非有限/`Σamount ≤ 0` 时返回 undefined（不装配 `volumeFeatures`）；`volume-features.extractor.spec.ts` 新增精确 VWAP oracle 与抑制路径用例。
  - [ ] 1.6 声明（A9）：`fibonacci.ts` JSDoc 注明 rolling 窗口口径（窗口极值、恒从高点向下计 ratio，非缠论笔/段极值）。
- [ ] **阶段二：影响面排查**
  - [ ] 2.1 检索 DB `strategy_definition` 与测试夹具中引用 `indicator.kdj.*` 的定义，人工确认 KDJ 数值变化后的策略行为可接受并记录。
  - [ ] 2.2 确认 squeeze / VPCI 相关测试（extractor spec、插件 spec）在新口径下的期望值更新与新行为一致。
- [ ] **阶段三：门禁与验证**
  - [ ] 3.1 `libs/indicators` 与 `libs/strategy` 相关全量单测 100% PASS。
  - [ ] 3.2 `pnpm typecheck`、`pnpm lint:check`、`pnpm check:magic` 零报错。
  - [ ] 3.3 `openspec validate fix-indicator-conventions`、`openspec validate introduce-volatility-squeeze-and-vpci-plugins`、`openspec validate introduce-naked-k-volume-plugin-and-clean-legacy` 三个全绿。
  - [ ] 3.4 归档前置检查：确认两个 owning change 的 delta 修正已生效后再执行其归档（否则修正不会进入 live spec）。
