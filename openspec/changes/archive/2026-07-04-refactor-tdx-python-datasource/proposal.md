# Change: Refactor TDX Python datasource

## Archive Status

Abandoned on 2026-07-04 as superseded by later, narrower datasource/provider
work. This proposal is retained for history only: its broad normalized gateway,
WinSW, backend consumer, and real-time bar goals were split across later work
or replaced by the current accepted WebSocket behavior. No delta specs from this
change were synced into main `openspec/specs/`; future real-time bar promotion
should be proposed as a new focused change.

## Why

The current Mist backend already treats TDX as an external `mist-datasource`
HTTP/WebSocket service, but the TDX boundary is still shaped around provider
specific routes and push snapshots. The new TDX design requires Python to be
the only datasource boundary exposed to NestJS, with normalized HTTP contracts,
a normalized duplex WebSocket bridge for real-time events, and a Windows
service shape that is easier to operate.

## What Changes

- Define a Python datasource gateway as the only TDX surface consumed by NestJS.
- Normalize bars, snapshots, formulas, sectors, subscriptions, health, and raw
  debug calls behind stable `/v1` contracts.
- Keep TongDaXin native HTTP JSON-RPC and `tqcenter.subscribe_hq` inside the
  Python provider implementation.
- Move real-time minute-bar freshness from NestJS WebSocket snapshot aggregation
  to a Python dirty-symbol queue, minute collector, and normalized WebSocket
  bar events.
- Keep subscription intent, durable bar persistence, and product-facing recent
  bar reads in NestJS/MySQL; Python keeps only volatile session state for the
  active TDX bridge process.
- Prepare the same provider interface for later QMT support without changing
  the NestJS-facing contract.
- Replace the datasource Windows service wrapper path with WinSW for the new
  TDX datasource service.
- **BREAKING**: NestJS TDX integration must migrate away from direct use of the
  current `/api/tdx/*` and `/ws/quote/*` datasource shapes to the normalized
  Python datasource API.

## Capabilities

### New Capabilities

- `tdx-python-datasource`: Python-owned TDX datasource API, provider boundary,
  normalized response contracts, duplex WebSocket protocol, subscription
  handling, minute-bar event publishing, and error mapping.
- `tdx-datasource-windows-service`: WinSW-based Windows service packaging,
  configuration, health exposure, logs, and operational smoke tests for the TDX
  datasource.

### Modified Capabilities

No existing OpenSpec capabilities are present in `openspec/specs/`, so this
change introduces new capability specs instead of delta specs.

## Impact

- `mist-datasource` TDX Python service structure, provider interfaces, TDX HTTP
  client, `tqcenter` subscription client, minute collector, WebSocket event
  models, and deployment scripts.
- Mist backend TDX source adapter, WebSocket collection path, environment
  variables, and tests under `apps/mist/src/sources/tdx`,
  `apps/mist/src/collector/strategies`, and `libs/config`.
- Windows Docker/host datasource deployment documentation and service
  expectations, especially where current docs and scripts still refer to
  obsolete appliance or NSSM-managed `MistTDX` paths.
- Operator workflows for starting TongDaXin, checking datasource health,
  syncing subscriptions from NestJS, verifying real-time bar events, and
  restarting the datasource service.
