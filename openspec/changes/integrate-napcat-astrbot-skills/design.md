# Design: NapCat-AstrBot integration

## Direction

Use AstrBot Skills as the integration layer. Do not route this path through
Saya.

```text
QQ user or group
    |
    v
NapCat
    |
    v
AstrBot container
    |
    | loads and executes
    v
mist-skills
    |
    | HTTP
    v
Mist backend :8001
    |
    +--> MySQL market data
    +--> datasource bridge when collection is needed
```

## Component roles

### NapCat

NapCat owns the QQ protocol connection. It should not contain Mist-specific
market analysis logic.

### AstrBot

AstrBot owns conversation routing and Skill execution. It should load
`mist-skills` from a mounted or configured Skill source.

### mist-skills

`mist-skills` is a thin orchestration layer. Scripts accept agent-friendly
arguments, call the Mist REST API, parse Mist's unified response envelope, and
print JSON for AstrBot.

### Mist backend

Mist remains the system of record for securities, K-line data, indicators, and
Chan Theory analysis. It exposes REST endpoints consumed by `mist-skills`.

### mist-datasource

The datasource bridge remains optional for this first integration. It matters
only when the backend needs to collect or refresh data from TDX, QMT, or other
local SDK-backed sources.

## Runtime topology

### Preferred: shared Docker network

If Mist and AstrBot both run in Docker, place them on the same Docker network.
Configure AstrBot with a service-name URL:

```text
MIST_API_BASE_URL=http://mist:8001
```

This avoids host networking differences across operating systems.

### Alternative: AstrBot container reaches host Mist

If Mist runs on the host machine and AstrBot runs in Docker, configure:

```text
MIST_API_BASE_URL=http://host.docker.internal:8001
```

On Linux hosts, this may require Docker `extra_hosts` configuration.

## API contract to stabilize

### Period values

Current user-facing Skill docs use friendly values such as:

```text
1min, 5min, 15min, 30min, 60min, daily
```

The backend currently uses numeric `Period` enum values internally, for example
`1440` for daily K-lines.

Recommended decision: normalize friendly periods at the backend boundary. That
keeps AstrBot, Skills, and frontend clients readable while preserving the
existing internal enum model.

### Response envelope

`mist-skills` already expects the Mist unified envelope:

```text
{ success, statusCode, message, data, timestamp, path }
```

The shared Skill client should continue to parse `statusCode` for business
errors.

### Chan Theory endpoints

For the AstrBot path, Skill scripts should call the query-style REST endpoints:

```text
POST /chan/merge-k
POST /chan/bi
POST /chan/fenxing
POST /chan/channel
```

Each call should pass code, period, optional date range, and optional source.
The backend should fetch K-line data and run the analysis.

## Initial smoke path

Run the checks from inside the AstrBot container so they prove the real runtime
path:

```text
1. HTTP health:      GET /app/hello
2. Skill config:     print MIST_API_BASE_URL
3. Data discovery:   list_indices.py
4. K-line query:     get_daily_kline.py
5. Indicator query:  macd.py
6. Chan query:       analyze_chan.py
```

Failures should be read in this order:

```text
health fails        -> Docker network or backend process problem
list_indices fails  -> security API or database seed problem
kline fails         -> period/source/data availability problem
indicator fails     -> K-line query or TA-Lib calculation problem
chan fails          -> K-line query or Chan analysis problem
```

## First user experience

The first version should focus on pull-based questions:

```text
List available indices
Get daily K-line data for a code
Calculate MACD/KDJ/RSI for a code and period
Run Chan Theory analysis for a code and period
```

Proactive alerts should be treated as a later phase because they require an
event producer, routing policy, recipient policy, and a send-message mechanism
through AstrBot or NapCat.

## Security and operations

- Configure an allowlist for QQ groups or private chats before exposing the bot
  broadly.
- Avoid putting backend URLs or credentials into Skill source files.
- Prefer environment variables for deployment-specific values.
- Keep failure messages actionable for operators but avoid leaking internal
  stack traces into QQ chat replies.
