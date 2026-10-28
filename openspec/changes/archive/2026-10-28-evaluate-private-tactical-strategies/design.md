# Design: 基于本地开发网关 API 的外部战术因子评估系统设计

## 1. 总体架构拓扑 (Architecture Topology)

系统严格维持“微服务生产同构”与“本地开发网关 API 驱动”的双轨设计：

```
                    ┌──────────────────────────────────────────────┐
                    │          客户端 / 评测调用方 (Client)         │
                    └──────────────────────┬───────────────────────┘
                                           │ HTTP REST (端口 8001)
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │     本地开发网关 (tools/strategy-dev/server)  │
                    │  • POST /v1/strategy-backtests (回测与压力测试)│
                    │  • GET  /v1/strategy-backtests/:id/signals   │
                    │  • GET  /v1/simulation/dump (诊断快照)        │
                    └───────┬──────────────────────────────┬───────┘
                            │                              │
                            ▼                              ▼
             ┌──────────────────────────────┐   ┌──────────────────────────────┐
             │ 策略树与执行内核              │   │ 因果撮合与风控执行引擎        │
             │ • StrategyEvaluationKernel   │   │ • SimulatedBroker (Next-Bar) │
             │ • DecisionFlowEvaluator      │   │ • PositionStateMachine (NAV) │
             │ • ExternalFactorPluginLoader │   │ • ExecutionRiskArbiter       │
             └──────────────┬───────────────┘   └──────────────┬───────────────┘
                            │                                  │
                            ▼                                  ▼
             ┌──────────────────────────────┐   ┌──────────────────────────────┐
             │ 纯数学指标库 (@app/indicators) │   │ 极端压力测试套件              │
             │ • computePerformanceSummary  │   │ • StressTestingSuiteOrch.    │
             │ • computeSharpeRatio (Polars)│   │ • 5 Preset Stress Scenarios  │
             └──────────────────────────────┘   └──────────────────────────────┘
```

---

## 2. 接口设计与返回契约 (API Contract Design)

### 2.1 请求端点：`POST /v1/strategy-backtests`

#### 请求载荷 Schema
```typescript
export interface DevBacktestRunRequest {
  readonly symbol: string;               // 标的代码，如 "000001"
  readonly period: number;               // 周期，如 1440 (日线), 30 (30m)
  readonly mode?: 'single' | 'composite';// 评测模式：单因子消融 vs 复合决策流
  readonly pluginId?: string;            // 单因子模式下的目标插件 ID
  readonly startDate?: string;           // 起始时间 (>= 1996-12-16)
  readonly endDate?: string;             // 结束时间
  readonly initialCash?: number;         // 初始本金，默认 1000000
  readonly runStressSuite?: boolean;     // 是否联动运行五大极端压力沙盒，默认 true
}
```

#### 响应载荷 Schema
```typescript
export interface DevBacktestRunResponse {
  readonly runId: number;
  readonly status: 'completed' | 'failed';
  readonly symbol: string;
  readonly period: number;
  readonly mode: 'single' | 'composite';
  readonly pluginId?: string;
  readonly performance: {
    readonly sharpeRatio: number;        // 年化夏普比率 (基于 Rust Polars SIMD)
    readonly totalReturnRatio: number;   // 累计收益率
    readonly annualizedReturnRatio: number;
    readonly maxDrawdown: number;        // 最大回撤
    readonly winRate: number;            // 胜率 (0.0 ~ 1.0)
    readonly profitFactor: number;       // 盈亏比
    readonly totalTrades: number;        // 平仓总笔数
    readonly initialCash: number;
    readonly endingEquity: number;
  };
  readonly stressReport?: {
    readonly overallRating: 'PASS' | 'MARGINAL' | 'FAIL';
    readonly overallHealthScore: number;
    readonly hasBankruptcy: boolean;
    readonly worstDailyReturn: number;
    readonly totalLiquidityPenalty: number;
    readonly scenarioOutcomes: ReadonlyArray<{
      readonly scenarioId: string;
      readonly scenarioName: string;
      readonly riskGrade: string;
      readonly maxDrawdown: number;
      readonly sharpeRatio: number;
      readonly liquidityPenaltyLoss: number;
    }>;
  };
  readonly signalCount: number;
}
```

---

## 3. 架构刚性门禁设计 (Boundary Guard Invariants)

为了坚守人类指令“不允许直接调用底层函数 & 使用本地开发服务器测试流程”，建立专职架构门禁测试：
📁 **`libs/strategy/src/dev-server-api-boundary.guard.spec.ts`**

### 守门核验项：
1. **网络与接口契约守门**：评测流程客户端必须通过 HTTP 协议与 `tools/strategy-dev/server.ts` 的 `8001` 端口通信，禁止绕过 HTTP 层直接调用内部内存函数做后门测试；
2. **底层计算下沉守门**：`server.ts` 作为薄网关，严禁在网关内手写指标循环，必须 100% 委托 `StrategyEvaluationKernel`、`SimulatedBroker` 与 `@app/indicators`；
3. **私有插件保密性守门 (IP Isolation)**：
   - 公仓代码与测试中只引用抽象契约 `ExternalFactorPluginLoader`，严禁硬编码或直接导入私有仓路径下的源码；
   - 保证在公版开源构建中，当外部插件目录不存在时优雅降级且 CI 100% 绿灯。

---

## 4. 本地 Dev Server 事件循环治理 (Event Loop Non-Blocking)

### 痛点根因分析
原 `tools/strategy-dev/server.ts` 在 `server.listen` 的 `setTimeout(..., 100)` 内部启动了全量预热循环，由于长时序计算链上的 Microtask 连续解析，单线程 Node.js 事件循环被占满，导致外部发来的 HTTP 连接请求（Macrotask）无法被处理。

### 优化方案
1. **提供无感按需预热**：支持通过环境变量 `SKIP_DEV_PREHEAT=true` 跳过启动时的全量重型预热，由请求到来时按需计算；
2. **事件循环分批让渡**：在回测推流长循环中引入微小的分批 `setImmediate` 调度点，确保在任何大规模回测计算过程中，HTTP 服务的请求吞吐与生命周期心跳始终保持毫秒级流畅响应。
