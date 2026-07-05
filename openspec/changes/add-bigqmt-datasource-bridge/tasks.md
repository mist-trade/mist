## 1. OpenSpec And Documentation

- [x] 1.1 Update proposal/design/specs to QMT native service shape.
- [x] 1.2 Document that TDX `:9001` no longer accepts QMT provider requests.
- [x] 1.3 Document QMT `:9002/v1/bars/query` native `marketData` response.
- [x] 1.4 Remove bridge realtime-duplex spike requirements from this change.

## 2. Legacy QMT Removal

- [x] 2.1 Delete legacy QMT route groups.
- [x] 2.2 Delete adapter-backed QMT realtime quote route.
- [x] 2.3 Delete QMT bridge realtime endpoint and command-loop tests.
- [x] 2.4 Delete QMT mock adapter, QMT adapter protocol, and QMT adapter factory.
- [x] 2.5 Add guardrails for removed QMT legacy surfaces.

## 3. Native QMT Bars

- [x] 3.1 Add QMT native `POST :9002/v1/bars/query`.
- [x] 3.2 Accept only official snake_case request fields:
  `fields`, `stock_list`, `period`, `start_time`, `end_time`, `count`,
  `dividend_type`, `fill_data`, and `include_raw`.
- [x] 3.3 Keep historical semantics fixed to `subscribe=False`.
- [x] 3.4 Return `data.marketData` column shape with `source=local_dat`.
- [x] 3.5 Keep QMT volume in native DAT units.
- [x] 3.6 Add `include_raw=true` parse evidence.
- [x] 3.7 Add unit and integration tests for daily/minute DAT parsing,
  field filtering, count, time filtering, block window, unstable/missing/error
  envelopes, and unsupported request shape.

## 4. TDX Cleanup

- [x] 4.1 Remove `provider` from TDX v1 request models.
- [x] 4.2 Reject TDX v1 requests with `provider` as an extra field.
- [x] 4.3 Remove QMT provider state and branches from TDX routes/main.
- [x] 4.4 Make TDX `/providers` return TDX only.
- [x] 4.5 Keep TDX `/ws/quote/{client_id}` behavior unchanged.

## 5. HTTP Polling Bridge

- [x] 5.1 Keep HTTP owner/poll/result/health endpoints.
- [x] 5.2 Keep single-owner command gateway and serial queue tests.
- [x] 5.3 Ensure built-in production bridge uses stdlib HTTP polling only.
- [x] 5.4 Update built-in bridge command payloads to QMT snake_case fields.

## 6. Windows Deployment

- [x] 6.1 Add independent QMT WinSW service installer and smoke script.
- [x] 6.2 Add independent QMT datasource deployment workflow and manager.
- [x] 6.3 Keep full-QMT strategy script load/register/delete manual.

## 7. Verification

- [x] 7.1 Run `openspec validate add-bigqmt-datasource-bridge --strict`.
- [x] 7.2 Run datasource unit/integration regression tests.
- [x] 7.3 Run guardrail scans for removed QMT legacy strings.
- [ ] 7.4 Run Windows smoke against real full-QMT `1d`, `1m`, and `5m` DAT
  files and record minute-format evidence.
