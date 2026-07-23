## Why

Theme A 已验证 TDX/QMT 原生实时 transport，但唯一存活链路仍保留两套不对称的 experimental wire、目录、路由、模式与监控命名，且 TDX 在 datasource 提前投影 canonical、QMT 只传 native。Theme B 开始产生 Redis、K 线与 signal 副作用前，必须先把两源提升为正式、可共同消费且具备等价 fencing/owner 安全保证的 realtime ingress。

## What Changes

- **BREAKING** 将 TDX/QMT datasource WebSocket 收敛为正式 schema v1 native envelope，使用统一 `payloadType`、`source`、per-symbol `sequence`、`capturedAt` 与完整 provider `native`；删除 `contractStatus`、`draftRevision` 和 datasource canonical projection。
- **BREAKING** 将活跃代码、目录、类名、路由、错误码、环境变量、部署脚本和监控指标中的 realtime `experimental` 命名晋级为正式命名，不保留长期双协议或旧 route alias。
- 在 backend 保留 source-specific client/validator/adapter，以共同 `RealtimeSnapshotIngressService` 生成 canonical snapshot；transport client/store 不直接写 Redis、K、signal 或通知。
- 将 QMT fencing 改为 `(source, symbol, streamEpoch)` 的 per-symbol sequence，并强化 stale owner/result fencing、owner replacement epoch 与 bridge build/artifact identity。
- 将 TDX/QMT 正式模式统一定义为 `*_REALTIME_MODE=builtin|off`，生产 desired state 均默认为 `builtin`，`off` 仅作为受控回滚；实际订阅仍由各自 realtime allowlist 控制。
- 统一 TDX/QMT diagnostics、freshness、drop reason、metrics 与 source-labelled alerts；非交易时段不得把缓存回读冒充实时新鲜度。
- 要求跨仓库 golden fixture/SHA、双源 Windows HIL、终端/datasource 重启恢复、原子发布/整体回滚和 protected-table digest 不变性。

## Capabilities

### New Capabilities

- `realtime-market-data-ingress`: 正式 TDX/QMT native frame、backend canonical ingress、source-specific adapter、fencing、freshness 与生产 activation 契约。

### Modified Capabilities

- `backend-datasource-integration`: 将内部 experimental consumer/route 晋级为正式 realtime ingress，并保持 datasource native、backend canonical 的边界。
- `datasource-provider-contract`: 定义 TDX/QMT 正式 native snapshot envelope 与 source-specific acquisition profile。
- `datasource-runtime-safety`: 强化 QMT owner/result fencing，删除活跃 experimental/legacy runtime 名称并保持 side-effect isolation。
- `monitoring-health-alerts`: 将 experimental metrics/config/alerts 晋级为正式 source-labelled realtime monitoring，TDX/QMT 均为生产常规探测对象。
- `mist-production-baseline`: 将双源生产 desired state 统一为正式 `builtin`，保留逐源显式 `off` 回滚。
- `experimental-realtime-bridges`: 移除已完成 Theme A 的实验 capability，由正式 `realtime-market-data-ingress` 取代；历史 archive/evidence 不变。

## Impact

- `mist-datasource`: TDX gateway/validator/routes、QMT collector/owner gateway、WS contract、health 与测试。
- `mist`: source clients/stores、共同 ingress/types/diagnostics、配置校验、模块装配与 current docs。
- `mist-deploy`: Windows mode/config/workflow、runtime smoke、evidence capture、原子切换与回滚。
- `mist-monitoring`: Windows exporter、Mac watchdog、metrics、alerts 与配置。
- `mist-fe`: 本 change 不新增产品 UI；仅在后续 snapshot/query change 中消费正式 API。
- 历史 OpenSpec archive/evidence 保持不变；稳定 `experimental-realtime-bridges` capability 由正式 capability 取代。
