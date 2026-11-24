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
            实时执行端 = 指令报告 → 人（人工下单）
            dev 执行端 = 与回测同构（本地撮合）
```

职责不变式：聚合层做归因分组、不裁决交易；交易层做裁决与账本、不渲染归因分组；
裁决发生在**持久化之后**（消费全部已归因信号，被拒者连同原因输出）——这与
TacticalEvent（持久化前吞信号）有本质区别。

## 二、域模型

### 2.1 输入：SignalGroupInput

```ts
interface AttributedSignal {
  readonly alertEventId: number;        // 幂等锚点（一个信号至多一条成交指令）
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
  readonly cash: number;                // 组合级现金，跨票共享
  readonly positions: ReadonlyMap<number /*securityId*/, PositionSnapshot>;
  readonly tradingDay: string;          // 账本推进到的交易日（T+1 结算依据）
}
```

`PositionSnapshot` 复用 `libs/strategy/src/position/position.types.ts` 现有定义
（status / holdingQuantity / costPrice / unrealizedPnlRatio…）。

### 2.3 输出：TradingDecision

```ts
interface TradeInstruction {
  readonly alertEventId: number;
  readonly action: 'BUY' | 'SELL';
  readonly quantity: number;            // 整手（lotSize 100）
  readonly referencePrice: number;      // 信号 triggerPrice
  readonly estimatedValue: number;      // quantity × referencePrice（BUY 另计手续费预算）
  readonly reason: string;              // signalType / exitReason
  readonly attribution: AttributedSignal['attribution'];
}

interface TradeRejection {
  readonly alertEventId: number;
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
    arbiter: ExecutionRiskArbiter;      // 复用，零改动（含仓位计算）
    seedCapital?: number;               // 默认 1,000,000
    cashAllocationRatio?: number;       // 默认 0.95（统一三端漂移）
    groupOrdering?: GroupOrderingStrategy;  // 默认 SellFirstByConfidence（interim）
  });
  decide(group: SignalGroupInput, snapshot: AccountSnapshot): TradingDecision;
}
```

- **纯函数**：快照进 → 决策出，不触 DB、不触撮合；同组同快照 → 逐字段相同的输出；
- 组内处理顺序：**先出后进**（EXIT 先于 ENTRY；同 kind 内按置信度降序；置信度同则按
  alertEventId 升序）——沿用账本既有规约 `REQ-LEDGER-02（先出后进执行序）`；
- 每个信号独立裁决：`arbiter.arbitrate({ 合成 bar, signal, position, availableCash })`，
  合成 bar 由该信号的 `signalTime` / `triggerPrice` 构造（实时无真实 Bar 可给）；
- 裁决通过 → 指令 + **假定成交**即时推进内存账户（现金按含费净额扣补、持仓机
  `onOrderFilled` 推进 T+1）；裁决失败 → 结构化拒绝（拒绝原因由引擎在调用 Arbiter
  前预判，保证 `reason` 精确：已持仓 / 空仓 / 资金不足 / T+1 / 整手不足）；
- 账户快照随每个假定成交更新，下一信号使用更新后的快照（卖出释放的资金当刻可用于
  后续买入）。

## 三、事件溯源虚拟账本

### 3.1 单一事实源

```sql
-- migration 037
CREATE TABLE IF NOT EXISTS `virtual_fill_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `alert_event_id` INT UNSIGNED NOT NULL,
  `security_id` INT UNSIGNED NOT NULL,
  `security_code` VARCHAR(32) NOT NULL,
  `side` ENUM('buy','sell') NOT NULL,
  `quantity` INT UNSIGNED NOT NULL,
  `price` DECIMAL(10,4) NOT NULL,
  `fees` DECIMAL(12,4) NOT NULL DEFAULT 0,
  `net_amount` DECIMAL(14,4) NOT NULL,
  `trading_day` DATE NOT NULL,
  `instruction` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_virtual_fill_events_alert_event_id` (`alert_event_id`),
  KEY `idx_virtual_fill_events_security_day` (`security_id`, `trading_day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- **追加即成交**：交易层产出 BUY/SELL 指令 → 追加一条 fill 事件（含指令 JSON）→
  账户状态随之推进；**unique(alert_event_id)** 使投递重试/幂等重放不会二次回填；
- **账户 = fold(事件)**：加载某票全部 fill（按 id 序）→ 依序喂
  `PositionStateMachine.onOrderFilled` + `CapitalLedger.applyFill` 重建快照。
  当前规模（每季约百条信号）fold 成本可忽略，不建快照表；若未来成为热点再加快照投影；
- **拒绝不落库**：拒绝可由"信号 + 账户快照"确定性重演，保持账本纯成交事实。

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

## 五、三个执行端适配

### 5.1 回测（apps/backtest/backtest-run.executor.ts 重构）

- 保留：Bar 循环、kernel 驱动、SimulatedBroker（Next-Bar 撮合 + 滑点手续费）、
  `backtest_trade_results` 持久化；
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
  **指令报告渲染** → adapter.send → 整批 SENT；
- TypeORM 端口实现 `VirtualFillLogPort`（append / loadBySecurity）；
- 引擎实例：单例（种子资金 env 配置），Arbiter 配 `cashAllocationRatio: 0.95`、
  无硬止损（遵循零死板止损准则）。

### 5.3 dev server（tools/strategy-dev/server.ts）

- **删除**手写流水线（`server.ts:899-985` 的手写 sizing / onSignal 出场 / 0.95）；
- 改用引擎 + 内存端口（与回测同构），本地撮合仍走 SimulatedBroker。

## 六、指令报告渲染（替代信号列表）

```text
[Mist 交易指令] 000001 平安银行 | 2026-08-12 09:35 ｜ 账户 可用 906,250 / 持仓 7,500股 @ 12.50
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

## 八、破坏性改动清单

| 被破坏 | 替代 |
|---|---|
| dev server 手写交易流水线（`server.ts:899-985`） | TradingEngine + 内存端口 |
| backtest executor 内联 Arbiter 编排 | engine.decide（每 Bar 批） |
| dev server 手写 0.95 仓位 | 引擎统一 `cashAllocationRatio: 0.95` |
| 回测 0.995 预算 + hardStopLoss -0.08（executor 内联配置） | 引擎配置化（0.95 预算；硬止损沿袭 -0.08 配置项，引擎参数透传） |
| envelope 信号列表消息 | 指令报告 |
| 回测组内处理顺序（kernel 顺序 → 先出后进） | 统一 interim 规则；重跑基线覆盖 |

## 九、边界与不变式

- 信号层零改动（KernelSignal / 决策流 / 虚拟出场子系统照旧）；
- 聚合层分组与契约 V2 零改动（fanout payload / jobId / sweep / replay 照旧）；
- 聚合层不再渲染最终消息（渲染权移交交易层报告模块）；
- 防未来函数不变（`signalTime ≡ StrategyBar.timestamp`、Next-Bar 撮合、严禁
  `pivotPrice` 入场）；
- 实时执行端仍是人工下单（无券商 API、无自动下单——2026-11-23 定稿不变）。
