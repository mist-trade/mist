# Proposal: 基于本地开发网关 API 的外部战术因子量化评估与极端压力测试

## 1. 背景与核心目标 (Context & Objectives)

Mist 量化交易系统近期完成了因果交易执行引擎（Next-Bar 撮合与 A 股制度摩擦）、持仓状态机、Rust Polars 纯数学绩效指标库（夏普比率、卡玛比率、最大回撤等）以及五大历史极端压力测试沙盒。

为评估通过 `ExternalFactorPluginLoader` 动态挂载的外部战术因子插件（包含宏观体制风控、多头/空头形态战术、波动率挤压及量价确认等抽象因子），本提案旨在建立一套标准、严谨、因果保真的量化评估流程。

### 核心目标与原则

1. **双轨评测矩阵（单因子纯度 vs 复合增强）**：
   - **单因子消融组**：分别将各个因子插件作为独立决策输入，检验单因子的纯 Alpha 贡献与独立胜率；
   - **复合决策流组**：组装包含宏观体制一票否决、左右侧战术及动量/量价确认的复合策略树，检验多因子协同增益；
2. **聚焦核心指标与极端生存测试**：
   - 核心关注年化**夏普比率 (Sharpe Ratio)** 与最大回撤；
   - 强制跑通系统预置的五大历史极端压力测试沙盒（2015 股灾、2016 熔断、2018 阴跌、2024 微盘雪球、2024 924 脉冲），输出《极端压力测试体检健康卡》；
3. **接口优先与本地开发服务器闭环 (Dev Server API Driven)**：
   - 评测流程必须严格通过本地开发服务器（`tools/strategy-dev/server.ts` HTTP 端口 8001）的公共接口（`POST /v1/strategy-backtests` 等）发起和获取结果；
   - 严禁手写外置孤立脚本绕过系统契约；
4. **架构刚性门禁 (Rigid Boundary Guard)**：
   - 建立门禁规范与测试，**严禁在评测流程中直接调用底层内部函数或绕过本地服务器接口**；
5. **知识产权与私有内容物理保密 (Confidentiality Invariant)**：
   - 本变更全套规格（OpenSpec）、公仓代码与接口定义必须保持纯抽象接口契约，**严禁泄露任何外部私有插件的具体算法、参数阈值与交易机密**。

---

## 2. 演进范围 (Scope & Non-Goals)

### Scope
- **Dev Server 回测接口增强**：在 `tools/strategy-dev/server.ts` 的 `POST /v1/strategy-backtests` 中接入已有的 `SimulatedBroker`、`PositionStateMachine`、`computePerformanceSummary`（Polars 夏普率）与 `StressTestingSuiteOrchestrator`（五大压力场景）；
- **Dev Server 事件循环保洁**：优化启动预热机制（引入宏任务分批让渡），消除对 Node.js 事件循环的微任务阻塞，保障 HTTP 接口毫秒级就绪；
- **回测边界守门门禁**：新增 `dev-server-api-boundary.guard.spec.ts`，守住“必须通过开发服务器 API 交互、严禁直调底层实现”的刚性红线；
- **上证指数日线实证回测**：基于本地 `000001_1d.json` 数据（严格遵守 1996 年涨跌停制度建立后的现代 A 股样本），通过 HTTP 接口执行单因子与复合策略评估，生成对比健康报告。

### Non-Goals
- 不修改公仓核心指标与缠论纯算法底座；
- 不在公仓披露或硬编码私有插件的专有逻辑与策略参数。
