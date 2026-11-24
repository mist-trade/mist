# 变化提案：虚拟交易层与统一 TradingEngine (Proposal)

## 一、背景与问题陈述 (Problem Statement)

### 1.1 三份平行交易流水线，语义已经漂移

当前系统存在**四条各自为政的交易编排**（私有研究链路自带第四份手写流水线），没有任何一层被称为"交易层"的共享域核心：

| 流水线 | 位置 | 裁决 | 仓位 | 账本 | 语义 |
|---|---|---|---|---|---|
| 回测 | `apps/backtest/backtest-run.executor.ts` 内联编排 | `ExecutionRiskArbiter` | Arbiter 内置 `cashAllocationRatio: 0.995` + 硬编码 `hardStopLossRatio: -0.08` | 内存态 `PositionStateMachine` + `CapitalLedger`，随跑随弃 | 0.995 |
| dev server | `tools/strategy-dev/server.ts` **手写**（`server.ts:899-985`） | 手写买卖逻辑（exit 走 `position.onSignal`，绕过 Arbiter） | **手写 `0.95`**（`server.ts:950`），与 Arbiter 重复且不一致 | 独立 `PositionStateMachine` 实例 | 0.95 |
| 实时 | **不存在** | 无 | 无 | 无 | — |
| 私有研究 | mist-alpha-private 研究脚本（harness，绕过内核直调插件） | 手写 | 手写 | `MultiLotVirtualPosition` 通道 lots（仅供出场评估） | — |

后果：同一组信号在四条链路中可能得到不同的交易决策；仓位比例、出场路径、风控开关四处漂移；新增交易语义必须改四处。

### 1.2 实时链路缺交易层：人拿到的是信号，不是指令

聚合层 V2（2026-11-24 已实施）投递的消息是**信号列表**（票 / 信号类型 / 置信度 / trace 链），回答的是"发生了什么"，不回答"怎么下单"：

- 一口气来一批同刻信号，哪个该执行、哪个该拒绝（已持仓 / 资金不足 / T+1 冻结）——没有裁决；
- 仓位该是多少——没有计算；
- 当前持有什么、现金多少——没有账本。

人工下单者被迫在脑内完成全部交易层工作，且与回测 Arbiter 的规则无法保证一致。

### 1.3 聚合消息的定位错位

聚合层当前直接渲染最终消息。按三层定稿（AGENTS 2026-11-24），聚合层的职责是**归因分组**，交易层的职责是**账本 + 裁决 + 仓位 → 交易指令**。最终投递的消息应当是交易层的**交易手册**，而非聚合层的信号列表。

### 1.4 账本无持久化

回测账本是随跑随弃的内存对象；实时需要一个跨重启、可审计、幂等的虚拟账本（初始资金 100 万，按"指令即成交"推进），当前不存在任何持久化设施。

## 二、目标与收益 (Goals & Benefits)

1. **一份交易层引擎，四个执行端（四链路合一）**：新建 `libs/strategy/src/trading/`
   域核心（`TradingEngine` + 持久化端口），回测、实时、dev server、私有研究全部
   收敛为薄适配器 / 门面数据端；入场与出场裁决同走规则管线
   （`PositionStateMachine.onSignal` 旁路根除）；消灭四份平行流水线与仓位语义漂移。
2. **决策与成交分离**：引擎纯决策（快照进 → 指令出）；成交有两个实现——回测 `SimulatedBroker`（Next-Bar 真实撮合 + 滑点手续费）、实时虚拟账本假定成交（按指令价即时回填）。回测真实性不因虚拟账本妥协。
3. **事件溯源虚拟账本**：`virtual_fill_events` 追加日志（**unique(alert_event_id)** 幂等锚点），账户状态 = fold(事件)；投递重试不重复回填，日志即真相、重放即自愈。
4. **交易手册替代信号列表**：最终投递消息由交易层渲染——票 / 方向 / 仓位 / 理由 / 归因链，被拒绝的信号连同原因全部输出（全程可审计，严禁静默吞信号）。
5. **交易层同构门禁**：信号层同构（三链路同一引擎）延伸到交易层——同组信号 + 同账户快照，回测/实时/dev 产出逐字段相同的指令集。
6. **冲突裁决留缝**：组内处理顺序（interim：先出后进、按置信度）作为引擎参数，未来"冲突裁决因子"研究定稿后插拔替换，不动结构。
7. **管线门面可独立运行（私仓离线全流程）**：新增 `runTradingPipeline` 纯函数门面——
   内存 Bars + 预设定义 + 插件注册表 → 信号 → 分组 → 交易手册，零 NestJS/DB/Redis
   依赖，可被私仓 esbuild 捆绑；私仓脚本从"只有信号"升级为拿到与线上同构的最终
   交易指令。聚合层的**分组逻辑**同步提取为纯域函数，线上（apps/signal）与离线
   （门面）共用同一实现。
8. **从零基准（2026-11-24 拍板）**：整数厘制 / ID 业务键派生 / 规则管线裁决 /
   黄金文件回放——域核心按"不管现有代码会怎么写"的标准建；复用组件做**算术移植**
   而非原样搬运（撮合与费率语义零改动，design 11.5）。

## 三、非目标 (Non-Goals)

- **自动下单**：实时执行端仍是人按指令人工下单；不接券商 API、不做实盘下单通道（2026-11-23 定稿不变）；
- **真实账本对接**：虚拟账本不读用户实盘持仓，初始资金 100 万为虚拟推演起点；
- **成交回写**：不做人肉成交录入，虚拟账本按"指令即成交"自洽推进（后期另立 change）；
- **同刻冲突裁决因子**：本 change 只实现 interim 规则（先出后进、按置信度），冲突裁决因子化另立研究；
- **多策略资金分配**：组合级现金池已就位，跨策略预算分配留待后续。

## 四、影响面 (Impact)

- **新增**：`libs/strategy/src/trading/`（引擎 + 账本域模型 + 端口）；`libs/shared-data/src/entities/virtual-fill-event.entity.ts`；`deploy/database/migrations/037_create_virtual_fill_events.sql`；`apps/notification` 交易手册渲染器与 TypeORM 端口实现。
- **重构**：`apps/backtest/backtest-run.executor.ts`（内联 Arbiter 编排 → engine.decide）；`tools/strategy-dev/server.ts`（删除手写流水线）；`apps/notification/notification-envelope.ts`（信号列表渲染退役 → 交易手册）；`libs/strategy` 交易组件移植（Arbiter if 树 → 规则管线并退役、`PositionStateMachine.onSignal` 决策分支删除、SimulatedBroker + 费率计算器算术重写整数厘、标识业务键派生）；
- **私仓接入**：`mist-alpha-private/build.mjs` 增加 `@app/strategy` / `@app/market-data`
  alias；新增 `scripts/run-pipeline.js`（本地 K 线 → 门面 → 交易手册）；`src/types.ts`
  的 `FactorPlugin` 私有副本与公共契约增加结构兼容守卫。
- **不变**：信号层、聚合层分组与契约 V2、fanout 结构、sweep/replay、信号层同构门禁。
- **破坏性**：dev server 与回测的组内处理顺序统一为"先出后进"（原回测为 kernel 顺序），回测数字可能与旧基线有小偏移；消息格式从信号列表升级为交易手册。无线上流量，无兼容负担。
