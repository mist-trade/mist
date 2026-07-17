# Golden Messages — TDX Experimental Realtime (v0, draftRevision=1)

These are authoritative examples for contract testing. Both datasource and
Mist MUST accept/reject exactly as specified.

## Normal snapshot (clean)

```json
{
  "payloadType": "tdx.realtime.snapshot",
  "schemaVersion": 0,
  "draftRevision": 1,
  "contractStatus": "experimental",
  "acquisitionProfile": "tdx.get_market_snapshot",
  "streamEpoch": "owner-abc-generation-3",
  "sequence": 42,
  "symbol": "600519.SH",
  "capturedAt": "2026-07-16T14:30:01.234+08:00",
  "eventTime": "2026-07-16T14:30:00.000+08:00",
  "snapshot": {
    "last": 1685.0,
    "open": 1670.0,
    "high": 1690.0,
    "low": 1665.0,
    "lastClose": 1672.5,
    "nativeVolume": 12345600,
    "nativeAmount": 20800000000
  },
  "unitStatus": "native-unverified",
  "quality": {}
}
```

## Partial prices (some OHLC missing → null)

```json
{
  "payloadType": "tdx.realtime.snapshot",
  "schemaVersion": 0,
  "draftRevision": 1,
  "contractStatus": "experimental",
  "acquisitionProfile": "tdx.get_market_snapshot",
  "streamEpoch": "owner-abc-generation-3",
  "sequence": 43,
  "symbol": "600519.SH",
  "capturedAt": "2026-07-16T14:30:02.000+08:00",
  "eventTime": null,
  "snapshot": {
    "last": 1685.5,
    "open": 1670.0,
    "high": null,
    "low": null,
    "lastClose": 1672.5,
    "nativeVolume": null,
    "nativeAmount": null
  },
  "unitStatus": "native-unverified",
  "quality": { "partialPrices": true, "nativeTimeUnavailable": true }
}
```

## Reject cases (Mist MUST drop, never store)

### last is missing → reject (not filled with 0)

`snapshot` has no `last` field → schema validation fails → drop.

### last is NaN / Infinity / boolean → reject

`"last": "NaN"` (string) or `"last": true` → finite check fails → drop.

### streamEpoch mismatch → drop (do NOT implicitly switch epoch)

Snapshot carries `streamEpoch` different from the store's `currentEpoch`, and
no `stream_started`/`ready` was received for the new epoch → drop, count as
`epochMismatch`.

### sequence duplicate or out-of-order → drop

`sequence <= lastSequence` for the same `(instrumentKey, streamEpoch)` → drop,
count as `duplicate` or `outOfOrder`.

### contract tuple mismatch → reject subscription

`payloadType`/`schemaVersion`/`draftRevision`/`acquisitionProfile` does not
exactly match the Mist build's accepted tuple → do not enter subscription
state, record stable error + metric.

### symbol not in allowlist → drop

`symbol` does not case-sensitively match an allowlist entry → drop, count as
`symbolNotAuthorized`.

## Control-plane: stream_started (owner generation changed)

```json
{
  "type": "stream_started",
  "data": {
    "streamEpoch": "owner-def-generation-4",
    "generation": 4,
    "mode": "builtin_experimental"
  }
}
```

`generation` is a REQUIRED positive integer (monotonically increasing). The
Mist client MUST reject `stream_started` with missing, non-integer, or
non-positive `generation`, and MUST reject any `generation <= lastGeneration`.

Already-connected clients receive this when the terminal owner generation
changes. The Mist store invalidates the old epoch before accepting new
snapshots.

## Control-plane: ready (late-connect / reconnect epoch recovery)

```json
{
  "type": "ready",
  "data": {
    "mode": "builtin_experimental",
    "payloadType": "tdx.realtime.snapshot",
    "schemaVersion": 0,
    "draftRevision": 1,
    "acquisitionProfile": "tdx.get_market_snapshot",
    "currentStreamEpoch": "owner-def-generation-4",
    "currentGeneration": 4,
    "datasourceBuildId": "mist-datasource@sha-abc123",
    "bridgeBuildId": "mist-tdx-bridge@sha-def456"
  }
}
```

`currentGeneration` is a REQUIRED positive integer (or `null` when no owner is
active). When non-null, the client MUST initialize `lastGeneration` to this
value as the monotonicity baseline.

Late-connecting or reconnecting clients recover the current epoch via `ready`.
`currentStreamEpoch` may be `null` if no owner is active. Snapshots never
implicitly switch epoch — only `stream_started`/`ready` do.

## Owner registration (terminal → gateway, loopback HTTP)

Request `POST /tdx/bridge/owner`:

```json
{
  "ownerId": "tdx-bridge-pid-12345",
  "mode": "builtin_experimental",
  "bridgeBuildId": "mist-tdx-bridge@sha-def456",
  "bridgeArtifactSha256": "9f2c...",
  "acquisitionProfile": "tdx.get_market_snapshot",
  "schemaVersion": 0,
  "draftRevision": 1
}
```

Response:

```json
{
  "leaseToken": "lease-opaque-token",
  "streamEpoch": "owner-abc-generation-3",
  "acceptedContractTuple": {
    "payloadType": "tdx.realtime.snapshot",
    "schemaVersion": 0,
    "draftRevision": 1,
    "acquisitionProfile": "tdx.get_market_snapshot"
  }
}
```

Subsequent `poll`/`result`/`snapshot` MUST carry `leaseToken` + `streamEpoch`.
The lease token MUST NOT appear in logs or health responses.
