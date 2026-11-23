# 实施任务清单：出场插件同构化与决策树统一收敛 (Tasks)

> **实施准则**：严格依照 TDD 流程执行，先红灯用例，再写极简实现，最后安全重构；通过一项勾选一项。

## 阶段一：公仓决策树与加载器同构支持 (mist)

- [x] 1.1 **扩展测试套件：验证决策流分支节点支持持仓分流与出场动作**
  - 文件：`mist/libs/strategy/src/decision-flow/decision-flow-evaluator.spec.ts`
  - 编写用例验证：
    - `BranchNode` 基于 `condition.attributeKey: 'position.virtual.state'` 成功分流；
    - 挂载 `category: 'EXIT'` 的模拟出场插件并触发 `action: 'SELL'`；
    - `TerminalNode` 正确产出 `SELL` 结果并封装完整的 `decisionTrace`。

- [x] 1.2 **升级决策流求值器：打通出场动作与归因透传**
  - 文件：`mist/libs/strategy/src/decision-flow/decision-flow-evaluator.ts`
  - 确保 `GuardNode`、`ConsensusNode` 在目标动作为 `SELL` 时，正确提取 `evidence.matchedSignalId`（或关联买入 ID）、`badgeText` 与 `displayTag` 并透传至 `DecisionResult`。

- [x] 1.3 **扩展加载器测试与注册表逻辑**
  - 文件：`mist/libs/strategy/src/factor/external-plugin-loader.spec.ts`
  - 文件：`mist/libs/strategy/src/factor/external-plugin-loader.ts`
  - 编写测试验证：外部导出的 `category: 'EXIT'` 插件能被 `ExternalFactorPluginLoader.loadPlugins()` 顺利识别并注册进 `FactorPluginRegistry`；
  - 确保出场插件与入场插件在注册表中平权可用。

- [x] 1.4 **运行公仓架构与门禁测试**
  - 运行 `pnpm -C mist test libs/strategy/src/strategy-boundary.guard.spec.ts`；
  - 运行 `pnpm -C mist test libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts`；
  - 确保零破坏既有三链路同构门禁。

---

## 阶段二：下游策略工程账本 Map 升级、Lot 瘦身与信号组合工具化 (下游专有策略工程)

- [x] 2.1 **将 `Set` 升级为 `Map` 并彻底移除沉重 Lot 体系**
  - 改造内容：
    - 将 `activeEntryIds = new Set<string>()` 升级为 `activeEntries = new Map<string, EntryRecord>()`，以买入信号 ID 为键，天然支持 $O(1)$ 通过 ID 反查；
    - 彻底移除槽位配额、UUID 生成器与权重硬拆分；
    - 纯粹物理记账：`onBar(close: number)` 仅更新持有根数与最高价，剥离所有指标判定；
    - `closeEntry(signalId, exitPrice, exitTime)` 依据 ID 精准销账并产出关联记录。

- [x] 2.2 **出场信号/提案组合逻辑独立工具化 (封装工具类)**
  - 改造内容：
    - 提炼专职的 `VirtualExitProposalAssembler` 工具类（或静态工具函数）；
    - 将散装的大字面量 `createProposal` 封装搬迁至此工具类；
    - 实现入参标准化（通道、买入反查记录、出场 opinion），消除双轨硬编码与手写散装字典。

- [x] 2.3 **拆分单体出场为单一职责出场插件、纯函数辅助库与单测守护**
  - 改造内容：
    - 严守零继承原则（Zero Inheritance）：不建 `BaseExitPlugin`，入场出场均直接扁平实现 `FactorPlugin`；
    - 基础防守以自适应波动率防守为基准底座，剔除未经验证的时间止损与保本平价规则；
    - 实现客观支撑破位斩仓、右侧波段止盈、微观背驰逃顶与目标位空间止盈等出场节点；
    - 落实零历史兼容包袱铁律：彻底删除 `evaluateSync`，直调统一专职契约 `evaluateExit(context, params): FactorOpinion`。

- [x] 2.4 **下游策略工程入口导出更新与编译打包**
  - 导出新的工具类与升级后的账本；
  - 重新生成打包产物。

---

## 阶段三：全链路端到端验证与基线对账

- [x] 3.1 **下游策略工程全量回归测试**
  - 确保下游策略工程全套单测 100% PASS。

- [x] 3.2 **推演与回测基线防退化验证**
  - 验证历史交易笔数与关键收益率完全对齐。

- [x] 3.3 **公仓 CI 与类型检查全绿**
  - 运行 `pnpm -C mist typecheck`；
  - 运行 `pnpm -C mist test libs/strategy`。

---

## 阶段四：基于 `code-cleanup-and-smell-remediation` 规范的全面 Code Review 审计与结项归档

- [x] 4.1 **十八类代码坏味道（S1~S18）逐项核验**
  - 重点核验本次重构涉及的关键坏味道：
    - **S1 (死代码与僵尸资产)**：确认废弃的 Lot 冗余类型、历史无用参数已彻底删除，无残留导出；
    - **S3 (类型腐化与断言逃逸)**：核验源码中 0 处 `as any`，消灭无守卫的非空断言与强行类型擦除；
    - **S4 (魔法值与硬编码)**：确认默认阈值均收敛为常量或规范默认配置；
    - **S12 (宿主机时钟泄漏)**：静态扫描确认 0 处无参 `new Date()` 隐式兜底，出场时戳 100% 确定性派生；
    - **S13 (散装字典装箱拆箱与属性猜谜)**：确认出场提案与信号组装全面由工具类承载，消除多层 `?.`、`??` 猜谜；
    - **S14 (领域概念归属权倒错)**：确认账本纯化为物理台账，无任何 `stage` 或指标比较逆向污染；
    - **S16 (散装内联字面量与双轨复制)**：确认 40+ 行 Proposal 拼接大字面量已收敛为单点工具函数调用；
    - **S18 (挤牙膏式循环与契约阻抗)**：确认遍历逻辑清晰高效，消除多余循环。

- [x] 4.2 **四大因果律与架构刚性门禁核查**
  - A股 T+1 刚性拦截（`holdingBars <= 0` 绝不平仓）；
  - 法定双时间戳分离（`signalTime` == 确认 Bar 时间戳，`pivotTime` == 极值点时间戳）；
  - 单调前沿游标推进；
  - 零主观容差与防过拟合基准。

- [x] 4.3 **输出标准 Code Review 审计研报并结项落盘**
  - 输出标准 Markdown Code Review 研报；
  - 记录审查结论、坏味道治理矩阵、测试覆盖证据与零退化证明；
  - 提交受控合并审计，保持公仓 master 洁净。
