# native-terminal-visualization Specification

## Purpose
Define the three-layer architecture, visual command protocol (`libs/visual-command`), terminal render bridge contracts, and web gateway specifications for native QMT/TDX trading terminal visualization.

## Requirements

### Requirement: Business Domain Pure Separation
The system SHALL keep `libs/chancore`, `libs/indicators`, and backtest/trading execution engines 100% focused on mathematical calculation, state-machine evolution, and order matching, without visual styling, color codes, or terminal drawing dependencies. The standalone `libs/visual-command` library SHALL convert domain models into standard primitives (`line`, `band`, `text`, `icon`).

#### Scenario: Visual commands generated from domain models
- **WHEN** a client bridge requests visual commands via `GET /v1/visual/commands` with `code`, `period`, `source`, and `layers`
- **THEN** the response MUST contain a flattened array of `VisualCommand` objects
- **AND** the transformation and serialization MUST complete within `50ms`

### Requirement: Dumb Render Bridges For Native Terminals
Client-side render bridges in QMT Python scripts or TDX integrations SHALL NOT perform Chan mathematics or visual command derivations. They SHALL map standard visual primitives directly to native terminal drawing APIs:
- QMT: `line` to `paint(draw_type=0)`, `band` to `paint(draw_type=0/4)`, `text` to `paint(draw_type=3)`
- TDX: `line` to `DRAWLINE`, `band` to `STICKLINE`, `text` to `DRAWTEXT`

#### Scenario: Native bridge receives visual commands
- **WHEN** the bridge receives visual commands from the gateway
- **THEN** it MUST execute native draw calls directly without recalculating geometry or mutating domain state

### Requirement: Web Gateway And Admin Console Separation
The web console (`mist-fe`) SHALL function as an operations management interface. The `mist-web-gateway` reverse proxy SHALL expose port 80 routing `/` to `mist-fe:3000`, `/api/mist/` to backend, and `/api/chan/` to Chan API.

#### Scenario: Routing requests through the web gateway
- **WHEN** requests arrive at `mist-web-gateway:80`
- **THEN** requests MUST be reverse-proxied to their corresponding upstream services according to standard routing paths

### Requirement: Trading-Hour Deployment Safety Invariant
The deployment system SHALL NOT execute code deployment or container modifications during active trading hours (Asia/Shanghai 09:15 ~ 15:05).

#### Scenario: Deployment attempt during trading hours
- **WHEN** a deployment is initiated between 09:15 and 15:05 on a trading day
- **THEN** the deployment guard MUST block the operation
- **AND** all deployment changes MUST be deferred until after 15:05
