# Tasks: Enhance Tactical BSP Hierarchy And Bear Defense

## Phase 1: 完整客观几何形态导出与战术汇聚层注册（`mist/libs/strategy`）

- [x] 1.1 `chan-bsp.plugin.ts`：计算客观几何形态骨架（`channels` 含 $ZG/ZD/GG/DD$、`bis` 端点与极值、`fenxings`），放入 `opinion.evidence.geometry` 并自动写入黑板 `context.attributes.set('chan.geometry', ...)`
- [x] 1.2 `tactical-event.types.ts`：在 `DEFAULT_TACTICAL_AGGREGATOR_CONFIG.windows` 中增加零延迟风控逃命规则（`windowBars: 0`, `requiredConfirmationTags: []`, `compositeBadgeText: '熊市极速逃命'`, `action: 'SELL'`, `kind: 'RISK_CUT'`）
- [x] 1.3 `tactical-event-aggregator.spec.ts`：增加逃命卖点测试，验证 0 延迟发射、不受冷却拦截且即刻清空未决多头观察窗
- [x] 1.4 执行 `libs/strategy/src/tactical-event/` 单元测试，确保全绿通过

## Phase 2: 全链路对账与自适应质检交付流水线

- [x] 2.1 编译与类型检查：`cd mist && ./node_modules/.bin/tsc --noEmit --incremental false` 零错误
- [x] 2.2 代码风格审查：`eslint` 零错误，格式规范一致
- [x] 2.3 架构门禁守护：运行四大守门测试（`dev-server-boundary`, `strategy-boundary`, `strategy-dual-timestamp`, `strategy-pipeline-homogeneity`）100% 通过
- [x] 2.4 OpenSpec 严格契约校验：`openspec validate enhance-tactical-bsp-hierarchy-and-bear-defense --strict --type change`
