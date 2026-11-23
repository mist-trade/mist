# 变化提案：出场插件与入场插件同构及决策树统一收敛 (Proposal)

## 一、背景与问题陈述 (Problem Statement)

在量化策略系统中，传统的出场逻辑演进经历了以下历史阶段与痛点：
1. **硬编码与状态机污染 (Legacy Hardcoding)**：
   - 早期出场规则（止损、保本、移动止盈、次级别逃顶等）直接写死在虚拟账本（`MultiLotVirtualPosition`）或过程式求值函数中，导致物理记账账本与高层战术指标（CYC13、次级别背驰、宏观牛熊体制）紧密耦合；
   - 生产与开发环境在多处写死 `-8%` 硬止损和 100% 全平卖单，缺乏策略灵活性与多批次精细化生命周期管理。
2. **旁路架空与断层 (Bypass Architecture & Split Pipeline)**：
   - 虽然私仓已抽取出纯函数式的 `TacticalLifecycleExitPlugin`，但目前整个出场管线被隔离在核心决策树之外——公仓内核通过旁路的 `VirtualExitPolicyPort` 端口调用，私仓通过 `createVirtualExitPolicy()` 构造单体 `PrivateVirtualExitPolicy`，其构造函数中写死单一出场插件实例；
   - 决策流（Decision Flow Tree）仅负责入场（`action: 'BUY'`），而出场则由内核在 `evaluatePublic` 之后通过 `advanceVirtualExits` 单独补充拼装。两条管线割裂，违背开闭原则 (OCP)，无法像入场插件那样灵活编排、插拔特异出场插件（如斐波那契目标止盈、次级别背驰逃命等）。

## 二、目标与收益 (Goals & Benefits)

1. **入场与出场插件 100% 架构同构 (Isomorphic Factor Plugins)**：
   - 出场插件统一实现标准 `FactorPlugin` 契约（`category: 'EXIT'`）；
   - 入参统一为 `FactorContext`（包含 K 线序列与注入的只读持仓快照 `context.attributes.get('position.virtual')`）；
   - 出参统一为 `FactorOpinion`（`action: 'SELL' | 'NEUTRAL'`，`evidence` 承载目标批次与归因证据链）。
2. **动态发现与导入同构 (Dynamic Import & Discovery)**：
   - 外部私有策略工程（如 `external-plugins` 等下游插件库）中只需声明出场插件类或导出实例；
   - 公仓 `ExternalFactorPluginLoader` 自动发现并注册至 `FactorPluginRegistry`，实现入场与出场插件的统一自动装配与即插即用。
3. **决策树统一编排 (Decision Flow Convergence)**：
   - 将出场逻辑收敛为决策树（Decision Flow Tree）的一等公民节点；
   - 决策流通过条件分支（`BranchNode`）检测持仓状态：未持仓走入场共识分支，已持仓走多级出场规则分支；
   - 消除内核旁路 `VirtualExitPolicyPort` 拼接逻辑，实现入场、出场“同一条管道、同一种时序推演、同一种白盒决策轨迹 (`decisionTrace`)”。
4. **虚拟账本彻底净化 (Pure Ledger Purity)**：
   - 虚拟持仓账本（`MultiLotVirtualPosition`）回归纯粹的客观物理记账（仅维护价格、时间戳、权重、最高价、holdingBars 与批次列表）；
   - 阶段演进（`stage`）与出场判定完全由出场插件与决策树掌控，杜绝策略概念反向污染账本。
