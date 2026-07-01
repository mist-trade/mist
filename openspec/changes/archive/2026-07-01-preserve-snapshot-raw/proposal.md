## Why

TDX snapshot streaming now relies on `get_market_snapshot`, whose official return shape contains more fields than the backend currently normalizes for K-line aggregation. The backend must preserve the full raw snapshot for real-time calculation and pass-through while keeping K-line aggregation and persistence limited to stable OHLCV/amount fields.

The recent `Security.code`/`SecuritySourceConfig.formatCode` cleanup also means the streaming snapshot model should stop introducing a third `stockCode` identity name.

## What Changes

- **BREAKING**: Remove `stockCode` from the backend `TdxSnapshot` shape.
- Add `code` to `TdxSnapshot` for the canonical internal security code.
- Add `formatCode` to `TdxSnapshot` for the provider transport symbol returned by or sent to TDX.
- Add `raw` to `TdxSnapshot` to preserve the full provider snapshot payload.
- Keep K-line aggregation based only on normalized snapshot fields:
  `now`, `volume`, `amount`, and `timestamp`.
- Keep completed streaming K-line persistence limited to OHLCV/amount in the base K table; raw snapshot fields must not be persisted as opaque K data.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `backend-datasource-integration`: snapshot query and WebSocket quote handling must expose `code`, `formatCode`, and raw provider snapshot data while aggregating only normalized fields.
- `security-code-identity`: streaming snapshot identity must use canonical `code` internally and provider `formatCode` externally, without `stockCode`.

## Impact

- Backend TDX snapshot types and parsers.
- TDX WebSocket quote handling and K-line aggregation inputs.
- TDX HTTP snapshot mapping.
- Unit tests around snapshot mapping, quote handling, aggregation, and persistence boundaries.
