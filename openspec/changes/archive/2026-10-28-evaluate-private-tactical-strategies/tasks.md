# Tasks: 基于本地开发网关 API 的外部战术因子评估实施任务清单

- [x] 1. 架构与保密门禁守门 (Architecture & Confidentiality Guardrails)
  - [x] 1.1 编写 `libs/strategy/src/dev-server-api-boundary.guard.spec.ts`，静态核验回测与评估调用流程禁止绕过 HTTP 接口直调内部底层函数
  - [x] 1.2 门禁核验：确保公仓 OpenSpec 与测试用例中不包含任何外部私有插件的专有公式、机密参数与硬编码路径
  - [x] 1.3 运行并确认门禁测试绿灯通过

- [x] 2. 本地 Dev Server 接口与事件循环增强 (Dev Gateway Enhancement)
  - [x] 2.1 优化 `tools/strategy-dev/server.ts` 启动机制，支持 `SKIP_DEV_PREHEAT=true` 环境变量并在推流循环中引入 `setImmediate` 让渡，消除微任务占满 Node.js 事件循环
  - [x] 2.2 在 `tools/strategy-dev/server.ts` 的 `POST /v1/strategy-backtests` 中集成 `SimulatedBroker`（Next-Bar 撮合与 A 股制度摩擦）、`PositionStateMachine`（盯市日收益率）与 `computePerformanceSummary`（Rust Polars 夏普比率）
  - [x] 2.3 在 `tools/strategy-dev/server.ts` 的 `POST /v1/strategy-backtests` 中接入 `StressTestingSuiteOrchestrator`，支持联动执行五大极端黑天鹅压力沙盒并返回 `stressReport`
  - [x] 2.4 重启 Dev Server 并验证 `POST /v1/strategy-backtests` HTTP 接口响应秒级返回与 Schema 正确性

- [x] 3. 单因子纯度量化评估（调用本地开发服务器 HTTP 接口）
  - [x] 3.1 通过 HTTP API 调用 `POST /v1/strategy-backtests` 评测宏观体制风控因子（年线与双频突破）
  - [x] 3.2 通过 HTTP API 调用 `POST /v1/strategy-backtests` 评测多头战术因子（牛市左右侧买卖点）
  - [x] 3.3 通过 HTTP API 调用 `POST /v1/strategy-backtests` 评测空头防守战术因子（熊市超跌反弹与二三卖防守）
  - [x] 3.4 通过 HTTP API 调用 `POST /v1/strategy-backtests` 评测动量挤压与量价确认因子（波动率挤压爆发与 VPCI）
  - [x] 3.5 收集各单因子的年化夏普比率、胜率、盈亏比与独立交易频率

- [x] 4. 复合策略树与全天候决策流增强评估（调用本地开发服务器 HTTP 接口）
  - [x] 4.1 组装复合决策流（宏观体制一票否决 + 左右侧形态雷达 + 动量/量价二次确认），通过 HTTP API 提交全量回测
  - [x] 4.2 对比基准形态与复合决策流的夏普率提升幅度与最大回撤降低幅度（消融增益分析）

- [x] 5. 五大历史极端黑天鹅压力测试体检
  - [x] 5.1 通过 HTTP 接口运行五大历史压力沙盒（2015 股灾、2016 熔断、2018 阴跌、2024 微盘挤兑、2024-924 脉冲）
  - [x] 5.2 提取最差单日收益、最长回撤潜伏期（Underwater Duration）与流动性延迟损失（Liquidity Delay Loss）
  - [x] 5.3 汇总五大场景的生存评级（PASS / MARGINAL / FAIL）与健康综合评分

- [x] 6. 综合量化体检报告交付 (Delivery & Reporting)
  - [x] 6.1 聚合单因子与复合策略评估指标，生成清晰对比矩阵（回答哪个因子有效、哪个因子提供风控盾牌、哪个因子存在滞后）
  - [x] 6.2 给出基于 A 股真实制度摩擦的实战准入与上线配置建议
