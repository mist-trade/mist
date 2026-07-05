## Context

TDX and QMT now have different production boundaries:

- TDX is a Python service around the TDX terminal and TDX HTTP/native adapter.
- QMT must run through the full QMT client's built-in Python runtime.

The two providers also expose different historical data shapes. TDX `/v1`
returns normalized row arrays such as `data.bars[]`; QMT `get_market_data_ex`
returns a mapping of stock code to tabular data, whose index is the time series
and whose columns are fields. The datasource should not pretend these are the
same schema.

## Goals

- Make QMT a separate native datasource service on `:9002`.
- Keep QMT bridge code small and safe inside the full-QMT built-in Python
  runtime.
- Serve QMT historical bars through full-QMT native
  `get_market_data_ex(..., subscribe=False)` as the production path.
- Keep local DAT parsing only as fallback/debug evidence.
- Preserve the backend QMT realtime strategy path as existing but unverified
  work; do not count historical bars as realtime validation.
- Keep TDX `:9001` TDX-only.

## Non-Goals

- Normalizing QMT `marketData` into the TDX bar row model inside the QMT datasource.
- Claiming QMT realtime quote collection is verified by this historical bars
  change.
- Using realtime duplex as the default QMT internal bridge transport.
- Exposing QMT account or trading APIs.
- Mixing multiple QMT adjustment types in the same `k` unique key.

## Decisions

### QMT service is native, not provider-neutral

`POST :9002/v1/bars/query` accepts QMT-style snake_case parameters:

```json
{
  "fields": [],
  "stock_list": ["000001.SZ"],
  "period": "1d",
  "start_time": "",
  "end_time": "",
  "count": -1,
  "dividend_type": "front_ratio",
  "fill_data": true,
  "include_raw": false
}
```

The API does not expose `subscribe`; historical bars are fixed to
`subscribe=False` semantics.

Response data is column-oriented:

```json
{
  "marketData": {
    "000001.SZ": {
      "open": { "20260701": 10.05 },
      "close": { "20260701": 10.16 },
      "volume": { "20260701": 906890.0 },
      "amount": { "20260701": 915838549.0 }
    }
  },
  "source": "native_bridge"
}
```

The product path enqueues a bridge command that calls
`ContextInfo.get_market_data_ex(..., subscribe=False)` in the full-QMT runtime.
`include_raw=true` may add native/fallback evidence under `rawMeta`, including
`period_code`, `record_size`, `header_size`, `struct_format`, `price_scale`,
and `source_path`.

### Periods and adjustment are explicit contracts

QMT historical K collection supports `1m`, `3m`, `5m`, `15m`, `30m`, `1h`,
`1d`, `1w`, `1mon`, `1q`, `1hy`, and `1y`. Tick/L2 data is not written into
the Mist K table in this change.

The backend fixes QMT `dividend_type` to `front_ratio` in v1. TDX remains fixed
to `front`. Future support for multiple adjustment口径 requires adding an
adjustment dimension to the `k` unique key first.

### Local DAT is fallback/debug only

The local DAT reader resolves only configured full-QMT paths:

- `QMT_LOCAL_DAT_DIR/SZ/86400/000001.DAT`
- `QMT_LOCAL_DAT_DIR/SZ/60/000001.DAT`
- `QMT_LOCAL_DAT_DIR/SZ/300/000001.DAT`
- SH paths follow the same market/period layout.

Daily DAT parsing uses an 8-byte header and 32-byte records. Even record
indexes are valid; prices are divided by `1000`; volume keeps the native DAT
unit; missing amount is `0`.

Minute DAT parsing uses a small set of controlled candidate layouts with
strict validation for timestamp, OHLC, volume, sorting, and period alignment.
Unsupported layouts fail with structured details instead of guessed data.

The reader blocks after `QMT_LOCAL_DAT_BLOCK_AFTER` (default `18:00`) unless
configuration changes the policy, and it checks file size/mtime stability
before parsing.

### Bridge is stdlib HTTP polling only

The production bridge script inside QMT uses only standard-library HTTP
requests to:

1. Register one owner.
2. Poll for at most one batch of commands.
3. Execute QMT native calls serially.
4. Post results.
5. Report health.

No realtime-duplex endpoint, command loop, thread, subprocess,
worker process, or third-party package dependency is part of the production
bridge.

### TDX is TDX-only

TDX request models do not contain a QMT provider selector. A caller that wants
QMT history bars must call QMT `:9002/v1/bars/query`.

### QMT realtime remains unverified

Mist backend keeps the QMT WebSocket collection strategy path as an existing
stub. This change does not validate QMT realtime subscriptions or payloads;
that requires a separate smoke/test pass.

### QMT datasource deployment

The QMT datasource service is deployed as an independent Windows WinSW service
(`mist-qmt-datasource`) that starts `qmt.main:app` on `:9002`. The deployment
workflow may install, start, restart, stop, and smoke-test this service.

The workflow must not automate full-QMT strategy script load, registration, or
deletion. Those actions remain manual in the QMT client UI because they depend
on the running full-QMT client environment and operator-selected strategy model.

## Risks

- Native QMT field names may differ by period/client version. Mitigation:
  keep response alias handling for `settle`, `settlementPrice`, and
  `settelementPrice`, and record real smoke columns.
- QMT bridge polling frequency may affect QMT script responsiveness.
  Mitigation: keep one serial queue, command timeouts, and runtime health.
- Backend code may still assume `a QMT provider selector` on TDX. Mitigation: schema
  rejection and regression tests.

## Rollout

1. Remove legacy QMT surfaces and TDX provider selection.
2. Add native QMT bars route and backend contract tests.
3. Keep HTTP bridge owner/poll/result/health tests.
4. Run Windows smoke with real QMT `1d`, `1m`, `3m`, `5m`, `15m`, `30m`,
   `1h`, `1w`, `1mon`, `1q`, `1hy`, and `1y` requests.
5. Run a separate QMT realtime smoke before enabling realtime collection.
