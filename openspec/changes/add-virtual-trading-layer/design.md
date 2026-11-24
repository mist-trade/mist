# 技术设计：虚拟交易层与统一 TradingEngine (Design)

## 一、分层拓扑与数据流

```text
信号层  KernelSignal[]（每 definition 每根 Bar 一条，含虚拟出场子系统产出的出场信号）
  → 聚合层  持久化（StrategySignal / StrategyAlertEvent 1:1）
            → 按 (securityId, effectiveTime) 现算分组（契约 V2 fanout）
  → 交易层  TradingEngine.decide(信号组, 账户快照) → TradingDecision
            ├─ TradeInstruction[]（票 / 方向 / 仓位 / 理由 / 归因链）
            ├─ TradeRejection[]（被拒信号 + 结构化原因）
            └─ 账户投影（假定成交后的现金与持仓）
            虚拟账本回填（virtual_fill_events，幂等）
  → 执行    回测执行端 = SimulatedBroker（Next-Bar 真实撮合，指令先入待撮合队列）
            实时执行端 = 交易手册 → 人（人工下单）
            dev 执行端 = 与回测同构（本地撮合）
            私有研究端 = runTradingPipeline 门面（内存端口，零基础设施，见第八节）
```

职责不变式：聚合层做归因分组、不裁决交易；交易层做裁决与账本、不渲染归因分组；
裁决发生在**持久化之后**（消费全部已归因信号，被拒者连同原因输出）——这与
TacticalEvent（持久化前吞信号）有本质区别。

## 二、域模型

### 2.1 输入：SignalGroupInput

```ts
interface AttributedSignal {
  readonly idempotencyKey: string;      // 幂等锚点（一个信号至多一条成交指令）：
                                        // 实时 = alertEventId 字符串化；离线 = 合成幂等串（8.2）
  readonly signal: KernelSignal;        // signalKind / signalType / triggerPrice / decisionTrace
  readonly attribution: {               // 聚合层附带，引擎不做 DB 查询
    readonly strategyName: string;
    readonly periodLabel: string;
    readonly confidence?: number;
    readonly confidenceLevel?: string;
    readonly traceChain: string | null; // 渲染好的紧凑 trace 链（复用 renderTraceChain）
  };
}

interface SignalGroupInput {
  readonly securityId: number;
  readonly securityCode: string;
  readonly effectiveTime: Date;
  readonly tradingDay: string;
  readonly signals: readonly AttributedSignal[];
}
```

### 2.2 状态：AccountSnapshot

```ts
interface AccountSnapshot {
  readonly cash: bigint;                // 组合级现金，跨票共享（整数厘）
  readonly positions: ReadonlyMap<number /*securityId*/, PositionSnapshot>;
  readonly tradingDay: string;          // 账本推进到的交易日（T+1 结算依据）
}
```

`PositionSnapshot` 复用 `libs/strategy/src/position/position.types.ts` 现有定义
（status / holdingQuantity / costPrice / unrealizedPnlRatio…），随整数厘移植后
金额字段（costPrice / marketValue / pnl）一并转为整数厘。

### 2.3 输出：TradingDecision

```ts
interface TradeInstruction {
  readonly instructionId: string;       // 业务键派生：`ti-{idempotencyKey}`（REQ-ISO-03）
  readonly idempotencyKey: string;      // 回链聚合层锚点
  readonly action: 'BUY' | 'SELL';
  readonly quantity: number;            // 整手（lotSize 100）
  readonly referencePrice: number;      // 信号 triggerPrice（边界转厘，整数）
  readonly estimatedValueLi: bigint;    // quantity × referencePrice（整数厘，BUY 另计手续费预算）
  readonly reason: string;              // signalType / exitReason
  readonly attribution: AttributedSignal['attribution'];
}

interface TradeRejection {
  readonly idempotencyKey: string;
  readonly signal: AttributedSignal;
  readonly reason: 'ALREADY_HOLDING' | 'NO_POSITION' | 'INSUFFICIENT_CASH'
    | 'T1_FROZEN' | 'SYSTEMIC_CRUNCH' | 'BELOW_LOT';
  readonly detail: string;
}

interface TradingDecision {
  readonly instructions: readonly TradeInstruction[];
  readonly rejections: readonly TradeRejection[];
  readonly accountAfter: AccountSnapshot;  // 假定成交后的账户投影（实时回填依据）
}
```

### 2.4 TradingEngine

```ts
class TradingEngine {
  constructor(deps: {
    signalRules: readonly Rule[];       // 信号裁决管线（首条终局 Verdict 生效）
    riskRules: readonly Rule[];         // Bar 巡检管线（per-bar 风控，回测/dev 共用）
    sizing: SizingStrategy;             // 默认 AllInWithBuffer(0.95)（统一漂移）
    groupOrdering?: GroupOrderingStrategy;  // 默认 SellFirstByConfidence（interim）
    seedCapitalLi?: bigint;             // 种子资金（整数厘），默认 1,000,000 × 1000
  });
  decide(group: SignalGroupInput, snapshot: AccountSnapshot): TradingDecision;
  surveilBar(bar, position): readonly TradeInstruction[];  // per-bar 风控巡检
}
```

- **纯函数**：快照进 → 决策出，不触 DB、不触撮合；同组同快照 → 逐字段相同的输出；
- 组内处理顺序：**先出后进**（EXIT 先于 ENTRY；同 kind 内按置信度降序；置信度同则按
  幂等锚点字典序）——沿用账本既有规约 `REQ-LEDGER-02（先出后进执行序）`；
- 每个信号独立裁决：依次过 `signalRules`，首条终局 Verdict 生效；入场与出场是
  同一管线的两条规则序列（entry：regimeGate → cashGate → sizingRule；exit：
  signalExit），末位 fallback 规则兜底显式拒绝（REQ-ENGINE-04）——不存在第二条
  出单路径。合成 bar 由该信号的 `signalTime` / `triggerPrice` 构造（实时无真实
  Bar 可给），价格在数据边界一次转换为整数厘；
- 裁决通过 → 指令 + **假定成交**即时推进内存账户（现金按含费净额扣补、整数厘
  运算，持仓机 `onOrderFilled` 推进 T+1）；裁决失败 → 结构化拒绝（信号级原因由
  规则 Verdict 给出，账户结构性原因由引擎预检给出，见下）；
- 账户快照随每个假定成交更新，下一信号使用更新后的快照（卖出释放的资金当刻可用于
  后续买入）。
- **规则管线取代 Arbiter if 树（从零基准采纳 2026-11-24）**：现有
  `ExecutionRiskArbiter` 的三级平仓优先级（SYSTEMIC_CRUNCH → HARD_STOP →
  SIGNAL_EXIT）与买入管卡（regime veto → cash gate → sizing）移植为规则序列——
  `Rule = (ctx) => Verdict`，`Verdict = { action: 'INSTRUCT', order } | { action:
  'REJECT', reason, detail }`，每条规则独立单测、可插拔可重排；Arbiter 类退役
  （既有 spec 用例同步移植）。仓位计算归 `SizingStrategy`（默认 AllInWithBuffer：
  可用现金 × 0.95 × 整手取整，ELEVATED_RISK 预算减半语义保留），与裁决分离；
  引擎层仅保留账户**结构性**预检（T1_FROZEN / INSUFFICIENT_CASH 含费 /
  NO_POSITION——属账户状态而非信号裁决）。

## 三、事件溯源虚拟账本

### 3.1 单一事实源

```sql
-- migration 037
CREATE TABLE IF NOT EXISTS `virtual_fill_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `alert_event_id` BIGINT UNSIGNED NOT NULL,
  `security_id` INT UNSIGNED NOT NULL,
  `security_code` VARCHAR(32) NOT NULL,
  `side` ENUM('buy','sell') NOT NULL,
  `quantity` INT UNSIGNED NOT NULL,
  `price` DECIMAL(10,3) NOT NULL,
  `fees` BIGINT NOT NULL DEFAULT 0,
  `net_amount` BIGINT NOT NULL,
  `trading_day` DATE NOT NULL,
  `instruction` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_virtual_fill_events_alert_event_id` (`alert_event_id`),
  KEY `idx_virtual_fill_events_security_day` (`security_id`, `trading_day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- **追加即成交**：交易层产出 BUY/SELL 指令 → 追加一条 fill 事件（含指令 JSON）→
  账户状态随之推进；**unique(alert_event_id)** 使投递重试/幂等重放不会二次回填
  （域内幂等键为字符串 `idempotencyKey`：实时 = alertEventId 字符串化，离线 =
  合成幂等串；落库仅实时路径，离线走内存日志）；
- **账户 = fold(事件)**：加载某票全部 fill（按 id 序）→ 依序喂
  `PositionStateMachine.onOrderFilled` + `CapitalLedger.applyFill` 重建快照。
  当前规模（每季约百条信号）fold 成本可忽略，不建快照表；若未来成为热点再加快照投影；
- **拒绝不落库**：拒绝可由"信号 + 账户快照"确定性重演，保持账本纯成交事实。
- **整数厘单一算术**（REQ-ENGINE-07）：金额列 BIGINT 厘（1 元 = 1000 厘）、价格
  列 DECIMAL(10,3)（A 股 ≤3 位小数，精确）；费率折算只在唯一舍入点发生
  （half-up 取厘），其后全整数运算，禁止 float 金额在域核心流转。

### 3.2 账本生命周期

| 场景 | 行为 |
|---|---|
| 首次 | 账户为空 → 种子资金 1,000,000（env `NOTIFICATION_VIRTUAL_SEED_CAPITAL` 可配） |
| 每次投递 | fold(fill) 重建快照 → engine.decide → 追加新 fill（事务内） |
| 重启 | 无状态恢复问题——快照永远可由日志重放 |
| 回测 | 不触 DB——内存端口注入，随跑随弃 |

## 四、与虚拟出场子系统（virtual-exit）的一致性

现有事实：内核内置虚拟出场子系统（`VirtualExitPolicyPort.onSignal/onBar`，
私仓实现维护通道级虚拟持仓 `MultiLotVirtualPosition`），出场提案经内核转为
`KernelSignal(exit)`。交易层上线后出现**两份持仓事实**：

| 账本 | 推进依据 | 用途 |
|---|---|---|
| 出场策略通道持仓（私仓） | KernelSignal（onSignal 逐条推进） | 生成出场信号 |
| 交易层虚拟账本（本 change） | 指令假定成交（virtual_fill_events） | 裁决 / 仓位 / 指令 |

**一致性要求与路径**：

1. 本阶段（本 change）：交易层 fill 为**成交事实的单一事实源**；出场策略持仓按既有
   onSignal 推进。已知偏差面：交易层拒绝入场（资金不足 / T+1）而出场策略已记账的
   "幻影批次"——单票全仓模型下仅资金不足一种，100 万种子资金下概率极低；引擎在
   `ALREADY_HOLDING` 判断上两账本天然一致（都由同一入场信号推进）。
2. 下一阶段（follow-up，本 change  tasks 中的独立任务）：`VirtualExitPolicyPort`
   增补账户视图注入（onBar 附带 `AccountSnapshot` 或 fill 事实端口），私仓
   `MultiLotVirtualPosition` 改为从 `virtual_fill_events` 派生批次，两账本归一。

## 五、执行端适配（四条链路）

### 5.1 回测（apps/backtest/backtest-run.executor.ts 重构）

- 保留：Bar 循环、kernel 驱动、SimulatedBroker **撮合语义**（Next-Bar / 一字板 /
  T+1 / STOP / 日结）、`backtest_trade_results` 持久化；SimulatedBroker 与费率
  计算器**算术重写为整数厘**（撮合与费率语义零改动，REQ-ENGINE-07）；
- 替换：内联 Arbiter 调用与 open-order 检查 → 每 Bar 信号批组装 `SignalGroupInput`
  → `engine.decide` → 指令交 Broker `submitOrder`（撮合仍由 Broker onBar 完成）；
  撤销/风控路径（hardStopLoss / SYSTEMIC_CRUNCH）由引擎统一产出（Bar 回调里的
  per-bar 风控裁决同样走引擎）；
- 账本：内存端口（随跑随弃），种子资金沿用 `DEFAULT_BROKER_INITIAL_CASH`；
- 语义变化：组内顺序统一为先出后进（原 kernel 顺序）、`cashAllocationRatio` 统一
  0.95（原 0.995）——回测数字可能与旧基线有小偏移，重跑基线覆盖。

### 5.2 实时（apps/notification channel handler）

- `deliver.channel` 处理流程：取组内 AlertEvent + Signal（现有）→ 批量解析策略名
  （现有）→ 组装 `SignalGroupInput` → `engine.decide` → 追加 fill（事务，幂等）→
  **交易手册渲染** → adapter.send → 整批 SENT；
- TypeORM 端口实现 `VirtualFillLogPort`（append / loadBySecurity）；
- 引擎实例：单例（种子资金 env 配置），SizingStrategy 默认 0.95、风控规则无硬止损
  （遵循零死板止损准则）。

### 5.3 dev server（tools/strategy-dev/server.ts）

- **删除**手写流水线（`server.ts:899-985` 的手写 sizing / onSignal 出场 / 0.95）；
- 改用引擎 + 内存端口（与回测同构），本地撮合仍走 SimulatedBroker。

### 5.4 私有研究端（mist-alpha-private）

- 经 `runTradingPipeline` 门面复用同一引擎、同一分组函数、同一渲染器（内存端口、
  零基础设施），见第八节；四条链路的最终产物（交易手册）逐字段同构。

## 六、交易手册渲染（替代信号列表）

```text
[Mist 交易手册] 000001 平安银行 | 2026-08-12 09:35 ｜ 账户 可用 906,250 / 持仓 7,500股 @ 12.50
▶ 买入 7,500股 @ 12.50 ≈ 93,750 ｜ 全共振战术 30m 二买 [HIGH 88.5%]
    regime 门禁 ✓ → chan 二买 ✓
✗ 卖出已拒绝：NO_POSITION（虚拟账户空仓）｜ 波动压制 60m 顶背离 [MEDIUM 80.4%]
```

- 渲染器位于交易层报告模块（apps/notification），复用 `renderTraceChain`；
- 单指令组与多指令组同一格式（无 legacy 分支——无线上流量，无兼容负担）；
- `notification-envelope.ts` 的信号列表渲染退役，`renderTraceChain` 迁入交易层
  报告模块。

## 七、交易层同构门禁

- **REQ-ISO**：同组信号 + 同账户快照，回测适配器 / 实时适配器 / dev 适配器的
  `TradingDecision` 逐字段相同（指令、拒绝、账户投影）；
- 测试形态：构造固定信号组 + 固定快照，三端适配器各自驱动同一引擎实例，深比较
  决策对象；这是信号层同构门禁（`strategy-dual-timestamp.guard.spec.ts`）的姊妹门禁；
- 另加引擎确定性测试：同输入重放 N 次，输出引用不同但深比较恒等。

## 八、管线门面与私仓离线接入（2026-11-24 需求补充）

### 8.1 需求

私仓当前只有信号（研究脚本自带第四份手写交易流水线，且绕过内核直调插件）。
要求：私仓能独立跑通 信号层 → 聚合层（分组）→ 交易层 → 交易手册 全流程，
拿到与线上同构的最终结果。

### 8.2 门面：`runTradingPipeline`（libs/strategy/src/pipeline/）

```ts
interface PipelineInput {
  barsByPeriod: ReadonlyMap<number, readonly StrategyBar[]>; // 内存 Bars（离线 K 线）
  plans: readonly KernelPlan[];        // 由 compileStoredDefinitionVersion(预设 JSON) 编译
  registry: FactorPluginRegistry;      // 私仓插件 + 标准插件
  virtualExitPolicy?: VirtualExitPolicyPort;
  seedCapitalLi?: bigint;              // 默认 1,000,000 × 1000（整数厘）
  cashAllocationRatio?: number;        // 默认 0.95（SizingStrategy 参数透传）
}

interface PipelineResult {
  signals: readonly KernelSignal[];
  groups: readonly { group: SignalGroupInput; decision: TradingDecision }[];
  fills: readonly VirtualFillEvent[];  // 内存日志
  report: string;                      // 交易手册（与投递消息同渲染器）
}
```

- **零基础设施**：无 NestJS / DB / Redis；回测执行器、dev server、实时投递、
  私仓脚本全部是门面的数据适配器——编排层也不再有第二份实现；
- **Bar 驱动顺序**：合并全部周期 Bars 按 `(availabilityKey, period 升序)` 排序
  逐根 `kernel.push`（HistoricalBarSource 的离线等价，重用既有归并规则）；
- **确定性**：同输入 → 同输出；离线 fill 的幂等锚点为合成 id
  `offline-{definitionId}-{signalTime.getTime()}-{kind}`。

### 8.3 分组提取为纯域函数

聚合分组（`(securityId, effectiveTime)` 现算分组）从 `apps/signal` processor 的
`publishGroupedDeliveries` 中提取为 `libs/strategy/src/trading/grouping.ts` 纯函数
`groupSignals(...)`；线上路径（processor）与离线路径（门面）共用同一实现——
分组规则不再有两份。

### 8.4 私仓接入

- `build.mjs` alias 增补：`@app/strategy` → `mist/libs/strategy/src/index.ts`、
  `@app/market-data` → `mist/libs/market-data/src/index.ts`（现有 alias 模式延续，
  nodejs-polars 保持 external）；
- 私仓 `src/types.ts` 的 `FactorPlugin` 副本必须与公共契约**结构兼容**（TS 结构
  类型 + 门面装配时编译期校验）；私仓边界守卫增加结构兼容断言，防止漂移；
- 新脚本 `scripts/run-pipeline.js`：本地 K 线（复用现有加载模式）→ 预设
  （`compileStoredDefinitionVersion`）→ 门面 → 打印交易手册 / 导出 JSON；
- 私仓研究 harness（`run-tactics.js` 的 MultiLotVirtualPosition 多批次战术）与
  门面**并存**为两条研究线：门面跑"与线上同构的指令"，harness 跑"多批次战术研究"；
  基线重跑后由用户决定是否退役 harness。

### 8.5 分层归属补充

门面与分组函数归**公共仓 libs/strategy**（信号层与交易层的编排地带，纯域）；
私仓只保留插件、策略定义、数据与脚本。私仓"跑全流程"= 捆绑公共域 + 本地数据。

## 九、破坏性改动清单

| 被破坏 | 替代 |
|---|---|
| dev server 手写交易流水线（`server.ts:899-985`） | TradingEngine + 内存端口（0.95 预算归 SizingStrategy） |
| backtest executor 内联 Arbiter 编排 | engine.decide（每 Bar 批） |
| 回测 0.995 预算 + hardStopLoss -0.08（executor 内联配置） | 引擎配置化（SizingStrategy 默认 0.95；硬止损沿袭 -0.08 配置项，规则参数透传） |
| envelope 信号列表消息 | 交易手册 |
| `PositionStateMachine.onSignal` 决策分支（`position-state-machine.ts:168`） | 删除；状态机回归纯记账（唯一调用方 dev server:969 已迁引擎） |
| SimulatedBroker `Date.now()` 标识（`simulated-broker.ts:79,411`） | 业务键派生 id（`ord-{intentId}` / `fill-{intentId}`，REQ-ISO-03）+ 算术重写整数厘（撮合语义零改动） |
| `ExecutionRiskArbiter` if 树（`execution-risk-arbiter.ts`） | 规则管线移植（裁决语义保留，类退役，spec 用例同步移植） |
| `slippage-fee-calculator` float 算术 | 费率语义零改动，算术重写整数厘（唯一舍入点 half-up 取厘） |
| 回测组内处理顺序（kernel 顺序 → 先出后进） | 统一 interim 规则；重跑基线覆盖 |

## 十、边界与不变式

- 信号层零改动（KernelSignal / 决策流 / 虚拟出场子系统照旧）；
- 聚合层分组与契约 V2 零改动（fanout payload / jobId / sweep / replay 照旧）；
- 聚合层不再渲染最终消息（渲染权移交交易层报告模块）；
- 防未来函数不变（`signalTime ≡ StrategyBar.timestamp`、Next-Bar 撮合、严禁
  `pivotPrice` 入场）；
- 实时执行端仍是人工下单（无券商 API、无自动下单——2026-11-23 定稿不变）。

## 十一、现有组件盘点：复用与大改清单（2026-11-24 家底核查）

### 11.1 原样复用（一行不动）

| 组件 | 位置 | 说明 |
|---|---|---|
| `isOneWordLimitUp` / `isOneWordLimitDown` 等 A 股市场判定 | libs/market-data | 一字板 / ETF 判定纯函数，与金额无关，直接复用 |

### 11.2 小改复用

| 组件 | 保留 | 改造 |
|---|---|---|
| `ExecutionRiskArbiter` | 三级平仓优先级 / 买入管卡 / regime veto 裁决语义 | **逻辑移植进规则管线，类退役**；Verdict 输出；预算默认 0.95 归 `SizingStrategy` |
| `slippage-fee-calculator` | 费率模型（佣金 / 过户费 / 印花税 / ETF 免征 / 双向滑点） | 算术重写为整数厘（费率语义零改动，唯一舍入点） |
| `SimulatedBroker` | Next-Bar / T+1 frozen / 一字板拒单顺延 / STOP 单 / 日结解锁撮合语义 | 算术重写整数厘；orderId/eventId 改业务键派生 |
| `CapitalLedger` | `applyFill` fold / `onDayClose` 净值语义 | 移植整数厘 + 补 rehydrate（从 `virtual_fill_events` 重建） |
| `PositionStateMachine` | `onOrderFilled` 记账 / `calculateExitQuantity` / snapshot 语义 | 移植整数厘 + 补 rehydrate；**删除 `onSignal()` 决策分支**（见 11.3） |

### 11.3 彻底大改 / 删除

| 对象 | 处置 |
|---|---|
| dev server 手写流水线（`server.ts:899-1010`） | 整段删除：手写 0.95 sizing、exit 走 `position.onSignal` 旁路、`enableStopLoss` 按 mode/strategyId 硬编码（三处漂移的集合体） |
| 回测 executor 内联编排（`backtest-run.executor.ts:465-466`） | `hardStopLossRatio: -0.08` + `cashAllocationRatio: 0.995` 硬编码上移为引擎配置；时序编排提炼进适配器 |
| `PositionStateMachine.onSignal`（`position-state-machine.ts:168-204`） | **旁路根除**：类注释自述"平仓动作 100% 由裁决器下达"，该方法仍在生成卖单，全库唯一调用方为 dev server:969；删除后状态机回归纯记账 |

### 11.4 盘点发现的坑（设计修订依据）

1. **SimulatedBroker 标识非确定性**：`ord-${Date.now()}-…` / `fill-${Date.now()}-…`
   （`simulated-broker.ts:79,411`）直接破坏 REQ-ISO-01 逐字段一致——已采纳更彻底的
   业务键派生方案（11.5 第 2 项，REQ-ISO-03 固化）。
2. **hardStopLoss 配置无主（待拍板）**：回测传 -0.08、dev server 按开关传、实时
   无定义——第四个漂移点。本设计暂按"引擎配置透传 + 各执行端显式声明"处理；
   倾向最终归属**策略定义**（Arbiter 注释"零死板止损准则"暗示部分策略不应有死
   止损），待用户定稿后改为从策略定义读取。

### 11.5 从零基准采纳记录（2026-11-24 用户拍板）

四项"从零更激进选择"全部采纳，覆盖 11.2-11.3 的复用折中：

1. **整数厘制**：域核心金额一律整数厘（1 元 = 1000 厘），唯一舍入点（费率折算
   half-up 取厘）；A 股价格 ≤3 位小数 → 边界转换精确无损；DB 金额列 BIGINT 厘。
   代价：SimulatedBroker / 费率计算器算术重写（撮合与费率语义零改动），回测基线
   重跑（与 0.995→0.95 语义变化合并处理）。
2. **ID 业务键派生**：instructionId / orderId / eventId 全部派生自幂等锚点
   （`ti-{idempotencyKey}` / `ord-{intentId}` / `fill-{intentId}`，intentId 即
   idempotencyKey）；墙钟、随机、自增计数在交易层无容身之地（REQ-ISO-03 固化）。
3. **规则管线裁决**：`Rule = (ctx) => Verdict` 序列取代 if 树——入场/出场为同一
   管线的两条规则序列，"出场必经裁决"由架构保证而非纪律；Arbiter 类退役，
   spec 用例移植。
4. **黄金文件回放**：引擎回归以 `(信号序列, 账户快照序列) → 决策序列` 版本化
   fixture 为准（REQ-ISO-04）；回测对账（tasks 4.3）直接消费 golden diff——
   语义变化显式审查，厘级舍入差异归类标注。

## 十二、开源对齐调研（2026-11-24，信号 → 交易 → 出场全链）

调研对象：**NautilusTrader**（Rust/Python，20k+ star）、**QuantConnect LEAN**（C#）、
**backtrader**（Python）、**freqtrade**（Python）、**vn.py / VeighNa**（Python，国内
主流）。

### 12.1 各仓库的信号 → 交易 → 出场链条

| 仓库 | 信号 | 裁决/风控 | 仓位 | 撮合/成交 | 出场 |
|---|---|---|---|---|---|
| Nautilus | Strategy.on_bar 内生成 | **RiskEngine** 独立预检（字段/余额/限流），ExecEngine 管订单状态机 | 策略内自算 | 端口替换：回测 SimulatedExchange（FillModel/FeeModel/LatencyModel）↔ 实盘 venue adapter，**其余代码完全相同** | 订单/持仓事件回调 on_order_filled；client_order_id 幂等防重复成交 |
| LEAN | **Alpha 模型产出 Insight** | **Risk Management 模型**调整/否决 PortfolioTarget | **Portfolio Construction 模型**（Insight→目标仓位） | Execution 模型 + Fill/Fee/Slippage/Margin "reality modeling" 插件 | 风控模型输出 risk-adjusted target → Execution；margin call 走保护性清仓 |
| backtrader | strategy.next() 调 buy/sell | broker checksubmit（资金预检，拒单带 Margin 状态） | **Sizer** 独立组件定 stake | BackBroker：Next-Bar Open 默认撮合（防未来函数，与本项目同款）+ 滑点/成交量 filler | 订单生命周期状态（Submitted→Accepted→Partial→Completed/Rejected/Expired），notify_order 推送；Trade 对象跟踪开平全程 pnl |
| freqtrade | populate_entry/exit_trend 产信号 | confirm_trade_entry/exit 回调 + protections（配对锁定/回撤锁） | **custom_stake_amount** 回调 | dry-run 与实盘共用同一 bot 逻辑；backtest 全模拟（含费） | **should_exit() 集中出场**：stoploss / ROI / exit 信号 / custom_exit 统一裁决，每笔出场带 **exit_reason** 标签 |
| vn.py | on_bar/on_tick 策略内计算 | vnpy_riskmanager 前置风控（委托数/撤单数/活动委托上限） | 策略内自算 | **Gateway 适配器**统一 send_order/cancel_order；开平仓语义转换（平今/平昨）下沉 Gateway 层 | OmsEngine 缓存全市场委托/成交/持仓；on_order/on_trade 回报驱动策略状态推进 |

### 12.2 五仓共识（本设计全部吻合）

1. **决策与成交分离**（ports & adapters / reality modeling / gateway）——五仓全部
   如此，无一例外；本设计的引擎纯函数 + FillSimulator 端口同构。
2. **风控独立于策略与执行**（Nautilus RiskEngine / LEAN Risk Model / vnpy
   riskmanager / backtrader checksubmit）——本设计 riskRules 管线同构。
3. **仓位计算是独立组件**（LEAN Portfolio Construction / backtrader Sizer /
   freqtrade custom_stake_amount）——本设计 SizingStrategy 同构，且"预算比例"归
   sizing 而非裁决，与 LEAN 的 Insight→Target 分层一致。
4. **出场集中化 + 原因标签**（freqtrade should_exit + exit_reason 是最彻底的范本）
   ——本设计 exitRules + exitReason 同构；freqtrade 证明了"出场裁决只有一处"在
   生产系统里是可维持的纪律。
5. **确定性 / 幂等标识**（Nautilus client_order_id 防重复成交 + 双时间戳
   ts_event/ts_init；vnpy vt_orderid/vt_tradeid 标准化标识）——本设计
   alert_event_id 幂等锚点 + ID 业务键派生（REQ-ISO-03）同构；Nautilus 的双时间戳
   （事件时间 vs 记录时间）与本项目信号层双时间戳契约同源。
6. **非浮点钱**（Nautilus 用 rust_decimal）——本设计整数厘制目标相同、手段更极端
   （整数无舍入域 vs 高精度十进制），在"厘"粒度下等价且更快。

### 12.3 有意分歧（为什么不照抄）

| 分歧点 | 开源做法 | 本设计选择 | 理由 |
|---|---|---|---|
| 域模型风格 | Nautilus 富领域模型（Order/Position 自带行为与状态机） | 值对象 + fold 投影（事件溯源） | 单票单通道规模下 fold 更简单可审计；富模型的状态机维护成本不值 |
| 引擎内通信 | MessageBus pub/sub（Nautilus / vnpy） | 直接函数调用 | 无跨组件解耦需求；组合级扩展成为现实时再引入总线（记缝位） |
| 订单生命周期 | Partial / 改单 / 到期（backtrader / LEAN 全套） | 指令即成交（人工假定成交）+ 回测 Next-Bar 全量成交 | 无自动下单、无部分成交场景；生命周期全套是本 change 非目标 |
| 管线组合度 | LEAN 允许用户自由组合四类模型 | 管线固定在域代码，插件缝只留 GroupOrderingStrategy / SizingStrategy | 本项目策略共享同一套 house style，自由组合=漂移温床 |

### 12.4 调研结论

四项从零基准（11.5）在五个成熟开源仓库中全部找到对应实践——**没有一项是发明**，
全部是生产验证过的主流模式。本设计相对开源社区的差异化仅在于：A 股微观结构
（T+1 / 整手 / 一字板 / 印花税单边）与"人按手册下单"的执行模型（人工执行端 =
Nautilus 语境下的 sandbox context：实时数据 + 模拟成交）。无需因调研修订 11.5
任何一项；本节作为设计依据存档。
