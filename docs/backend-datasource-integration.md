# Backend 与 Datasource 集成

Mist backend 只通过产品接口连接独立的 TDX/QMT datasource。终端内置 bridge 的
HTTP 路由是运行时内部通道，不是 backend 的行情 API。

## 配置

| 变量 | 当前含义 |
|---|---|
| `TDX_BASE_URL` | TDX datasource HTTP 地址；Docker 生产值为 `http://host.docker.internal:9001` |
| `QMT_BASE_URL` | QMT datasource HTTP 地址；Docker 生产值为 `http://host.docker.internal:9002` |
| `TDX_WS_CLIENT_ID` | TDX realtime backend leader client id |
| `QMT_WS_CLIENT_ID` | QMT realtime client id；仅在 QMT realtime mode 启用时使用 |

`DEFAULT_DATA_SOURCE` 接受 `ef`、`tdx` 或 `qmt`。TDX 与 QMT 是两个独立服务，
TDX request 不接受 `provider=qmt`。

## 历史数据链路

### TDX

```text
Mist backend
  -> POST :9001/v1/bars/query
  -> TdxHttpClient
  -> official POST :17709 get_market_data
  -> normalized data.bars[]
```

`TdxSource.fetchK` 发送 `symbols`、`period`、`startTime`、`endTime`、`fields`、
`dividendType=front` 和 `fillData=true`。Backend 将基础字段写入 `k`，将 TDX
扩展字段写入 `k_extensions_tdx`。

### QMT

```text
Mist backend
  -> POST :9002/v1/bars/query
  -> QMT command gateway
  -> full-QMT builtin Python get_market_data_ex(..., subscribe=False)
  -> native data.marketData[symbol][field][stime]
```

QMT 请求保持官方 snake_case：`fields`、`stock_list`、`period`、`start_time`、
`end_time`、`count`、`dividend_type=front_ratio`、`fill_data`、`include_raw`。
Datasource 不读取 DAT、不依赖 MiniQMT、`xtquant` 或外部 QMT SDK。Backend 在自身
边界把 column shape 转成 `QmtResponse[]`，基础字段写入 `k`，扩展字段写入
`k_extensions_qmt`。

TDX 与 QMT 的字段、复权和 native shape 天生不同；统一业务模型发生在 backend，
datasource 不强迫两个 provider 返回相同原生结构。

## 实时链路

### TDX

```text
TDX builtin script
  -> loopback /tdx/bridge/owner|poll|result|snapshot
  -> datasource /ws/tdx-experimental/{client_id}
  -> ExperimentalTdxRealtimeClient (backend leader)
  -> bounded in-memory diagnostics/callbacks
```

TDX realtime 没有 legacy mode switch。Builtin bridge 使用官方
`get_market_snapshot`，不使用 QMT 的 `get_full_tick`。Backend leader 在连接、
`ready` 和重连时发送完整 `sync_subscriptions`；普通 WebSocket 客户端不得修改生产
订阅。

### QMT

```text
QMT builtin script stdlib HTTP polling
  -> QMT command gateway / native get_full_tick
  -> mode-gated /ws/qmt-experimental/{client_id}
  -> ExperimentalQmtRealtimeClient
  -> bounded in-memory diagnostics/callbacks
```

QMT realtime 默认 `off`。`off` 时 realtime route 与 metric 不存在是 fail-closed
预期，但 `/health`、`/v1/bars/query` 和 `/qmt/bridge/*` 继续工作。

## 当前持久化边界

已验收的是 realtime transport HIL。Realtime snapshot 当前保持 memory-only：

- 不写最新快照表；
- 不由 realtime client 合成或写入 1 分钟 K；
- 不触发 strategy signal/notification context；
- 不修改 `k`、`k_extensions_*`、`strategy_signals` 或
  `strategy_alert_events`。

这些能力属于后续 Theme B，不能因为 transport 通过就声明已经完成。

## 验证

```bash
env TZ=UTC pnpm run test:ci
pnpm run typecheck
pnpm run ci:contracts
openspec validate --all --strict
```

Windows 与 Mac 生产验证使用
[`production-baseline-verification.md`](production-baseline-verification.md)。
