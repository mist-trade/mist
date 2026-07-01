## Context

The current TDX streaming path receives datasource WebSocket `quote` events and maps the payload into `TdxSnapshot`. That snapshot currently exposes `stockCode` plus a small normalized subset used by `KCandleAggregator`. Official TDX `get_market_snapshot` returns additional fields such as `NowVol`, bid/ask ladders, inside/outside volume, average price, and speed metrics. Those fields are useful for real-time calculation and pass-through, but they are not part of the provider-neutral K-line table.

The current security identity contract already separates internal canonical `Security.code` from provider transport `SecuritySourceConfig.formatCode`. Streaming snapshots should follow that same naming and remove `stockCode`.

## Goals / Non-Goals

**Goals:**

- Represent each backend TDX snapshot with canonical `code`, provider `formatCode`, normalized price/volume fields, and complete `raw` provider snapshot payload.
- Preserve all official provider snapshot fields available from the datasource quote payload.
- Keep K aggregation deterministic: `now` drives OHLC, cumulative `volume` and `amount` drive deltas, and `timestamp` selects the period bucket.
- Keep completed K-line persistence limited to OHLCV/amount.
- Update tests so `stockCode` cannot re-enter the streaming snapshot contract silently.

**Non-Goals:**

- Do not persist raw snapshot JSON into the K table or TDX K extension table.
- Do not build a public query API for current in-memory snapshots in this change.
- Do not change datasource subscription mechanics or refresh-cache behavior.
- Do not redesign `SecurityService.formatCode`; this change only consumes the existing canonicalization utility at the streaming boundary.

## Decisions

1. **Use `code` and `formatCode`, not `stockCode`.**

   `code` is the backend canonical security identity used for lookup, aggregation keys, and downstream persistence. `formatCode` is the provider transport symbol received from or sent to TDX. This matches the existing `Security.code` and `SecuritySourceConfig.formatCode` contract and avoids a third identity term.

   Alternative considered: keep `stockCode` as a compatibility alias. Rejected because the user explicitly wants `stockCode` deleted, and keeping it would make future QMT integration ambiguous.

2. **Store raw snapshot data on `TdxSnapshot`, not in `KCandleAggregator`.**

   The raw payload is the latest provider snapshot for pass-through or future in-memory calculation. Aggregation logic only needs stable normalized fields, so raw data does not belong in completed candles.

   Alternative considered: copy raw onto in-progress candles. Rejected for this change because raw does not affect K output and there is not yet an external partial-K read API.

3. **Aggregate only normalized fields.**

   `KCandleAggregator` uses `code` for keys, `timestamp` for period assignment, `now` for OHLC, and deltas of cumulative `volume`/`amount` for K volume and amount. Official snapshot fields such as bid/ask ladders, `NowVol`, `Inside`, `Outside`, `Average`, and `Zangsu` remain in `raw` and do not participate in K aggregation.

   Alternative considered: define per-field aggregation for raw fields. Rejected because the fields have mixed semantics and no current persisted owner.

4. **Completed K callbacks remain raw-free.**

   `TdxWebSocketService` converts completed candles to `TdxResponse` without raw or extensions, and `WebSocketCollectionStrategy` persists only OHLCV/amount. Raw snapshot fields are not opaque K data.

## Risks / Trade-offs

- Raw payload shape is provider-specific -> Keep it behind the TDX snapshot type and do not store it in provider-neutral K entities.
- Removing `stockCode` can break stale callers/tests -> Update all backend callers and tests in the same change; TypeScript should catch remaining references.
- Datasource raw field casing can vary -> Preserve the original raw object as received while normalized readers continue accepting known casing variants for core fields.
- Future consumers may need latest raw snapshots -> This change preserves the data in the event object; a later change can add a bounded in-memory cache or query API once the consumer boundary is clear.
