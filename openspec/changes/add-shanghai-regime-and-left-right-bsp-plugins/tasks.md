# Tasks: 上证指数牛熊插件、主仓纯透传架构与茅台全量清理

## 1. 全仓茅台资产全量清理 (Maotai Assets Complete Purge)
- [ ] 1.1 前端快照与用例清理 (`mist-fe/`):
  - 删除 `mist-fe/__fixtures__/snapshots/chan/maotai-2024-2025/` 目录
  - 删除 `mist-fe/__fixtures__/snapshots/chan/maotai-2024-2026/` 目录
  - 删除 `mist-fe/__fixtures__/cases/chan/maotai-2024-2025.ts`
  - 删除 `mist-fe/__fixtures__/cases/chan/maotai-2024-2026.ts`
  - 在 `mist-fe/__fixtures__/cases/index.ts` 中移除茅台测试用例，默认仅保留上证指数
- [ ] 1.2 前端与开发工具默认代码切换:
  - 将 `mist-fe/app/k/KLineLivePage.tsx` 的 `DEFAULT_CODE = "600519"` 改为 `"000001"`
  - 将 `mist/tools/strategy-dev/runner.ts` 与 `sync.ts` 中的默认降级代码从 `'600519'` 改为 `'000001'`
  - 清理相关页面下拉选项与输入框 placeholder 中的“茅台”字样
- [ ] 1.3 chancore 黄金测试夹具更新与哈希锁定:
  - 更新 `mist/libs/chancore/src/chan-full-output.characterization.fixture.ts`，将数据替换为上证指数
  - 同步更新 `chan-full-output.characterization.spec.ts` 中的 SHA-256 哈希期望值，确保单测全绿
- [ ] 1.4 清理全仓测试、注释与配置中的 `600519` 与“茅台”字样，更新静态基线

## 2. 主仓与前端“纯透传（Transparent Pass-Through）”重构 (`mist/` & `mist-fe/`)
- [ ] 2.1 扩展因子契约 `mist/libs/strategy/src/factor/factor.types.ts`:
  - 在 `FactorOpinion` 中增加 `badgeText`、`displayTag`、`styleMeta` 可选展示元数据字段
- [ ] 2.2 重构策略内核与推演映射器:
  - 在 `mist/libs/strategy/src/simulation/kernel-signal-mapper.ts` 中彻底移除 `formatBadgeText` 硬编码字典，改为直接透传 `badgeText`
  - 清理 `decision-pivot-evidence.ts` 中的中文正则硬编码匹配
- [ ] 2.3 前端纯透传改造:
  - 在 `mist-fe/app/backtests/utils/backtest-signal-visual.util.ts` 中彻底删除 `CHAN_LABEL_MAP` 及所有 `rawType === "first_buy"` 硬编码判断，统一优先取用 `sig.badgeText`
  - 在 `BacktestSignalTable.tsx` 和 `BacktestReplayBar.tsx` 中彻底移除硬编码映射，改为透传 `sig.badgeText`
- [ ] 2.4 编写纯透传专项单元测试，验证自定义插件的 `badgeText` 能 100% 无损贯穿整个链路

## 3. 上证指数全局牛熊判断插件实现 (`mist/libs/strategy/`)
- [ ] 3.1 基于 Rust `nodejs-polars` 在 `libs/indicators` 封装/使用双长均线斜率算子（MA60, MA250, Slope250）
- [ ] 3.2 编写 `ShanghaiRegimePlugin` 单元测试 `shanghai-regime.plugin.spec.ts`（红灯先行）：
  - 覆盖上证指数年线上方多头排列（`BULL` / `BUY`）
  - 覆盖上证指数年线下方空头排列（`BEAR` / `SELL`）
  - 覆盖均线纠缠震荡市（`SIDEWAYS` / `NEUTRAL`）
- [ ] 3.3 实现 `libs/strategy/src/factor/plugins/shanghai-regime.plugin.ts`:
  - 严禁 JS 循环，纯 Polars 向量化计算
  - 支持单标的上证指数日线直接求值，并抽象标准跨标的行情查询接口保证本地 mock 与线上一致
- [ ] 3.4 在 `standard-plugins.ts` 中注册 `ShanghaiRegimePlugin`，确认单测全绿

## 4. 私有仓左右侧买卖点逻辑（等待用户专门讨论）
- [ ] 4.1 在私有仓保留标准扩展骨架，暂不编写未经确认的买卖形态逻辑
- [ ] 4.2 待与用户讨论确定后，再实施具体左右买卖点算法并由插件自主输出定制 `badgeText`

## 5. 本地模拟数据推演验证与架构门禁全绿 (Verification & Delivery)
- [ ] 5.1 使用本地上证指数真实黄金数据（`shanghai-index-2024-2025/` 与 `000001_1d.json`）跑通推演与全套测试
- [ ] 5.2 运行三大架构门禁测试（`dev-server-boundary`、`homogeneity`、`dual-timestamp`）
- [ ] 5.3 运行防泄漏门禁测试 `external-isolation.guard.spec.ts`
- [ ] 5.4 验证全仓无任何茅台残留、单测全绿，准备合并提交到 `master`
