# Tasks: Enhance Tactical BSP Hierarchy And Bear Defense

## Phase 1: 完整客观几何形态导出与战术汇聚层注册（`mist/libs/strategy`）

- [x] 1.1 `chan-bsp.plugin.ts`：计算客观几何形态骨架（`channels` 含 $ZG/ZD/GG/DD$、`bis` 端点与极值、`fenxings`），放入 `opinion.evidence.geometry` 并自动写入黑板 `context.attributes.set('chan.geometry', ...)`
- [x] 1.2 `tactical-event.types.ts`：在 `DEFAULT_TACTICAL_AGGREGATOR_CONFIG.windows` 中增加 `plugin.tactics.bear-left-right-bsp` 逃命规则（`windowBars: 0`, `requiredConfirmationTags: []`, `compositeBadgeText: '熊市极速逃命'`, `action: 'SELL'`, `kind: 'RISK_CUT'`）
- [x] 1.3 `tactical-event-aggregator.spec.ts`：增加熊市三大逃命卖点（跳空低开、破5日线、次级破零）测试，验证 0 延迟发射、不受冷却拦截且即刻清空未决多头观察窗
- [x] 1.4 执行 `libs/strategy/src/tactical-event/` 单元测试，确保全绿通过

## Phase 2: 牛市与熊市插件统一消费完整几何形态（`mist-alpha-private`）

- [x] 2.1 统一几何契约定义：在私仓定义 `ChanGeometryPayload`、`ChanZhongshuGeometry`、`ChanBiGeometry`，消灭手工粗暴切片
- [x] 2.2 `bull-left-right-bsp.plugin.ts` 升级：
  - 读取 `chan.geometry` 完整几何，扩展 `SessionStateRecord` 维护 1买低点与中枢状态
  - 1买：基于几何中枢与 5m 动量，输出 `BUY_1B_EXTREME_LEFT`（极限左侧1买）与 `BUY_1B_CONSOLIDATION`（单中枢盘整1买），牛市不强制双中枢
  - 2买：强校验 `hasPriorFirstBuy` 且次回踩 `low >= lastFirstBuyPrice`；输出 `BUY_2B_SUB_FENXING_LEFT` 与 `BUY_2B_SUB_CROSS_ZERO_RIGHT`
  - 3买：强校验中枢突破且次回抽 `low > lastTargetCentral.zg`；输出 `BUY_3B_ZG_EDGE_LEFT` 与 `BUY_3B_FIRE_RIGHT`
  - 向后兼容原有别名与 evidence 字段
- [x] 2.3 `bear-left-right-bsp.plugin.ts` 升级：
  - 同样接入 `chan.geometry` 完整几何形态，彻底消灭 `slice(-30)` 等手工切片逻辑
  - 极速逃命卖点（跳空低开、跌破 MA5、次级破零、中枢下沿击穿破位）0 延迟触发
  - 抄底买点直接从完整 `channels` 判定双中枢下行趋势背驰
- [x] 2.4 编写 `bull-left-right-bsp.plugin.spec.ts` 与 `bear-left-right-bsp.plugin.spec.ts` 完整单测套件，通过所有断言

## Phase 3: 全链路对账与自适应质检交付流水线

- [x] 3.1 编译与类型检查：`cd mist && ./node_modules/.bin/tsc --noEmit --incremental false` 零错误，私仓 `npm run typecheck` 零错误
- [x] 3.2 代码风格审查：`eslint` 零错误，格式规范一致
- [x] 3.3 架构门禁守护：运行四大守门测试（`dev-server-boundary`, `strategy-boundary`, `strategy-dual-timestamp`, `strategy-pipeline-homogeneity`）及私仓 `pure-context-isolation.guard.spec.ts` 100% 通过
- [x] 3.4 OpenSpec 严格契约校验：`openspec validate --specs --strict` 115 项全绿
