# Design: 统一量化时序管道（Quant Pipeline）详细架构设计

## 1. 架构总览与分层拓扑

为了既满足**“领域逻辑统一、策略 Lib 资产收敛”**的高内聚诉求，又满足**“Node.js 单线程防卡死、生产高可用”**的微服务物理隔离约束，设计采用**“统一管道领域模型（Domain Pipeline SDK）+ 分离部署运行（Isolated Runtime Workers）”**的拓扑结构：

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   libs/strategy/src/pipeline/ (统一管道领域层)                    │
│                                                                                  │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │                              QuantPipeline                               │   │
│   │              调度核心: step(bar) / drive(source) -> 广播 Sink            │   │
│   └──────────────────────┬────────────────────────────┬──────────────────────┘   │
│                          │                            │                          │
│        1. 输入端 (BarSource)   │                            │ 3. 输出端 (QuantSink)    │
│   ┌──────────────────────────┴───┐            ┌───────┴──────────────────────┐   │
│   │ • HistoricalBarSource (Pull) │            │ • BrokerExecutionSink        │   │
│   │ • RealtimeBarSource   (Push) │            │   (SimulatedBroker +         │   │
│   └──────────────────────────────┘            │    PositionStateMachine)     │   │
│                          │                    │ • SimulationFrameSink        │   │
│                          ▼                    │   (几何Commands + 帧缓存)    │   │
│        2. 纯计算中枢 (Kernel)                  │ • SignalBatchCollectorSink   │   │
│   ┌──────────────────────────────┐            │   (批量信号收集器)           │   │
│   │   StrategyEvaluationKernel   │            └──────────────────────────────┘   │
│   │   (滑窗 + 决策流树求值)      │                                               │
│   └──────────────────────────────┘                                               │
└──────────────────────────────────────────────────────────────────────────────────┘
                           ▲                                ▲
                           │ 引入装配                        │ 引入装配
         ┌─────────────────┴──────────────┐   ┌─────────────┴──────────────────┐
         │          apps/backtest         │   │          apps/signal           │
         │     (计算密集型 RPC Worker)    │   │     (毫秒级低延迟在线 Daemon)   │
         ├────────────────────────────────┤   ├────────────────────────────────┤
         │ • 并发准入排队控制 (Queue)     │   │ • 242 桶 K 线密封监听 (Redis)  │
         │ • MySQL 历史行情流式拉取       │   │ • 多周期聚合 (1m->5m/1d)       │
         │ • 装配:                        │   │ • 装配:                        │
         │   HistoricalBarSource          │   │   RealtimeBarSource            │
         │   + Kernel                     │   │   + Kernel                     │
         │   + BrokerExecutionSink        │   │   + AlertDeliverySink          │
         │   + SignalBatchPersistenceSink │   │ • 独立进程 / 毫秒级在线守护     │
         │ • 独立进程 / CPU 密集沙盒      │   │                                │
         └────────────────────────────────┘   └────────────────────────────────┘
```

---

## 2. 核心接口与协议设计

### 2.1 管道核心：`QuantPipeline`

管道遵循因果律时序推进原则，核心数据流定义如下：

```typescript
export interface QuantPipelineConfig {
  readonly kernel: StrategyEvaluationKernel;
  readonly sinks: readonly QuantSink[];
}

export class QuantPipeline {
  private readonly kernel: StrategyEvaluationKernel;
  private readonly sinks: readonly QuantSink[];

  constructor(config: QuantPipelineConfig) {
    this.kernel = config.kernel;
    this.sinks = Object.freeze([...config.sinks]);
  }

  /**
   * 核心单步推演入口（单 Bar 因果驱动）。
   * 无论上游是实时推送还是历史回放，每推进一根确认 Bar 执行严格的三步因果律：
   * 1. Next-Bar 撮合与时序推进：通知各 Sink 处理上一根挂单与持仓状态（onBar）；
   * 2. 策略内核判定：推进滑窗与决策树，产出当期增量信号（kernel.push）；
   * 3. 信号分发与挂单生成：将增量信号广播给各 Sink（onSignal）；
   * 4. 交易日终盯市结算：若属于收盘 Bar，通知各 Sink 结算（onDayClose）。
   */
  public async step(bar: StrategyBar): Promise<readonly KernelSignal[]> {
    // 步骤 1: 广播 Bar 到达（用于撮合上一周期的挂单、更新持仓指标）
    for (const sink of this.sinks) {
      if (sink.onBar) await sink.onBar(bar);
    }

    // 步骤 2: 纯策略求值
    const signals = await this.kernel.push(bar);

    // 步骤 3: 广播增量信号（用于产生新的挂单、告警或持久化记录）
    if (signals.length > 0) {
      for (const signal of signals) {
        for (const sink of this.sinks) {
          if (sink.onSignal) await sink.onSignal(signal, bar);
        }
      }
    }

    // 步骤 4: 日终收盘结算（Mark-to-Market）
    if (isDailyCloseBar(bar)) {
      for (const sink of this.sinks) {
        if (sink.onDayClose) await sink.onDayClose(bar);
      }
    }

    return signals;
  }

  /** 历史批量回放驱动入口 */
  public async drive(source: HistoricalBarSource): Promise<PipelineDriveSummary> {
    return await source.drive(
      this.kernel,
      async (signal, bar) => {
        for (const sink of this.sinks) {
          if (sink.onSignal) await sink.onSignal(signal, bar);
        }
      },
      async (bar) => {
        for (const sink of this.sinks) {
          if (sink.onBar) await sink.onBar(bar);
        }
        if (isDailyCloseBar(bar)) {
          for (const sink of this.sinks) {
            if (sink.onDayClose) await sink.onDayClose(bar);
          }
        }
      },
    );
  }

  /** 结算并刷新管道全部 Sink */
  public async flush(): Promise<void> {
    for (const sink of this.sinks) {
      if (sink.flush) await sink.flush();
    }
  }
}
```

### 2.2 输出插件契约：`QuantSink`

统一抽象 Sink 生命周期，实现完全解耦：

```typescript
export interface QuantSink {
  readonly name: string;
  /** Bar 推进事件：用于 Next-Bar 撮合、更新未决订单、推进持有天数 */
  onBar?(bar: StrategyBar): Promise<void> | void;
  /** 信号触发事件：用于接收 KernelSignal 并生成交易委托、告警记录或落盘缓冲 */
  onSignal?(signal: KernelSignal, bar: StrategyBar): Promise<void> | void;
  /** 收盘事件：用于执行日终 T+1 解冻与逐日盯市（NAV 曲线生成） */
  onDayClose?(bar: StrategyBar): Promise<void> | void;
  /** 管道完成/批次刷新：用于清空写缓冲区、完成最后未决事务 */
  flush?(): Promise<void> | void;
}
```

---

## 3. 标准 Sink 插件设计与资产收敛

通过统一 Sink 抽象，`libs/strategy` 下零散的 `execution/`、`position/`、`simulation/` 得到全面收敛：

### 3.1 经纪商与持仓执行 Sink：`BrokerExecutionSink`
* **收敛对象**：`libs/strategy/src/execution/`（`SimulatedBroker`）+ `libs/strategy/src/position/`（`PositionStateMachine`）。
* **职责**：
  - 内部组合并协调 `SimulatedBroker` 和 `PositionStateMachine`；
  - `onSignal` 自动根据资金管理与信号方向（`ENTRY` / `EXIT`）向 Broker 报单；
  - `onBar` 自动在 Next-Bar 撮合挂单，并将成交回报（`OrderFilledEvent`）推送给持仓状态机；
  - `onDayClose` 触发收盘盯市，输出连续 NAV 净值数据点；
  - 对外提供 `getClosedTrades()`、`getNavHistory()`、`getPosition()` 与 `getBrokerSnapshot()`，对上层彻底屏蔽两者底层的繁琐交互。

### 3.2 仿真推演帧捕获 Sink：`SimulationFrameSink`
* **收敛对象**：`libs/strategy/src/simulation/` 的推演帧组装与信号映射逻辑。
* **职责**：
  - 在 `onBar` 时截取当前滑窗视图（`kernel.readWindow()`）；
  - 在 `onSignal` 时映射决策树证据链与图表显示标签（`displayTag`、`badgeText`）；
  - 产出符合前端图表规范的不可变帧快照（`SimulationFrame`）；
  - 支持会话级帧缓存与快照导出（`dumpCurrentState()`）。

### 3.3 信号收集与持久化 Sink：`SignalBatchCollectorSink`
* **职责**：
  - 在内存队列中收集回测产生的增量信号；
  - 当堆积达到 `batchSize`（如 100 条）或触发 `flush()` 时，批量回调外部持久化写入函数；
  - 彻底将数据库字段映射与批量持久化从回测主循环中解耦。

---

## 4. `apps/backtest` 重构方案（大幅瘦身）

原 `apps/backtest/src/backtest-run.executor.ts` 中的 `execute()` 方法长达 200+ 行手写胶水代码。重构后简化为清晰的三段式装配：

```typescript
// 重构后的 BacktestRunExecutor 核心逻辑伪代码
async runSingleSecurity(run: BacktestRun, securityId: number) {
  // 1. 编译策略定义并创建内核
  const compiled = compileStoredDefinitionVersion(...);
  const kernel = new StrategyEvaluationKernel({ ... });
  const source = new HistoricalBarSource(this.marketData, { ... });

  // 2. 装配标准 Sinks
  const executionSink = new BrokerExecutionSink({
    securityId,
    securityCode,
    initialCash: DEFAULT_BROKER_INITIAL_CASH,
  });
  const signalSink = new SignalBatchCollectorSink({
    batchSize: 100,
    onFlush: async (signals) => this.persistSignals(run.id, signals),
  });

  // 3. 构建并运行管道
  const pipeline = new QuantPipeline({
    kernel,
    sinks: [executionSink, signalSink],
  });

  const outcome = await pipeline.drive(source);
  await pipeline.flush();

  // 4. 结算指标并持久化
  const trades = executionSink.getClosedTrades();
  const navHistory = executionSink.getNavHistory();
  const summary = computePerformanceSummary(navHistory, trades);
  await this.persistRunSummary(run.id, summary);
}
```

---

## 5. 架构守门与防退化体系（Guard Rail Invariants）

重构全过程由以下四大刚性门禁守护，确保系统纯度与同构性：

1. **纯纯度门禁（`strategy-boundary.guard.spec.ts`）**：
   - `pipeline/` 目录同样遵循 0 外部依赖准则：禁止任何 `@nestjs/*`、`typeorm`、`redis`、`bullmq` 或环境变量访问；
2. **同构对账门禁（`strategy-pipeline-homogeneity.guard.spec.ts`）**：
   - 新增针对 `QuantPipeline` 的对账用例：断言 `pipeline.drive(HistoricalBarSource)` 与原生内核推式计算产出的信号流 100% 逐条逐字段对齐；
3. **双时间戳门禁（`strategy-dual-timestamp.guard.spec.ts`）**：
   - 守卫 `BrokerExecutionSink` 严格在 `signalTime` 的 Next-Bar 撮合成交，绝对禁止偷看当根 Bar 收盘价即时撮合；
4. **平滑向前兼容（Zero Breaking Changes）**：
   - `libs/strategy/src/index.ts` 保留所有既有的导出符号（`SimulatedBroker`、`PositionStateMachine`、`StrategySimulationSession`），底层平滑代理至新的模块，现有上层代码与测试 100% 兼容。
