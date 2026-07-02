## Why

The review identified a cross-repo WebSocket contract split: TDX and QMT emit
different pong, error, subscription, and quote payload shapes, while the
backend compensates with broad parsing. This should be aligned before QMT
streaming or old datasource routes expand the compatibility surface.

## What Changes

- Select review IDs CODE_REVIEW C5, H4, H5 and CODE_SMELL D2.2, R2.1, P2.1,
  P2.2, M2.2, U2.1, U2.3, O2.1.
- Make datasource WebSocket server responses use one `WSMessage` envelope for
  ready, pong, subscribed, unsubscribed, error, and quote events.
- Make TDX and QMT error payloads expose the same machine-readable
  `error.code`, `error.message`, `error.retryable`, and `error.details`
  structure.
- Keep TDX quote streaming snapshot-only, but publish snapshot payloads through
  one serializer instead of hand-mapping fields in the route or app entrypoint.
- Add route-contract tests covering pong timestamps, error envelopes,
  subscription acknowledgements, and snapshot quote payloads.
- Plan the old-route migration around normalized `/v1` routes without adding a
  broad provider ABC or changing the host-side datasource deployment boundary.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-datasource-integration`: tighten datasource WebSocket protocol
  requirements and document the `/v1` route migration boundary.

## Impact

- Affected repositories:
  - `mist-datasource`
  - `mist`
- Affected code areas:
  - `mist-datasource/src/ws/protocol.py`
  - `mist-datasource/tdx/routes/ws.py`
  - `mist-datasource/qmt/routes/ws.py`
  - `mist-datasource/tdx/main.py`
  - datasource WS protocol and route tests
  - `mist/apps/mist/src/sources/tdx/tdx-websocket.service.ts`
  - backend WS contract tests
- Runtime topology impact:
  - No deployment topology change. The Python datasource remains the host-side
    WinSW service and backend containers continue to connect through the
    configured datasource URL.
