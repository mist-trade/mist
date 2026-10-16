# 任务清单：指标计算口径修正与学派声明

- [x] **阶段一：代码修正（`libs/indicators` + `libs/strategy`）**
  - [x] 1.1 BOLL（A1）：`bollinger.ts` 的 std 改走 `computeRollingStdSeries(prices, period, { ddof: 0 })`，上下轨/带宽保持 Polars 表达式；`bollinger.spec.ts` 更新为独立手算 ddof=0 oracle，并断言与 ddof=1 值不同。
  - [x] 1.2 KDJ（A2）：`kdj.ts` 的 K/D 平滑改为 SMA(X,3,1)（EWMA α=1/3、adjust=false、首个满窗 RSV/K 为种子），保持 13 根预热与对齐契约；`kdj.spec.ts` 用测试内递推参考实现（独立 oracle）重算两组 golden（14,3,3 与 9,3,3）。
  - [x] 1.3 ADX（A4）：`adx.ts` 增加零真实波幅守卫（tr = 0 → +DI/−DI = 0；diSum = 0 → DX = 0 已有）；`series.spec.ts` 新增全平盘无 NaN 用例 + 常规序列 golden 回归。
  - [x] 1.4 VWAP（A6）：`vwap.ts` 增加可选 `amounts` 输入（精确口径 `Σamount / Σvolume`），保留 close×volume 兼容路径与零量守卫；`vwap.spec.ts` 新增精确口径、滚动口径与守卫用例。
  - [x] 1.5 特征提取器（A6）：`volume-features.extractor.ts` 读取 amount（`effective ?? raw`）并传入 amounts；amount 缺失/非有限/`Σamount ≤ 0` 时返回 undefined（不装配 `volumeFeatures`）；`volume-features.extractor.spec.ts` 新增精确 VWAP oracle 与两条抑制路径用例。
  - [x] 1.6 量比（A7）：`volume.ts` 的 `volumeRatio` 改为标准口径 `volume / shift(rollingMean(volumes, 5), 1)`（分母 0 → 1.0）；`volume.spec.ts` 更新并新增"当根不入分母"用例。
- [x] **阶段二：影响面排查**
  - [x] 2.1 检索生产 DB（`strategy_definitions` / `strategy_versions`）中引用 `indicator.kdj.*` 的策略定义：共 22 条版本，引用数 0；`squeeze` / `vpci` / `fibonacci` 引用数同为 0 —— 无存量策略受数值变化影响。
  - [x] 2.2 squeeze / VPCI 相关测试确认：extractor spec 已更新并通过；两个插件（私仓）仅只读消费 `volumeFeatures` attribute、契约未变，无需改动。
- [x] **阶段三：门禁与验证**
  - [x] 3.1 `libs/indicators` / `libs/strategy` / `libs/visual-command` 定向全量 317 项通过；全仓 `test:ci` 1951 通过，仅 2 条失败为并行提交 `d20a6d0d` 引入的既有失败（已在基线 worktree 复现证实与本 change 无关）。
  - [x] 3.2 `pnpm typecheck`、`pnpm lint:check` 零报错；`pnpm check:magic` 基线缺口的全部条目均来自并行提交文件（`candle-finalizer.ts` / `backtest-run.executor.ts`），本 change 文件零新增魔法值。
  - [x] 3.3 四个 change `openspec validate --strict` 全绿。
  - [ ] 3.4 归档前置检查：确认两个 owning change 的 delta 修正已生效后再执行其归档（否则修正不会进入 live spec）。

> 证据：KDJ 实现与测试内独立递推 oracle 全序列 `toBeCloseTo(…, 10)` 一致；三大架构门禁
> （dev-server-boundary / pipeline-homogeneity / dual-timestamp）与 indicators-boundary 全 PASS。
