# Proposal: Enhance Tactical Event Pipeline Risk Cut and Geometry Context

## Why

1. **战术汇聚层缺乏急迫风控直通能力 (Missing Zero-Delay Risk Cut)**：
   - 传统战术观察窗机制（`TemporalWindowEngine`）需要等待多个 Confirmation 信号或多根 Bar 延时确认；
   - 对于突发的紧急风控/逃命事件（`action: 'SELL', kind: 'RISK_CUT'`），等待观察窗会造成严重的滑点亏损与被动挨打；
   - 紧急风控必须支持零延迟（`windowBars: 0`）即刻发射，并在触发时瞬时清洗已挂起的多头入场观察窗。

2. **几何形态上下文缺乏结构化全量透传 (Missing Full Geometry Context)**：
   - 外部因子插件在消费缠论形态时，若仅依靠自行切片 K 线，容易产生中枢与笔的逆向猜测误差；
   - 主流程应当在上下文黑板中（`context.attributes.set('chan.geometry', ...)`）直接提供全量、客观的几何形态骨架（包含中枢、笔、分型序列），作为一等公民供下游消费。

## What Changes

1. **战术汇聚层支持零延迟风控直通 (`RISK_CUT`)**：
   - 在 `DEFAULT_TACTICAL_AGGREGATOR_CONFIG.windows` 中声明零延迟风控规则：`windowBars: 0`、`requiredConfirmationTags: []`、`kind: 'RISK_CUT'`；
   - 紧急卖点到达时，0 延迟直出驱动消费层平仓，并在 `updateSetupState` 时清洗所有未决多头买入观察窗。

2. **全量透传客观几何形态 (`ChanGeometryPayload`)**：
   - 在求值上下文黑板中规范化导出全量中枢序列、笔序列与分型序列；
   - 为因子消费端提供纯客观数学底座，杜绝局部切片猜测。

## Capabilities

### New Capabilities
- `tactical-event-pipeline`：具备 0 延迟极速风控切断（`RISK_CUT`）直通能力与未决入场窗口即时清洗。
- `chan-geometry-context`：在上下文黑板中提供标准化纯客观几何形态骨架。
