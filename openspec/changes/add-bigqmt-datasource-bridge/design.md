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
- Serve QMT historical `1d`, `1m`, and `5m` bars from configured full-QMT local
  DAT files as the first production-capable path.
- Delete legacy QMT adapter/mock/API/realtime-duplex surfaces.
- Keep TDX `:9001` TDX-only.

## Non-Goals

- Normalizing QMT `marketData` into the TDX bar row model inside the QMT datasource.
- Serving QMT realtime quotes through the old adapter-backed realtime route.
- Using realtime duplex as the default QMT internal bridge transport.
- Exposing QMT account or trading APIs.
- Supporting QMT periods beyond `1d`, `1m`, and `5m` in this change.

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
  "dividend_type": "none",
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
      "open": {"20260701": 10.05},
      "close": {"20260701": 10.16},
      "volume": {"20260701": 906890.0},
      "amount": {"20260701": 915838549.0}
    }
  },
  "source": "local_dat"
}
```

`include_raw=true` adds parse evidence under `rawMeta`, including
`period_code`, `record_size`, `header_size`, `struct_format`, `price_scale`,
and `source_path`.

### Local DAT is only historical bars

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

TDX request models no longer contain `provider`, and TDX v1 rejects unknown
fields. TDX `/providers` returns only TDX. A caller that wants QMT history bars
must call QMT `:9002/v1/bars/query`.

### QMT datasource deployment

The QMT datasource service is deployed as an independent Windows WinSW service
(`mist-qmt-datasource`) that starts `qmt.main:app` on `:9002`. The deployment
workflow may install, start, restart, stop, and smoke-test this service.

The workflow must not automate full-QMT strategy script load, registration, or
deletion. Those actions remain manual in the QMT client UI because they depend
on the running full-QMT client environment and operator-selected strategy model.

## Risks

- Local DAT minute layout may differ on real Windows samples. Mitigation:
  keep candidate formats narrow, include raw evidence, and require Windows
  smoke before declaring minute periods production-ready.
- QMT bridge polling frequency may affect QMT script responsiveness.
  Mitigation: keep one serial queue, command timeouts, and runtime health.
- Backend code may still assume `a QMT provider selector` on TDX. Mitigation: schema
  rejection and regression tests.

## Rollout

1. Remove legacy QMT surfaces and TDX provider selection.
2. Add native QMT local DAT bars route and contract tests.
3. Keep HTTP bridge owner/poll/result/health tests.
4. Run Windows smoke with real `1d`, `1m`, and `5m` DAT samples.
5. Design any future realtime QMT feature on top of HTTP polling bridge
   evidence, not the deleted adapter-backed realtime route.
