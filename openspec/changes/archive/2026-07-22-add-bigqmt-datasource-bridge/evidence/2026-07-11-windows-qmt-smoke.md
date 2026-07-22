# Windows full-QMT native smoke evidence — 2026-07-11

## Result

- History gate (`7.4`): **complete**.
- Realtime gate (`7.5`): **not complete**. The run occurred outside a market
  trading session, so `get_full_tick` was intentionally skipped.
- GitHub Actions run:
  [29130187251](https://github.com/mist-trade/mist-deploy/actions/runs/29130187251)
- Workflow ref and SHA: `mist-deploy@master`,
  `bd6b2b0721c336345bc0396d62541ea41cf4c63d`.
- Runner job result: success in 54 seconds.

## Preflight

The Mac-side wrapper and workflow contract checks passed before dispatch:

```text
pwsh-preview -NoLogo -NoProfile -File scripts/test-qmt-runtime-smoke.ps1
QMT runtime smoke wrapper tests passed.

pwsh-preview -NoLogo -NoProfile -File scripts/test-workflow-config.ps1
QMT datasource workflow config tests passed.
```

The `mist-deploy` worktree remained clean.

## Native history matrix

The workflow queried `http://127.0.0.1:9002` with stock `000001.SZ`,
`count=2`, `dividend_type=none`, `fill_data=true`, and the real full-QMT bridge.
Every required period returned `ok=true`, `source=bridge`, 12 default fields,
and two rows.

| Period | Rows | First index | Representative native sample |
| --- | ---: | --- | --- |
| `1d` | 2 | `20260709` | `amount=0.0`, `close=10.58` |
| `1m` | 2 | `20260710145900` | `amount=0.0`, `close=10.53` |
| `3m` | 2 | `20260710145700` | `amount=0.0`, `close=10.53` |
| `5m` | 2 | `20260710145500` | `amount=0.0`, `close=10.51` |
| `15m` | 2 | `20260710144500` | `amount=0.0`, `close=10.51` |
| `30m` | 2 | `20260710143000` | `amount=0.0`, `close=10.51` |
| `1h` | 2 | `20260710140000` | `amount=0.0`, `close=10.51` |
| `1w` | 2 | `20260705` | `amount=5100882740.0`, `close=10.29` |
| `1mon` | 2 | `20260630` | `amount=26553616123.0`, `close=10.05` |
| `1q` | 2 | `20260630` | `amount=66641699374.0`, `close=10.05` |
| `1hy` | 2 | `20260630` | `amount=123200750460.0`, `close=10.05` |
| `1y` | 2 | `20251231` | `amount=315956232636.0`, `close=11.41` |

The default field set was:

```text
amount, close, high, low, open, openInterest, preClose, settelementPrice,
stime, suspendFlag, time, volume
```

## Field and unit evidence

The explicit official-field probes also succeeded:

- `1d` and `1m`: `time`, `open`, `high`, `low`, `close`, `volume`, `amount`,
  `settle`, `openInterest`, `preClose`, `suspendFlag`.
- `tick`: `time`, `lastPrice`, `lastClose`, `open`, `high`, `low`, `close`,
  `volume`, `amount`, `settle`, `openInterest`, `stockStatus`.

The response confirms the native QMT representation retained by this change:

- `time` is an epoch-millisecond number in official-field responses, for
  example `1783526400000` for the daily probe.
- OHLC and tick prices are native decimal quote values, for example `10.58`.
- `volume` and `amount` are returned as native QMT fields without normalization;
  the period matrix above records representative native `amount` values.
- Daily/weekly/monthly indexes use QMT date keys, while minute indexes use QMT
  timestamp keys.

## Bridge and realtime disposition

The same run proved that the manual full-QMT strategy bridge was registered and
could execute non-realtime commands:

```text
[OK] GET /qmt/bridge/health ownerId=bigqmt-39928
[OK] bridge command health completed
[OK] bridge command get_market_data_ex completed
[OK] bridge command get_stock_list_in_sector completed
```

Realtime was not exercised:

```text
[OK] Skipping get_full_tick outside market trading session
```

Therefore task `7.5` remains open and realtime collection remains disabled or
explicitly unverified until a trading-session smoke is recorded.

## History revalidation — 2026-07-14

Task `7.4` was rerun against the real Windows full-QMT runtime without a
datasource restart. GitHub Actions run
[29307560313](https://github.com/mist-trade/mist-deploy/actions/runs/29307560313)
completed successfully in 46 seconds on `mist-api-windows-01` using
`mist-deploy@bd6b2b0721c336345bc0396d62541ea41cf4c63d`.

The run requested `000001.SZ`, `count=2`, and covered
`1d/1m/3m/5m/15m/30m/1h/1w/1mon/1q/1hy/1y`. Every period returned
`ok=true`, `source=bridge`, 12 native fields, and two rows. Representative
fresh indexes included `20260713` for `1d`, `20260714130400` for `1m`, and
`20260714113000` for `5m`.

The official-field probes for `1d`, `1m`, and `tick` also returned successfully.
Bridge health reported `ownerId=bigqmt-8988`, and the `health`,
`get_market_data_ex`, and `get_stock_list_in_sector` bridge commands completed.
`get_full_tick` was explicitly disabled in this history-only revalidation, so
the separate realtime task `7.5` remains unchanged.
