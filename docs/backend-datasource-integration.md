# Backend Datasource Integration

Mist backend consumes Python datasource services through product routes. Raw
provider/debug routes stay outside backend collection code.

## Configuration

- `TDX_BASE_URL`: TDX datasource HTTP base URL, usually
  `http://127.0.0.1:9001`.
- `TDX_WS_CLIENT_ID`: backend client id for TDX `/ws/quote/{client_id}`.
- `QMT_BASE_URL`: QMT datasource HTTP base URL, usually
  `http://127.0.0.1:9002`.
- `QMT_WS_CLIENT_ID`: reserved QMT realtime client id. The backend keeps the
  QMT realtime strategy path, but it has not been smoke-tested yet.

`DEFAULT_DATA_SOURCE` accepts `ef`, `tdx`, or `qmt` and enum keys
`EAST_MONEY`, `TDX`, or `QMT`. Old QMT aliases are no longer valid backend
datasource names.

## TDX Historical Bars

`TdxSource.fetchK` posts to `${TDX_BASE_URL}/v1/bars/query` with:

- `symbols`: provider format codes such as `600519.SH`
- `period`: mapped TDX period such as `1m`, `5m`, `1h`, `1d`
- `startTime` / `endTime`: ISO timestamps
- `fields`: `Open`, `High`, `Low`, `Close`, `Volume`, `Amount`,
  `ForwardFactor`, `VolInStock`
- `dividendType`: fixed to `front`
- `fillData`: `true`

The datasource returns normalized `data.bars[]`; backend maps those rows to
`TdxResponse[]`, persists base K rows with `source='tdx'`, and stores TDX-only
extension fields in `k_extensions_tdx`.

## QMT Historical Bars

`QmtSource.fetchK` posts to `${QMT_BASE_URL}/v1/bars/query` with QMT snake_case
fields:

- `fields`: `open`, `high`, `low`, `close`, `volume`, `amount`, `time`,
  `stime`, `preClose`, `openInterest`, `suspendFlag`, `settle`
- `stock_list`: provider format codes such as `600519.SH`
- `period`: mapped QMT period, one of `1m`, `3m`, `5m`, `15m`, `30m`, `1h`,
  `1d`, `1w`, `1mon`, `1q`, `1hy`, `1y`
- `start_time` / `end_time`: `yyyyMMddHHmmss` for minute periods and
  `yyyyMMdd` for daily and above
- `count`: `-1`
- `dividend_type`: fixed to `front_ratio`
- `fill_data`: `true`
- `include_raw`: `false`

The QMT datasource path is native `get_market_data_ex(..., subscribe=False)`.
It has no DAT reader, filesystem fallback, or QMT data-directory setting.

The datasource returns column-oriented `data.marketData[symbol][field][stime]`.
Backend converts this to `QmtResponse[]`, persists base K rows with
`source='qmt'`, and stores QMT-only extension fields in `k_extensions_qmt`:
`fullCode`, `preClose`, `suspendFlag`, `openInterest`, `settle`,
`effectiveDividendType`, and `nativePeriod`.

TDX and QMT adjustment data must not be mixed under the same source contract.
The current v1 contract is fixed at TDX `front` and QMT `front_ratio`. If the
product later needs multiple adjustment types side by side, the `k` unique key
must first gain an adjustment dimension.

## Streaming Path

TDX realtime is the verified streaming path. `TdxWebSocketService` connects to
`${TDX_BASE_URL}/ws/quote/{client_id}` and resyncs desired subscriptions on
socket open, datasource `ready`, and reconnect.

QMT realtime is still counted as an existing backend strategy path, but it is
currently an unverified stub. Historical QMT bars work does not validate or
remove this realtime chain.

## Verification

Run focused backend tests with Watchman disabled:

```bash
CI=true ./node_modules/.bin/jest apps/mist/src/sources/tdx/tdx-source.service.spec.ts apps/mist/src/sources/qmt/qmt-source.service.spec.ts apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts --runInBand --watchman=false
```

For full backend verification, run:

```bash
pnpm run typecheck
pnpm run test:ci
pnpm run ci:contracts
```
