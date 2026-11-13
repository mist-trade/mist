# Tasks: lifecycle-driven-kline-reconciliation

## Phase 1: 双桥通信整合与三态简化 (mist-datasource)
- [ ] 1.1 **新增独立心跳路由**：
  - `tdx/routes/bridge.py` & `src/datasource/tdx/realtime/gateway.py` (L960-L977): 新增 `POST /v1/tdx/bridge/heartbeat`
  - `qmt/routes/bridge.py` & `src/datasource/qmt/realtime/gateway.py` (L229-L245): 新增 `POST /v1/qmt/bridge/heartbeat`
- [ ] 1.2 **极简三态健康接口**：
  - `src/ws/health_contract.py`: 新增 `HealthState = Literal["DEAD", "BROKER_DOWN", "HEALTHY"]`
  - `tdx/main.py` (L134-L190) & `qmt/main.py` (L204-L222): 归一化输出 `state: "DEAD" | "BROKER_DOWN" | "HEALTHY"`
- [ ] 1.3 **改造 QMT 内置桥 (`mist_qmt_realtime_bridge.py`)**：
  - L280-L320: 启动 5s 独立守护线程 `_heartbeat_loop`
  - L348-L420: 删除 `_poll_subscription_control`，合并历史命令与订阅命令为单轮询 `_poll_commands`
- [ ] 1.4 **改造 TDX 内置桥 (`mist_tdx_realtime_bridge.py`)**：
  - L610-L739: 启动 5s 独立守护线程 `_heartbeat_worker`
- [ ] 1.5 **双桥单元测试与契约防护**：
  - 更新 `test_health_contract.py`、`test_terminal_bridge_contract.py`、`test_qmt_builtin_subscription_bridge.py`、`test_tdx_openapi_artifacts.py`

## Phase 2: 旧代码深度清理与瘦身 (Legacy Pruning & Dead Code Clean)
- [ ] 2.1 **删除网关 `busy_until` 脏状态代码 (mist-datasource)**：
  - `src/datasource/qmt/realtime/gateway.py`: 删除 `self._busy_until` (L169)、`_owner_is_stale` 中的延迟 hack (L511-L516)、`extend_busy_until()` (L518-L526)
  - `src/datasource/qmt/history_download.py`: 删除 `extend_busy_until` 调用 (L123)
  - `tests/unit/test_qmt_gateway_busy_until.py`: 彻底删除整个测试文件
- [ ] 2.2 **删除 QMT 分裂订阅轮询路由 (mist-datasource)**：
  - `qmt/routes/bridge.py`: 彻底删除 `/subscriptions/poll` (L309-L325) 与 `/subscriptions/result` (L327-L355) 路由，更新 `tests/integration/test_qmt_bridge_routes.py`
- [ ] 2.3 **删除主仓库定时拉取 Cron 与旧逻辑 (mist)**：
  - `apps/schedule/src/data-collection.controller.ts`: 删除 `handleNightlyPostCloseSync` (L86-L135) 与 `handleMorningRetrySync` (L140-L184)
  - `apps/schedule/src/schedule.module.ts`: 移除对 `HistoricalCollectorModule` 的导入解耦
  - `libs/timezone/src/cron-schedules.constants.ts`: 删除 `CRON_POST_CLOSE_SYNC_NIGHTLY_2230` 与 `CRON_POST_CLOSE_SYNC_MORNING_0630`
- [ ] 2.4 **重构并瘦身 Collector 服务 (mist)**：
  - `apps/mist/src/collector/post-close-sync.service.ts`: 删除 10 分钟轮询 `ensureHistoryDownloaded` (L56-L234)
  - `apps/mist/src/collector/history-download.client.ts`: 标记 `@deprecated` 并解除强依赖
- [ ] 2.5 **更新清理受影响单元测试 (mist)**：
  - `apps/schedule/src/data-collection.controller.spec.ts`: 移除 22:30 和 06:30 Cron 断言用例
  - `libs/timezone/src/trading-session.util.spec.ts`: 移除对应的 Cron 校验断言
  - `apps/mist/src/collector/post-close-sync.service.spec.ts`: 移除 `ensureHistoryDownloaded` 测试用例

## Phase 3: 主后端支持服务与审计持久化 (mist)
- [ ] 3.1 **创建审计表 Migration 034**：
  - `deploy/database/migrations/034_create_collector_sync_events.sql` (确认前序已达 033)
  - 新建 `libs/shared-data/src/entities/collector-sync-event.entity.ts`
  - 注册至 `libs/shared-data/src/entity-graph.ts` (MIST_ENTITIES) 与 `index.ts`
  - 更新 `entity-graph.spec.ts`、`managed-column-naming.spec.ts`、`audit-timestamp-metadata.spec.ts`
- [ ] 3.2 **基线检查点管理器 (`SyncCheckpointManager`)**：
  - 管理 `mist/.data/sync-checkpoints.json`
  - 维护各标的 `verified_until` 物理基线，支持封存历史与自动推进
- [ ] 3.3 **实现缺口清单接口 (`GET /v1/collector/sync-manifest`)**：
  - `apps/mist/src/collector/collector.controller.ts`: 暴露端点
  - 根据数据源身份 (TDX/QMT) 精准过滤池子 B 订阅标的 + 对应指数（TDX: 880003; QMT: 000001, 399006, 000688）
  - 结合 `sync-checkpoints.json` 生成三大核心周期 (DAY, 5m, 30m) 待追赶缺口区间
- [ ] 3.4 **实现反向批量入库接口 (`POST /v1/collector/push-bars`)**：
  - 复用 `saveBaseK` 事务幂等入库
  - 记录单次批处理至 `collector_sync_events` 表
- [ ] 3.5 **实现入库后 4 级全景校验器 (`KlineVerificationValidator`)**：
  - 新建 `apps/mist/src/collector/helpers/kline-verification.validator.ts`
  - 1 级几何因果律校验 (价格>0, 几何包络, volume>=0)
  - 2 级数量与时序单调性校验 (时间戳单调递增, 条数满格: day=1, 30m=8, 5m=48)
  - 3 级跨周期三维对账校验 (日K OHLCV 与 5m 极值和累加和无偏)
  - 4 级停牌免死判定与检查点推进门禁 (全部通过方可推进 `verified_until`)

## Phase 4: 边缘自治对账工作流实现 (mist-datasource)
- [ ] 4.1 **新建 `src/datasource/reconcile.py`**：实现 `reconcile_and_sync` 异步工作流
- [ ] 4.2 **状态跃迁触发点挂载**：在 QMT/TDX 客户端注册且进入 `HEALTHY` 时触发 `reconcile_and_sync`
- [ ] 4.3 **分批推送与通知闭环**：按 1000 条分批推送给 `push-bars`；完成后调用企微/飞书 Webhook 广播详情

## Phase 5: 联调与验收
- [ ] 5.1 **端到端集成测试**：模拟终端客户端启动上报 -> 缺口发现 -> 本地提取 -> Push 入库 -> 4 级校验通过 -> 水位线推进全链路验证
- [ ] 5.2 **回测与因果律对账**：验证通过该机制补入的日K与分钟K线与实盘一致
