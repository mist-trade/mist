# Design: 战术事件汇聚层技术架构与实现设计

## 1. 架构总览

战术事件汇聚层（Tactical Event Layer）作为纯净信号层与交易/通知消费层之间的无副作用事件处理总线，独立位于 `libs/strategy/src/tactical-event/` 中。

```mermaid
flowchart TD
    subgraph RawSignalLayer [第 1 层：纯净信号层 (Raw Signal Layer)]
        BarSource[HistoricalBarSource / RealtimeKernelPool] -->|push bar| Kernel[StrategyEvaluationKernel]
        Kernel -->|evaluate| DecisionTree[DecisionFlowEvaluator]
        DecisionTree -->|原始逐 Bar 信号| RawSignals[KernelSignal[]]
    end

    subgraph TacticalLayer [第 2 层：战术事件汇聚层 (Tactical Event Layer)]
        RawSignals --> Aggregator[TacticalEventAggregator]
        
        subgraph Pipeline [内部流式管线]
            Edge[1. 边沿检测器 EdgeDetector]
            Window[2. 因果时序观察窗 TemporalWindowEngine]
            Cooldown[3. 战术去抖冷却 TacticalCooldownTracker]
            Edge --> Window --> Cooldown
        end
        
        Aggregator --> Pipeline
        Pipeline --> TacticalEvents[TacticalEvent[] 战术事件流]
    end

    subgraph Consumers [第 3 层：消费与呈现层 (Consumers)]
        TacticalEvents -->|入场/出场事件| Broker[SimulatedBroker / PositionStateMachine]
        TacticalEvents -->|确立战术通知| Notification[apps/notification 微信/飞书]
        
        RawSignals -. 原始观测透视 .-> UI[前端图表 TradingViewChart]
        TacticalEvents -. 战术买卖点 .-> UI
        Broker -. 实际成交与持仓 .-> UI
    end
```

---

## 2. 核心数据结构与契约定义

### 2.1 战术事件模型 (`TacticalEvent`)
```ts
export type TacticalAction = 'BUY' | 'SELL';

export type TacticalEventKind = 
  | 'ENTRY'       // 战术入场事件（多头/空头开仓）
  | 'EXIT'        // 战术出场事件（平仓/止盈）
  | 'RISK_CUT';   // 战术风控紧急撤退事件

export interface TacticalEvent {
  /** 唯一事件 ID */
  readonly eventId: string;
  /** 关联策略与版本 */
  readonly definitionId: number;
  readonly versionId: number;
  readonly securityCode: string;
  /** 战术意图 */
  readonly action: TacticalAction;
  readonly kind: TacticalEventKind;
  /** 确立时间戳（必须等于当期确认 Bar 的 timestamp，严禁未来函数） */
  readonly timestamp: Date;
  /** 触发市价（当期确认 Bar 收盘价） */
  readonly triggerPrice: number;
  /** 极值形态时间戳（如缠论一买底分型端点时间，用于图表形态标记对齐） */
  readonly pivotTime: string | null;
  /** 极值形态价格（用于止损止盈参考） */
  readonly pivotPrice: number | null;
  /** 综合置信度 (0~100) */
  readonly confidence: number;
  /** 业务徽章与显示标签 */
  readonly badgeText: string;
  readonly displayTag: string;
  /** 归因证据链：包含触发信号与确认信号 */
  readonly triggerSignal: KernelSignal;
  readonly confirmingSignals: readonly KernelSignal[];
  /** 窗口耗时（从触发到最终确认跨越的 Bar 数，0 表示同 Bar 边沿触发） */
  readonly elapsedBars: number;
  /** 战术归因原因说明 */
  readonly reason: string;
  readonly styleMeta?: Readonly<{
    color?: string;
    position?: 'above' | 'below';
  }>;
}
```

### 2.2 汇聚层配置协议 (`TacticalAggregatorConfig`)
```ts
export interface TacticalAggregatorConfig {
  /** 边沿检测配置：哪些状态类插件需要执行 0->1 跳变微分 */
  readonly edgePlugins?: readonly {
    readonly pluginId: string;
    readonly triggerOn: 'RISING' | 'FALLING' | 'CHANGE';
  }[];
  /** 时序观察窗配置 */
  readonly windows?: readonly {
    /** 扳机信号标签/类型（如 'plugin.chan.bsp' 或 'first_buy'） */
    readonly triggerTag: string;
    /** 最大等待观察窗口 Bar 数量（如 3~5 根 Bar） */
    readonly windowBars: number;
    /** 必须获得的确认插件/信号列表（如 'plugin.tactics.volume-price-confirmation'） */
    readonly requiredConfirmationTags: readonly string[];
    /** 窗口合成事件的业务名称 */
    readonly compositeBadgeText: string;
  }[];
  /** 战术冷却配置：触发一次有效战术事件后的闭锁 Bar 根数（防高频抽打） */
  readonly cooldownBars?: number;
}
```

---

## 3. 内部流式处理引擎设计

`TacticalEventAggregator` 实现单调推演与状态管理，内部包含三大处理环节：

### 3.1 环节一：边沿微分检测（Edge Detection）
- **职责**：将“持续状态（Level State）”转为“离散脉冲（Edge Impulse）”。
- **机制**：
  维护 `lastPluginState: Map<string, string>`。
  对于指定的宏观/均线插件，当且仅当 `currentState !== lastState && currentState === 'BUY'` 时，放行一次 `RISING_EDGE` 脉冲，后续维持期静默拦截。

### 3.2 环节二：因果时序观察窗（Temporal Window Consensus）
- **职责**：解决多因子跨时间维度的相位差（Phase Mismatch）。
- **执行生命周期**：
  1. **开窗（Window Open）**：当收到扳机信号（如缠论一买/二买，或边沿跳变）时，在内存中注册活跃观察窗口：
     `ActiveWindow = { triggerSignal, startBarIndex, expiresAtBarIndex: startBarIndex + W, confirmations: Set<string>() }`；
  2. **监听与匹配（Observation & Match）**：在后续 $t \sim t+W$ 根 Bar 推进时，检查当期信号是否包含 `requiredConfirmationTags`（如放量 VPCI 突破）；
  3. **合成发射（Synthesize & Emit）**：
     - 若在有效期内收集齐确认条件，立即**合成**一条 `TacticalEvent`；
     - 满足双时间戳契约：`timestamp` 严格取**当期确认 Bar 的时间戳**，`pivotTime` 继承扳机的形态端点时间戳；
     - 关闭并注销该窗口；
  4. **超时注销（Timeout Drop）**：若超过 $W$ 根 Bar 仍未获得确认，静默注销该窗口，不发射任何事件，不留内存残余。

### 3.3 环节三：战术冷却与去抖（Tactical Cooldown & Debounce）
- **职责**：杜绝震荡市中的频繁来回假摔磨损。
- **机制**：
  维护 `lastEmittedBarIndex`。在发射一条 `TacticalEvent` 后，设置 `cooldownUntilBarIndex = currentBarIndex + cooldownBars`。在冷却期内，任何同向入场事件均被平滑抑制。

---

## 4. 三端对接与双重视角落地

### 4.1 回测与推演执行层对接
- `runUnifiedSimulationBacktest` 与 `backtest-run.executor` 中：
  `HistoricalBarSource.drive()` 产生的 `signals` 先流入 `TacticalEventAggregator.push(signal, bar)`；
  返回的 `tacticalEvents` 直接下达给 `ExecutionRiskArbiter` 与 `SimulatedBroker`；
- 彻底治愈平均持仓只有 2.8 天的碎割问题，恢复健康的波段持仓。

### 4.2 实盘告警层对接
- `apps/signal` 的 `CandleFinalizedJobProcessor`：
  内核产出的增量信号经 `TacticalEventAggregator` 过滤收敛后，只将确立的 `TacticalEvent` 写入 `strategy_signals` 与 `strategy_alert_events`；
  企业微信与飞书告警推送从根本上杜绝 45009 频控封锁。

### 4.3 前端图表双层可视化（Dual-View Toggle）
- `TradingViewChart` 扩展图层控制：
  - **图层 A：`raw_signals`（纯净信号透视）**：灰度小点或淡色标记，默认折叠，开发者排查算法时一键展开；
  - **图层 B：`tactical_events`（战术买卖事件）**：高对比度、带徽章的醒目标记（如 `2买+放量`），默认展示；
  - **图层 C：`trades`（成交与持仓）**：买入/卖出连线与持仓盈亏区间。

---

## 5. 防退化与架构红线（Guardrails）

1. **三链路同构刚性守门**：
   `TacticalEventAggregator` 必须具备纯函数状态机特性，在回测、实时和推演中灌入相同 Bar 序列时，输出的 `TacticalEvent[]` 必须 100% 逐条一致。由 `strategy-pipeline-homogeneity.guard.spec.ts` 同步纳入守护。
2. **法定双时间戳守门**：
   合成事件的 `timestamp` 严格等于当前确认 Bar 的右侧闭合时间，`pivotTime` 严格等于端点极值时间，严禁未来函数，由 `strategy-dual-timestamp.guard.spec.ts` 守门。
3. **零跨层污染**：
   `libs/strategy/src/tactical-event/` 严禁引入任何 NestJS、TypeORM、Redis 依赖，保持纯 TypeScript 领域模型纯度。
