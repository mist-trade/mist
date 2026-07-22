## Context

TDX 与 QMT 当前都经过 terminal owner、loopback datasource、WebSocket、Mist strict client 和内存 store，但形成于两个时间点：TDX 先完成 typed projection 与 per-symbol fencing，QMT 后以 full-native、global sequence、default-off 的最小 transport 接入。Theme B 即将新增持久化和业务副作用，继续让正式生产依赖 experimental 命名和不一致语义会把 source 差异泄漏到 Redis、K 线、API 与通知。

约束包括：TDX 继续使用官方 `subscribe_hq`/`get_market_snapshot`，QMT 继续使用大 QMT 内置 Python 3.6 bridge 与 `get_full_tick`；不恢复 legacy graph；不修改 migration 006；本 change 不写 Redis/MySQL/K/signal；历史 archive 不回改；任何 wire/owner 变化必须重跑相应 Windows HIL。

## Goals / Non-Goals

**Goals:**

- 将唯一存活的 TDX/QMT realtime transport 晋级为正式 schema v1，并在活跃代码中移除 realtime `experimental`/`legacy` 命名。
- 让 datasource 只验证并传递 source-specific native object，在 backend 统一生成 canonical snapshot。
- 让两源都按 `(source, symbol, streamEpoch)` fencing，并在写入副作用前具备等价的 owner/result safety。
- 将 TDX/QMT 生产 desired state 均设为 `builtin`，提供逐源显式 `off` 整体链路回滚。
- 为下一 change 提供稳定的 `RealtimeSnapshotIngressService`，但保持本 change side-effect-free。

**Non-Goals:**

- Redis snapshot、1 分钟 K、query API、frontend、signal contextSnapshot 或 notification。
- 强迫 TDX/QMT 使用同一 native API、native shape、terminal runtime 或订阅实现。
- portfolio backtesting、G2 operations readiness 或任何交易操作。

## Decisions

### 使用一个正式 native envelope，而不是两套 canonical wire

Datasource 发出 `mist.realtime.native_snapshot` schema v1，包含 `source`、`acquisitionProfile`、`streamEpoch`、per-symbol `sequence`、`symbol`、`capturedAt` 与完整 `native`。删除 `contractStatus` 与 `draftRevision`。TDX/QMT native 内容不对齐；backend source adapter 负责严格验证 provider 字段并产生 `CanonicalRealtimeSnapshot`。

备选方案是在 datasource 继续输出 TDX canonical、QMT native，但会迫使后续业务入口分叉，违反 backend 统一边界。

### Source client 独立、ingress 与产品语义共用

TDX/QMT WebSocket client、owner handshake 和 provider adapter 保持独立。两者通过 transport fence 后调用共同 `RealtimeSnapshotIngressService.accept(frame)`；共同层拥有 security identity、canonical type、quality/freshness 和 diagnostics。store 不执行异步 I/O，本 change 的 ingress sink 仍只更新 bounded memory/diagnostics。

### QMT 改为 per-symbol sequence 并强化 owner result fence

QMT collector 为每个 symbol/epoch 维护 sequence，backend 也按 symbol fencing。QMT poll/result 绑定 owner generation 或 lease，owner replacement 旋转 epoch，旧 in-flight result 必须丢弃；health/evidence 暴露 bridge build/artifact identity。实现保持 Python 3.6 compatible。

### 正式命名直接切换，不长期运行双协议

活跃目录、类、route、payload、env、error code、metric、workflow 和脚本全部使用 `realtime`/`builtin`。内部 WS 与 diagnostic route 没有公共第三方 consumer，采用同一维护窗口直接切换；不保留长期 alias。历史 archive/evidence 保留旧名字。rollback 以已记录的整套 repository/image/config 版本执行，而不是混跑 v0/v1。

### TDX/QMT terminal bridge 均由操作员手动覆盖

TDX 与 QMT bridge 都是终端内已注册脚本，其实际加载版本不由 datasource 文件同步或 deploy/recovery workflow 推断。每次 bridge contract 或实现发生变化，操作员必须分别在终端侧手动覆盖匹配版本、记录 SHA-256，并让对应终端重新加载。自动化只验证 installed artifact、owner/build identity 和运行结果，不复制、注册、删除或隐式升级任一 terminal bridge。

### TDX/QMT 生产默认 builtin，但 activation 仍受发布 gate 约束

两源代码与部署正式值均为 `builtin|off`，缺失值默认解析为 `builtin`；`off` 仅用于 operator 对单源执行整体链路回滚。`off` 时对应 datasource realtime route、backend client/module 与 monitoring probe 同步停用，但历史 HTTP API 保持可用。HIL 前不修改生产主机 effective state，只有双源 contract/HIL/rollback/protected digest 通过后才发布新版本并让默认值生效。

### 共同 freshness 不等于共同采集机制

持久化 quality 只描述 frame/provider 事实；disconnect、age 与 transit latency 作为查询时 freshness 动态计算。QMT 的 session polling gate 可保留为 provider 负载控制，正式交易 session 与 candle 边界留给后续 backend product change。

## Risks / Trade-offs

- [Breaking WS cutover 导致短暂断流] → 在维护窗口按 datasource、backend、monitoring 连续发布，并验证 subscription/owner 自动恢复。
- [完整 native object 过大或不可序列化] → terminal HTTP 边界执行 JSON、大小、深度和敏感字段 guard，并用真实 HIL fixture 验证。
- [QMT owner hardening 破坏 Python 3.6 bridge] → 禁用新语法/第三方依赖，执行 compile guard、unit/replay 和 Windows owner restart HIL。
- [metric rename 造成监控盲区] → exporter/watchdog/contracts 同一版本切换，发布前后验证旧 metric 消失且新 metric 完整。
- [生产默认 builtin 在终端冷启动时误报] → owner/snapshot startup grace 后才告警，未订阅与无 owner 分开报告。

## Migration Plan

1. 从六仓库最新 master 建同名集成分支，保持 checkpoint 与 007/008 migration 不进入本 change。
2. 先实现 datasource schema v1、QMT fence/owner safety 与 replay fixture，再实现 backend clients/adapters/ingress。
3. 同步 deploy/monitoring/env/current docs，执行 repository guard：活跃 realtime `experimental|legacy` 命中为零。
4. 本地运行 strict OpenSpec、lint/typecheck/tests/build、Docker build 和跨仓库 fixture SHA。
5. 操作员分别手动覆盖并重新加载精确版本的 TDX/QMT terminal bridge，记录 installed path 与 SHA-256；自动化不得把 datasource checkout 中的同名文件视为已安装版本。
6. Windows 先 TDX `600030.SH`、后 QMT `300502.SZ`，记录 baseline/enabled/post_restart/post_rollback 与 protected-table digest；非交易时段不得声明 freshness。
7. 分别验证 TDX/QMT 整套 `off`/旧版本 rollback 后，在同一维护窗口发布正式组件并将双源 production desired state 设为 `builtin`。

## Open Questions

- 生产数据库的实际 migration 编号须在后续持久化 change 前核验；本 change 不创建或执行 migration。
