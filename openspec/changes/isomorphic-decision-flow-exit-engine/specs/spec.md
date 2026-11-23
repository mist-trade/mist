# 规约规范：出场插件同构化与决策树统一收敛 (Specification)

## 一、术语与领域实体定义

### 1.1 `VirtualLotContextSnapshot`
单批次只读持仓快照，严格深不可变：
- `lotId: string`：批次唯一标识；
- `sourcePlugin: string`：开仓来源插件标识；
- `entryTime: Date`：建仓时间戳；
- `entryPrice: number`：建仓价格；
- `defensePrice: number`：专属动态防守底线；
- `stage: string`：生命周期阶段；
- `holdingBars: number`：持有 Bar 根数（0 表示当根开仓，受到 T+1 刚性保护不可平仓；$\ge 1$ 允许出场判定）；
- `peakClose: number`：持仓期间收盘价峰值；
- `allocatedWeight: number`：名义权重。

### 1.2 `VirtualPositionContext`
注入决策流黑板的整体持仓快照（黑板键名：`position.virtual`）：
- `state: 'FLAT' | 'HOLDING'`：整体仓位状态；
- `activeLots: readonly VirtualLotContextSnapshot[]`：处于激活态的批次快照列表；
- `totalWeight: number`：当前总持仓权重；
- `totalAvgCost: number`：加权平均建仓成本价；
- `availableLotsCount: number`：满足 T+1 条件可平仓批次数（`holdingBars > 0`）。

---

## 二、行为需求规约 (Behavioral Requirements)

### 2.1 外部出场插件加载与注册规约
- **REQ-EXIT-01 (同构契约)**：出场插件必须实现 `FactorPlugin` 接口，且 `category` 属性必须声明为 `'EXIT'`。
- **REQ-EXIT-02 (自动探测与平权注册)**：`ExternalFactorPluginLoader.loadPlugins()` 在扫描外部目录时，必须无差别收集所有合法的 `FactorPlugin`（包含 `category === 'EXIT'`），并通过 `registerExternalPlugins` 注册至 `FactorPluginRegistry`。
- **REQ-EXIT-03 (零破坏降级)**：当私仓不存在或未导出出场插件时，加载器必须保持优雅静默，开源公仓单测与 CI 零依赖。

### 2.2 上下文只读注入规约
- **REQ-CTX-01 (纯函数无污染注入)**：调度层在驱动决策树求值前，必须通过 `ContextAssembler` 将底层账本（`MultiLotVirtualPosition`）转换为深只读快照 `VirtualPositionContext`，并写入 `FactorContext.attributes` 的 `'position.virtual'` 键中。
- **REQ-CTX-02 (黑板键单调隔离)**：在每根 Bar 求值前，黑板必须使用全新 Map 装配，严禁跨 Bar 状态残留泄漏。

### 2.3 决策树出场分流与求值规约
- **REQ-FLOW-01 (状态分支路由)**：决策流支持通过 `BranchNode` 对 `condition.attributeKey: 'position.virtual.state'` 进行分流：
  - 当为 `'HOLDING'` 时，路由至出场子树；
  - 当为 `'FLAT'` 时，路由至入场子树。
- **REQ-FLOW-02 (出场决策与动作映射)**：出场插件在判定满足平仓条件后，必须返回 `action: 'SELL'`，并在 `evidence` 中提供 `targetLotId` 与详细触发归因。决策树叶子节点 `TerminalNode(action: 'SELL')` 统一将其转化为 `KernelSignal(signalKind: 'exit')`。
- **REQ-FLOW-03 (T+1 一票否决)**：若持仓快照中 `availableLotsCount === 0`，出场插件必须返回 `action: 'NEUTRAL'`，严禁发射任何平仓信号。

### 2.4 虚拟账本状态演进规约
- **REQ-LEDGER-01 (账本纯记账化)**：`MultiLotVirtualPosition` 内部剥离所有战术指标比较（如 CYC13）与宏观体制判定，仅根据实际成交与收盘价推进客观物理时钟与最高价。
- **REQ-LEDGER-02 (先出后进执行序)**：当同一根 Bar 出现出场与入场时，账本必须严格遵循“先平仓、后开仓”的因果时序，严禁当期自产自销。
