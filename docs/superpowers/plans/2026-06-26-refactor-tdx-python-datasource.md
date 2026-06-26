# Refactor TDX Python Datasource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended, when explicit subagent delegation is approved) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the OpenSpec change `refactor-tdx-python-datasource` so TDX data reaches NestJS through normalized Python HTTP contracts and normalized WebSocket bar events.

**Architecture:** `mist-datasource` owns the Windows-only TDX boundary: native TDX HTTP JSON-RPC, `tqcenter.subscribe_hq`, dirty-symbol tracking, recent-bar collection, and outbound WebSocket events. NestJS owns durable subscription intent, K-line persistence in MySQL, product-facing recent-bar reads, and reconnect resync via `sync_subscriptions`. No Python-owned durable database is introduced for TDX bars or subscription state.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, httpx, pytest, pytest-asyncio, NestJS 10, TypeScript, Jest, ws, TypeORM.

---

## OpenSpec Inputs

- `openspec/changes/refactor-tdx-python-datasource/proposal.md`
- `openspec/changes/refactor-tdx-python-datasource/design.md`
- `openspec/changes/refactor-tdx-python-datasource/specs/tdx-python-datasource/spec.md`
- `openspec/changes/refactor-tdx-python-datasource/specs/tdx-datasource-windows-service/spec.md`
- `openspec/changes/refactor-tdx-python-datasource/tasks.md`

## Fixed Decisions For This Plan

- Keep `DATASOURCE_PORT` / TDX service default at `9001` for migration compatibility.
- Keep `/ws/quote/{client_id}` as the first normalized WebSocket route, while preserving old `ping`, `subscribe`, `unsubscribe`, and `quote` compatibility until NestJS is migrated.
- Treat one NestJS client as the authoritative subscription command owner. Additional clients may connect and receive events, but `sync_subscriptions`, `subscribe`, and `unsubscribe` commands from non-owner clients return `DATASOURCE_WS_NOT_LEADER` until the owner disconnects.
- Implement `TdxSubscriptionClient` as a thin owner of subscription runtime state that calls the current adapter's `subscribe_hq` / `unsubscribe_hq`; do not create a second `tq.initialize` path.
- Implement `TdxHttpClient` for native TDX HTTP JSON-RPC and use it in the normalized provider. Unit tests use fake transports; live validation is a separate Windows smoke step.
- Do not add SQLite, `DATASOURCE_DB`, `cacheDbWritable`, or required `/v1/bars/latest`.

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `../mist-datasource/src/datasource/__init__.py` | Datasource contract package marker |
| Create | `../mist-datasource/src/datasource/contracts.py` | Response envelope, metadata, stable errors |
| Create | `../mist-datasource/src/datasource/tdx_models.py` | TDX normalized request, response, and WebSocket models |
| Create | `../mist-datasource/src/datasource/tdx_normalization.py` | Symbol, datetime, numeric, bar, snapshot normalization |
| Create | `../mist-datasource/src/datasource/tdx_http_client.py` | Native TDX HTTP JSON-RPC client |
| Create | `../mist-datasource/src/datasource/tdx_provider.py` | Normalized provider methods for bars, snapshots, sectors, formulas, raw calls, health |
| Create | `../mist-datasource/src/datasource/tdx_bridge.py` | WebSocket bridge state, leader ownership, queues, subscription reconciliation |
| Create | `../mist-datasource/src/datasource/tdx_subscription.py` | Callback-safe subscription client wrapper |
| Create | `../mist-datasource/src/datasource/tdx_collector.py` | Dirty-symbol recent-bar collector and duplicate suppression |
| Create | `../mist-datasource/tdx/routes/v1.py` | Normalized `/v1` HTTP routes |
| Modify | `../mist-datasource/tdx/routes/ws.py` | Support normalized bridge messages on existing WebSocket route |
| Modify | `../mist-datasource/tdx/main.py` | Initialize provider, bridge, collector, and v1 router |
| Modify | `../mist-datasource/src/core/config.py` | Add TDX HTTP, collector, queue, and limit settings |
| Modify | `../mist-datasource/src/ws/protocol.py` | Expand protocol literals or delegate to new bridge message models |
| Modify | `../mist-datasource/src/adapter/mock/tdx_mock.py` | Add deterministic callback and recent-bar behavior for tests |
| Create | `../mist-datasource/tests/unit/test_tdx_contracts.py` | Envelope and error tests |
| Create | `../mist-datasource/tests/unit/test_tdx_normalization.py` | Normalization tests |
| Create | `../mist-datasource/tests/unit/test_tdx_http_client.py` | JSON-RPC client tests |
| Create | `../mist-datasource/tests/unit/test_tdx_provider.py` | Provider mapping and error tests |
| Create | `../mist-datasource/tests/unit/test_tdx_bridge.py` | Bridge, leader, reconciliation, queue tests |
| Create | `../mist-datasource/tests/unit/test_tdx_collector.py` | Callback and collector tests |
| Create | `../mist-datasource/tests/integration/test_tdx_v1.py` | FastAPI v1 route tests |
| Modify | `../mist-datasource/tests/integration/test_tdx_ws.py` | Normalized WebSocket tests |
| Modify | `apps/mist/src/sources/tdx/types.ts` | Add normalized envelope, bar, snapshot, and WS message types |
| Modify | `apps/mist/src/sources/tdx/tdx-source.service.ts` | Call `/v1/bars/query` and `/v1/snapshots/query` |
| Modify | `apps/mist/src/sources/tdx/tdx-source.service.spec.ts` | Contract tests for normalized HTTP |
| Modify | `apps/mist/src/sources/tdx/tdx-websocket.service.ts` | Send subscription sync and consume normalized `bar` events |
| Create | `apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts` | WebSocket reconnect, sync, and bar handling tests |
| Modify | `apps/mist/src/collector/strategies/websocket-collection.strategy.ts` | Resolve real `Security` before saving bar events |
| Create | `apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts` | Streaming persistence tests |
| Modify | `libs/config/src/validation.schema.ts` | Keep and document TDX URL/client settings |
| Create | `../mist-datasource/scripts/winsw/mist-tdx-datasource.xml` | WinSW service definition template |
| Create | `../mist-datasource/scripts/winsw/install-tdx-datasource.ps1` | Install/update WinSW service |
| Create | `../mist-datasource/scripts/winsw/uninstall-tdx-datasource.ps1` | Stop/remove WinSW service |
| Create | `../mist-datasource/scripts/winsw/test-tdx-datasource.ps1` | Health, raw, bar query, WS sync, restart smoke test |
| Modify | `../mist-datasource/README.md` | Document normalized TDX service and WinSW path |
| Modify | `deploy/windows/README-Windows.md` | Document backend `TDX_BASE_URL`, service name, smoke path |

---

### Task 0: Execution Preflight

**Files:**
- Read: `CLAUDE.md`
- Read: `../mist-datasource/CLAUDE.md`
- Read: OpenSpec files listed above

- [ ] **Step 1: Verify isolated workspace or get consent**

Run from `/Users/moyui/sean/mist/mist`:

```bash
git rev-parse --git-dir
git rev-parse --git-common-dir
git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD
git rev-parse --show-superproject-working-tree 2>/dev/null || true
```

Expected: if `git-dir` equals `git-common-dir`, ask before creating a worktree. Do not start implementation on `main` or `master` without explicit user consent.

- [ ] **Step 2: Check current local changes**

```bash
git status --short
```

Expected: note existing untracked OpenSpec change directories. Do not revert or delete them.

- [ ] **Step 3: Run OpenSpec validation**

```bash
openspec validate --changes "refactor-tdx-python-datasource"
```

Expected: `refactor-tdx-python-datasource` passes.

- [ ] **Step 4: Run narrow baseline tests**

```bash
cd /Users/moyui/sean/mist/mist-datasource
uv run pytest tests/unit/test_ws_protocol.py tests/integration/test_tdx_ws.py -v
cd /Users/moyui/sean/mist/mist
pnpm run test -- apps/mist/src/sources/tdx/tdx-source.service.spec.ts --runInBand
```

Expected: baseline either passes or any failures are recorded before implementation. If baseline fails for unrelated reasons, ask whether to continue.

---

### Task 1: Add Python Normalized Contracts And Normalization

**Files:**
- Create: `../mist-datasource/src/datasource/__init__.py`
- Create: `../mist-datasource/src/datasource/contracts.py`
- Create: `../mist-datasource/src/datasource/tdx_models.py`
- Create: `../mist-datasource/src/datasource/tdx_normalization.py`
- Create: `../mist-datasource/tests/unit/test_tdx_contracts.py`
- Create: `../mist-datasource/tests/unit/test_tdx_normalization.py`

- [ ] **Step 1: Write failing contract tests**

Create `../mist-datasource/tests/unit/test_tdx_contracts.py`:

```python
from src.datasource.contracts import DatasourceError, ResponseEnvelope, ResponseMeta


def test_success_envelope_has_stable_shape():
    envelope = ResponseEnvelope.success(
        request_id="req_test",
        provider="tdx",
        data={"items": []},
        meta=ResponseMeta(sourceLatencyMs=12, transport="http", asOf="2026-06-26T10:00:03+08:00"),
    )

    payload = envelope.model_dump()

    assert payload["ok"] is True
    assert payload["requestId"] == "req_test"
    assert payload["provider"] == "tdx"
    assert payload["data"] == {"items": []}
    assert payload["error"] is None
    assert payload["meta"]["transport"] == "http"


def test_error_envelope_has_stable_error_code():
    envelope = ResponseEnvelope.failure(
        request_id="req_test",
        provider="tdx",
        error=DatasourceError(
            code="TDX_HTTP_UNAVAILABLE",
            message="TDX HTTP endpoint is unavailable",
            retryable=True,
            details={"url": "http://127.0.0.1:17709/"},
        ),
    )

    payload = envelope.model_dump()

    assert payload["ok"] is False
    assert payload["data"] is None
    assert payload["error"]["code"] == "TDX_HTTP_UNAVAILABLE"
    assert payload["error"]["retryable"] is True
```

- [ ] **Step 2: Write failing normalization tests**

Create `../mist-datasource/tests/unit/test_tdx_normalization.py`:

```python
from src.datasource.tdx_normalization import (
    normalize_number,
    normalize_symbol,
    normalize_tdx_bar_rows,
    normalize_tdx_snapshot,
)


def test_normalize_symbol_accepts_tdx_prefix_and_market_suffix():
    assert normalize_symbol("SH600519") == "600519.SH"
    assert normalize_symbol("600519.SH") == "600519.SH"
    assert normalize_symbol("SZ000001") == "000001.SZ"
    assert normalize_symbol("000001.SZ") == "000001.SZ"


def test_normalize_number_coerces_strings_and_empty_values():
    assert normalize_number("12.30") == 12.3
    assert normalize_number(9) == 9.0
    assert normalize_number("") == 0.0
    assert normalize_number(None) == 0.0


def test_normalize_bar_rows_outputs_iso_beijing_time_and_numbers():
    rows = normalize_tdx_bar_rows(
        symbol="SH600519",
        period="1m",
        native={
            "Open": {"SH600519": {"2026-06-26T09:31:00": "10.1"}},
            "High": {"SH600519": {"2026-06-26T09:31:00": "10.3"}},
            "Low": {"SH600519": {"2026-06-26T09:31:00": "10.0"}},
            "Close": {"SH600519": {"2026-06-26T09:31:00": "10.2"}},
            "Volume": {"SH600519": {"2026-06-26T09:31:00": "1200"}},
            "Amount": {"SH600519": {"2026-06-26T09:31:00": "12345.6"}},
        },
    )

    assert len(rows) == 1
    assert rows[0].symbol == "600519.SH"
    assert rows[0].barTime == "2026-06-26T09:31:00+08:00"
    assert rows[0].close == 10.2
    assert rows[0].provider == "tdx"


def test_normalize_snapshot_maps_native_fields():
    snapshot = normalize_tdx_snapshot(
        "SH600519",
        {
            "Now": "10.2",
            "Open": "10.1",
            "Max": "10.3",
            "Min": "10.0",
            "Volume": "1200",
            "Amount": "12345.6",
        },
    )

    assert snapshot.symbol == "600519.SH"
    assert snapshot.last == 10.2
    assert snapshot.high == 10.3
    assert snapshot.low == 10.0
```

- [ ] **Step 3: Run tests and verify RED**

```bash
cd /Users/moyui/sean/mist/mist-datasource
uv run pytest tests/unit/test_tdx_contracts.py tests/unit/test_tdx_normalization.py -v
```

Expected: FAIL because `src.datasource` modules do not exist.

- [ ] **Step 4: Implement minimal models**

Create `src/datasource/contracts.py` with Pydantic models:

- `DatasourceError(code: str, message: str, retryable: bool = False, details: dict[str, Any] = {})`
- `ResponseMeta(sourceLatencyMs: int | None = None, transport: str, asOf: str, requestKey: str | None = None)`
- `ResponseEnvelope(ok: bool, requestId: str, provider: str, data: Any | None, meta: ResponseMeta | None, error: DatasourceError | None)`
- `ResponseEnvelope.success(...)`
- `ResponseEnvelope.failure(...)`

Create `src/datasource/tdx_models.py` with:

- `TdxBar(symbol, period, barTime, open, high, low, close, volume, amount, provider, receivedAt)`
- `TdxSnapshot(symbol, last, open, high, low, volume, amount, provider, asOf)`
- `TdxBarQueryRequest(symbols, period, startTime, endTime, count, includeRaw)`
- `TdxSnapshotQueryRequest(symbols, fields, includeRaw)`
- `RawTdxCallRequest(method, params)`
- `TdxWsMessage(type, requestId, eventId, provider, data, meta, error)`

Use aliases matching JSON keys from OpenSpec, for example `barTime`, `receivedAt`, and `requestId`.

- [ ] **Step 5: Implement minimal normalization helpers**

Create `src/datasource/tdx_normalization.py` with:

- `normalize_symbol(code: str) -> str`
- `to_tdx_code(symbol: str) -> str`
- `beijing_iso(value: str | datetime | None = None) -> str`
- `normalize_number(value: Any) -> float`
- `normalize_tdx_bar_rows(symbol: str, period: str, native: dict[str, Any]) -> list[TdxBar]`
- `normalize_tdx_snapshot(symbol: str, native: dict[str, Any]) -> TdxSnapshot`

Rules:

- `SH600519` -> `600519.SH`
- `SZ000001` -> `000001.SZ`
- `600519.SH` stays `600519.SH`
- Empty or missing numeric fields become `0.0`
- Timestamp strings without timezone get `+08:00`

- [ ] **Step 6: Run tests and verify GREEN**

```bash
cd /Users/moyui/sean/mist/mist-datasource
uv run pytest tests/unit/test_tdx_contracts.py tests/unit/test_tdx_normalization.py -v
```

Expected: PASS.

---

### Task 2: Add TDX HTTP Client And Normalized Provider

**Files:**
- Create: `../mist-datasource/src/datasource/tdx_http_client.py`
- Create: `../mist-datasource/src/datasource/tdx_provider.py`
- Modify: `../mist-datasource/src/core/config.py`
- Create: `../mist-datasource/tests/unit/test_tdx_http_client.py`
- Create: `../mist-datasource/tests/unit/test_tdx_provider.py`

- [ ] **Step 1: Write failing HTTP client tests**

Create `../mist-datasource/tests/unit/test_tdx_http_client.py`:

```python
import httpx
import pytest

from src.datasource.tdx_http_client import TdxHttpClient, TdxHttpError


@pytest.mark.asyncio
async def test_tdx_http_client_posts_json_rpc_payload():
    seen_payload = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        seen_payload.update(request.json())
        return httpx.Response(200, json={"result": {"ok": True}})

    client = TdxHttpClient(
        base_url="http://127.0.0.1:17709/",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )

    result = await client.call("get_market_snapshot", {"stock_code": "SH600519"})

    assert seen_payload["method"] == "get_market_snapshot"
    assert seen_payload["params"] == {"stock_code": "SH600519"}
    assert result == {"ok": True}
    await client.aclose()


@pytest.mark.asyncio
async def test_tdx_http_client_maps_connection_errors():
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    client = TdxHttpClient(
        base_url="http://127.0.0.1:17709/",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )

    with pytest.raises(TdxHttpError) as exc:
        await client.call("get_market_snapshot", {"stock_code": "SH600519"})

    assert exc.value.code == "TDX_HTTP_UNAVAILABLE"
    await client.aclose()
```

- [ ] **Step 2: Write failing provider tests**

Create `../mist-datasource/tests/unit/test_tdx_provider.py`:

```python
import pytest

from src.datasource.tdx_provider import TdxDatasourceProvider


class FakeTdxHttpClient:
    def __init__(self):
        self.calls = []

    async def call(self, method, params):
        self.calls.append((method, params))
        if method == "get_market_data":
            return {
                "Open": {"SH600519": {"2026-06-26T09:31:00": "10.1"}},
                "High": {"SH600519": {"2026-06-26T09:31:00": "10.3"}},
                "Low": {"SH600519": {"2026-06-26T09:31:00": "10.0"}},
                "Close": {"SH600519": {"2026-06-26T09:31:00": "10.2"}},
                "Volume": {"SH600519": {"2026-06-26T09:31:00": "1200"}},
                "Amount": {"SH600519": {"2026-06-26T09:31:00": "12345.6"}},
            }
        if method == "get_market_snapshot":
            return {"Now": "10.2", "Open": "10.1", "Max": "10.3", "Min": "10.0"}
        return {"raw": True}


@pytest.mark.asyncio
async def test_provider_get_bars_uses_tdx_http_and_normalizes_rows():
    http = FakeTdxHttpClient()
    provider = TdxDatasourceProvider(http_client=http)

    bars = await provider.get_bars(["600519.SH"], period="1m", start_time=None, end_time=None, count=2)

    assert http.calls[0][0] == "get_market_data"
    assert bars[0].symbol == "600519.SH"
    assert bars[0].close == 10.2


@pytest.mark.asyncio
async def test_provider_get_snapshots_normalizes_rows():
    provider = TdxDatasourceProvider(http_client=FakeTdxHttpClient())

    snapshots = await provider.get_snapshots(["600519.SH"], fields=None)

    assert snapshots[0].symbol == "600519.SH"
    assert snapshots[0].last == 10.2
```

- [ ] **Step 3: Run tests and verify RED**

```bash
cd /Users/moyui/sean/mist/mist-datasource
uv run pytest tests/unit/test_tdx_http_client.py tests/unit/test_tdx_provider.py -v
```

Expected: FAIL because client/provider modules do not exist.

- [ ] **Step 4: Add settings**

Modify `src/core/config.py`:

- Add `http_url: str = "http://127.0.0.1:17709/"` to `TDXSettings`.
- Add `minute_period: str = "1m"` to `TDXSettings`.
- Add `collect_delay_seconds: int = 2`.
- Add `retry_delay_seconds: int = 8`.
- Add `reconcile_interval_seconds: int = 60`.
- Add `max_subscriptions: int = 100`.
- Add `ws_queue_max_size: int = 1000`.

- [ ] **Step 5: Implement TdxHttpClient**

Implement `TdxHttpClient.call(method: str, params: dict[str, Any] | list[Any] | None) -> Any`:

- POST JSON to `base_url`.
- Include `jsonrpc: "2.0"`, `id`, `method`, and `params`.
- If response has `error`, raise `TdxHttpError(code="TDX_HTTP_ERROR", retryable=True, details=...)`.
- If network or timeout fails, raise `TdxHttpError(code="TDX_HTTP_UNAVAILABLE", retryable=True, details=...)`.
- Return `payload["result"]` when present, otherwise return the full JSON payload.

- [ ] **Step 6: Implement TdxDatasourceProvider**

Implement provider methods:

- `get_bars(symbols, period, start_time, end_time, count)` calls `get_market_data`.
- `get_snapshots(symbols, fields)` calls `get_market_snapshot` per symbol.
- `get_sector_members(sector)` calls `get_stock_list_in_sector`.
- `call_formula(name, args, context)` calls the named method.
- `raw_call(method, params)` proxies to `TdxHttpClient`.
- `health()` attempts a lightweight HTTP call or returns last known HTTP status.

Use `to_tdx_code()` for request symbols and normalization helpers for responses.

- [ ] **Step 7: Run tests and verify GREEN**

```bash
cd /Users/moyui/sean/mist/mist-datasource
uv run pytest tests/unit/test_tdx_http_client.py tests/unit/test_tdx_provider.py -v
```

Expected: PASS.

---

### Task 3: Add `/v1` FastAPI Routes And Enriched Health

**Files:**
- Create: `../mist-datasource/tdx/routes/v1.py`
- Modify: `../mist-datasource/tdx/main.py`
- Create: `../mist-datasource/tests/integration/test_tdx_v1.py`

- [ ] **Step 1: Write failing v1 route tests**

Create `../mist-datasource/tests/integration/test_tdx_v1.py`:

```python
import pytest


@pytest.mark.asyncio
async def test_providers_route_returns_tdx(tdx_client):
    response = await tdx_client.get("/providers")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["provider"] == "tdx"
    assert payload["data"]["providers"][0]["id"] == "tdx"


@pytest.mark.asyncio
async def test_v1_bars_query_returns_normalized_envelope(tdx_client):
    response = await tdx_client.post(
        "/v1/bars/query",
        json={"symbols": ["600519.SH"], "period": "1m", "count": 2},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["provider"] == "tdx"
    assert "symbol" in payload["data"]["bars"][0]
    assert "barTime" in payload["data"]["bars"][0]


@pytest.mark.asyncio
async def test_v1_snapshot_query_returns_normalized_envelope(tdx_client):
    response = await tdx_client.post(
        "/v1/snapshots/query",
        json={"symbols": ["600519.SH"]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["data"]["snapshots"][0]["symbol"] == "600519.SH"


@pytest.mark.asyncio
async def test_health_includes_tdx_bridge_fields(tdx_client):
    response = await tdx_client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert "tdxHttpReachable" in payload
    assert "tqInitialized" in payload
    assert "wsConnected" in payload
    assert "eventQueueDepth" in payload
    assert "collectorState" in payload
```

- [ ] **Step 2: Run tests and verify RED**

```bash
cd /Users/moyui/sean/mist/mist-datasource
uv run pytest tests/integration/test_tdx_v1.py -v
```

Expected: FAIL because v1 routes are not registered.

- [ ] **Step 3: Implement v1 routes**

Create `tdx/routes/v1.py` with:

- `GET /providers`
- `POST /v1/bars/query`
- `POST /v1/snapshots/query`
- `POST /v1/formulas/call`
- `POST /v1/sectors/query`
- `POST /v1/raw/tdx/call`

Each route:

- Gets provider from `tdx.main.tdx_provider`.
- Wraps success with `ResponseEnvelope.success`.
- Wraps stable errors with `ResponseEnvelope.failure`.
- Does not expose provider-native shapes except `/v1/raw/tdx/call`.

- [ ] **Step 4: Register provider and routes**

Modify `tdx/main.py`:

- Create module globals `tdx_provider`, `tdx_bridge`, `tdx_collector` initialized during lifespan/startup.
- Register the v1 router without removing legacy routers.
- Extend `/health` with `tdxHttpReachable`, `tqInitialized`, `wsConnected`, `subscribedCount`, `lastCallbackAt`, `lastMinuteBarAt`, `eventQueueDepth`, `eventQueueCapacity`, and `collectorState`.

- [ ] **Step 5: Run tests and verify GREEN**

```bash
cd /Users/moyui/sean/mist/mist-datasource
uv run pytest tests/integration/test_tdx_v1.py -v
```

Expected: PASS.

---

### Task 4: Add WebSocket Bridge Protocol And Runtime State

**Files:**
- Create: `../mist-datasource/src/datasource/tdx_bridge.py`
- Modify: `../mist-datasource/src/ws/protocol.py`
- Modify: `../mist-datasource/tdx/routes/ws.py`
- Create: `../mist-datasource/tests/unit/test_tdx_bridge.py`
- Modify: `../mist-datasource/tests/integration/test_tdx_ws.py`

- [ ] **Step 1: Write failing bridge unit tests**

Create `../mist-datasource/tests/unit/test_tdx_bridge.py`:

```python
import pytest

from src.datasource.tdx_bridge import TdxBridge
from src.datasource.tdx_models import TdxBar


def test_bridge_claims_first_client_as_command_leader():
    bridge = TdxBridge(queue_max_size=10, max_subscriptions=100)

    assert bridge.claim_leader("nestjs-a") is True
    assert bridge.claim_leader("nestjs-b") is False


def test_bridge_releases_leader_on_disconnect():
    bridge = TdxBridge(queue_max_size=10, max_subscriptions=100)
    bridge.claim_leader("nestjs-a")

    bridge.disconnect("nestjs-a")

    assert bridge.claim_leader("nestjs-b") is True


def test_bridge_sync_subscriptions_calculates_delta():
    bridge = TdxBridge(queue_max_size=10, max_subscriptions=100)
    result = bridge.plan_sync(["600519.SH", "000001.SZ"])

    assert result.to_subscribe == ["600519.SH", "000001.SZ"]
    assert result.to_unsubscribe == []

    bridge.mark_active(["600519.SH", "000001.SZ"])
    result = bridge.plan_sync(["600519.SH"])

    assert result.to_subscribe == []
    assert result.to_unsubscribe == ["000001.SZ"]


def test_bridge_rejects_subscription_over_limit():
    bridge = TdxBridge(queue_max_size=10, max_subscriptions=2)

    result = bridge.plan_sync(["600519.SH", "000001.SZ", "601318.SH"])

    assert result.error_code == "TDX_SUBSCRIBE_LIMIT_EXCEEDED"


def test_bridge_bounded_queue_reports_backpressure():
    bridge = TdxBridge(queue_max_size=1, max_subscriptions=100)
    bar = TdxBar(
        symbol="600519.SH",
        period="1m",
        barTime="2026-06-26T09:31:00+08:00",
        open=10.1,
        high=10.3,
        low=10.0,
        close=10.2,
        volume=1200,
        amount=12345.6,
        provider="tdx",
        receivedAt="2026-06-26T09:31:02+08:00",
    )

    assert bridge.enqueue_bar(bar) is True
    assert bridge.enqueue_bar(bar) is False
    assert bridge.last_error_code == "DATASOURCE_WS_BACKPRESSURE"
```

- [ ] **Step 2: Write failing WebSocket integration tests**

Extend `../mist-datasource/tests/integration/test_tdx_ws.py`:

```python
def test_ws_sends_ready_on_connect(client):
    with client.websocket_connect("/ws/quote/test-client") as ws:
        data = ws.receive_json()
        assert data["type"] == "ready"
        assert data["provider"] == "tdx"


def test_ws_sync_subscriptions_returns_accepted_symbols(client):
    with client.websocket_connect("/ws/quote/test-client") as ws:
        ws.receive_json()  # ready
        ws.send_json({"type": "sync_subscriptions", "symbols": ["600519.SH"]})
        data = ws.receive_json()
        assert data["type"] == "subscribed"
        assert data["data"]["accepted"] == ["600519.SH"]


def test_ws_rejects_non_leader_sync(client):
    with client.websocket_connect("/ws/quote/leader") as leader:
        leader.receive_json()
        with client.websocket_connect("/ws/quote/follower") as follower:
            follower.receive_json()
            follower.send_json({"type": "sync_subscriptions", "symbols": ["600519.SH"]})
            data = follower.receive_json()
            assert data["type"] == "error"
            assert data["error"]["code"] == "DATASOURCE_WS_NOT_LEADER"
```

- [ ] **Step 3: Run tests and verify RED**

```bash
cd /Users/moyui/sean/mist/mist-datasource
uv run pytest tests/unit/test_tdx_bridge.py tests/integration/test_tdx_ws.py -v
```

Expected: FAIL because bridge behavior is missing.

- [ ] **Step 4: Implement TdxBridge**

Implement in-memory state:

- `leader_client_id`
- `connected_clients`
- `active_subscriptions`
- `desired_subscriptions`
- `last_callback_at`
- `last_minute_bar_at`
- `event_queue_depth`
- `event_queue_capacity`
- `last_error_code`

Implement:

- `claim_leader(client_id)`
- `disconnect(client_id)`
- `plan_sync(symbols)`
- `mark_active(symbols)`
- `enqueue_bar(bar)`
- `health()`
- `make_ready_message()`
- `make_error_message(code, message, retryable, details)`

- [ ] **Step 5: Update WebSocket route**

Modify `tdx/routes/ws.py`:

- Send `ready` immediately after connection.
- Preserve legacy `ping -> pong`.
- Support `sync_subscriptions`, `subscribe`, and `unsubscribe`.
- Call bridge reconciliation before adapter subscription changes.
- Return `subscribed` / `unsubscribed` with `data.accepted`, `data.rejected`, and `data.active`.
- Return structured `error` with stable error code.
- Continue to tolerate old `subscribe` payload key `stocks` as an alias for `symbols`.

- [ ] **Step 6: Run tests and verify GREEN**

```bash
cd /Users/moyui/sean/mist/mist-datasource
uv run pytest tests/unit/test_tdx_bridge.py tests/integration/test_tdx_ws.py -v
```

Expected: PASS.

---

### Task 5: Add Subscription Client And Minute Collector

**Files:**
- Create: `../mist-datasource/src/datasource/tdx_subscription.py`
- Create: `../mist-datasource/src/datasource/tdx_collector.py`
- Modify: `../mist-datasource/src/adapter/mock/tdx_mock.py`
- Modify: `../mist-datasource/tdx/main.py`
- Create: `../mist-datasource/tests/unit/test_tdx_collector.py`

- [ ] **Step 1: Write failing collector tests**

Create `../mist-datasource/tests/unit/test_tdx_collector.py`:

```python
import pytest

from src.datasource.tdx_bridge import TdxBridge
from src.datasource.tdx_collector import TdxMinuteCollector


class FakeProvider:
    async def collect_recent_bars(self, symbols, period, count):
        return [
            {
                "symbol": symbol,
                "period": period,
                "barTime": "2026-06-26T09:31:00+08:00",
                "open": 10.1,
                "high": 10.3,
                "low": 10.0,
                "close": 10.2,
                "volume": 1200,
                "amount": 12345.6,
                "provider": "tdx",
                "receivedAt": "2026-06-26T09:31:02+08:00",
            }
            for symbol in symbols
        ]


@pytest.mark.asyncio
async def test_callback_only_marks_dirty_symbol():
    bridge = TdxBridge(queue_max_size=10, max_subscriptions=100)
    collector = TdxMinuteCollector(provider=FakeProvider(), bridge=bridge, period="1m")

    collector.mark_dirty_from_callback({"Code": "SH600519", "ErrorId": "0"})

    assert collector.dirty_symbols == {"600519.SH"}


@pytest.mark.asyncio
async def test_collector_emits_bar_once_per_key():
    bridge = TdxBridge(queue_max_size=10, max_subscriptions=100)
    collector = TdxMinuteCollector(provider=FakeProvider(), bridge=bridge, period="1m")
    collector.mark_dirty("600519.SH")

    emitted = await collector.collect_dirty_once()
    emitted_again = await collector.collect_dirty_once()

    assert emitted == 1
    assert emitted_again == 0
    assert bridge.event_queue_depth == 1
```

- [ ] **Step 2: Run tests and verify RED**

```bash
cd /Users/moyui/sean/mist/mist-datasource
uv run pytest tests/unit/test_tdx_collector.py -v
```

Expected: FAIL because collector module is missing.

- [ ] **Step 3: Implement subscription wrapper**

Create `src/datasource/tdx_subscription.py`:

- Wrap the existing `tdx_adapter.subscribe_hq` and `tdx_adapter.unsubscribe_hq`.
- Keep callbacks fast; callbacks call `collector.mark_dirty_from_callback(payload)` only.
- Enforce `settings.tdx.max_subscriptions`.
- Return structured accepted/rejected symbol lists.

- [ ] **Step 4: Implement minute collector**

Create `src/datasource/tdx_collector.py`:

- Keep `dirty_symbols: set[str]`.
- Keep `emitted_bar_keys: set[tuple[str, str, str, str]]`.
- `mark_dirty_from_callback(payload)` normalizes `payload["Code"]`.
- `collect_dirty_once()` calls provider `collect_recent_bars(symbols, period, count=3)`.
- Emits only new bar keys through bridge.
- Records stale state when no fresh bar is found.
- Exposes `health_state()`.

- [ ] **Step 5: Wire collector lifecycle**

Modify `tdx/main.py`:

- Create the collector after provider and bridge.
- Start a background loop on startup.
- Stop the loop on shutdown.
- Make `/health` report collector state.

- [ ] **Step 6: Update mock adapter**

Modify `src/adapter/mock/tdx_mock.py`:

- `subscribe_hq(stock_list, callback=None)` stores subscribed stocks and callback.
- `unsubscribe_hq(stock_list=None)` removes stocks.
- Add a helper used by tests to trigger callback payloads without sleeping:

```python
async def emit_hq_update(self, stock_code: str) -> None:
    if self._hq_callback:
        self._hq_callback({"Code": stock_code, "ErrorId": "0"})
```

- [ ] **Step 7: Run tests and verify GREEN**

```bash
cd /Users/moyui/sean/mist/mist-datasource
uv run pytest tests/unit/test_tdx_collector.py tests/unit/test_tdx_bridge.py tests/integration/test_tdx_ws.py -v
```

Expected: PASS.

---

### Task 6: Migrate NestJS TDX HTTP Consumer To `/v1`

**Files:**
- Modify: `apps/mist/src/sources/tdx/types.ts`
- Modify: `apps/mist/src/sources/tdx/tdx-source.service.ts`
- Modify: `apps/mist/src/sources/tdx/tdx-source.service.spec.ts`

- [ ] **Step 1: Write failing normalized HTTP tests**

Extend `apps/mist/src/sources/tdx/tdx-source.service.spec.ts`:

```typescript
describe('normalized /v1 HTTP contract', () => {
  it('fetchK posts to /v1/bars/query and maps normalized bars', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        ok: true,
        provider: 'tdx',
        data: {
          bars: [
            {
              symbol: '600519.SH',
              period: '1m',
              barTime: '2026-06-26T09:31:00+08:00',
              open: 10.1,
              high: 10.3,
              low: 10.0,
              close: 10.2,
              volume: 1200,
              amount: 12345.6,
              provider: 'tdx',
              receivedAt: '2026-06-26T09:31:02+08:00',
            },
          ],
        },
        meta: { transport: 'http', asOf: '2026-06-26T09:31:02+08:00' },
        error: null,
      },
    });

    const result = await service.fetchK({
      code: '600519',
      formatCode: '600519.SH',
      period: Period.ONE_MIN,
      startDate: new Date('2026-06-26T00:00:00+08:00'),
      endDate: new Date('2026-06-26T23:59:59+08:00'),
    });

    expect(mockAxiosPost).toHaveBeenCalledWith('/v1/bars/query', expect.objectContaining({
      symbols: ['600519.SH'],
      period: '1min',
    }));
    expect(result[0].close).toBe(10.2);
  });

  it('throws bad gateway when envelope ok is false', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        ok: false,
        provider: 'tdx',
        data: null,
        meta: null,
        error: { code: 'TDX_HTTP_UNAVAILABLE', message: 'down', retryable: true, details: {} },
      },
    });

    await expect(service.fetchSnapshot('600519.SH')).rejects.toThrow('TDX_HTTP_UNAVAILABLE');
  });
});
```

Also change the test setup mock axios instance to include `post: mockAxiosPost`.

- [ ] **Step 2: Run test and verify RED**

```bash
cd /Users/moyui/sean/mist/mist
pnpm run test -- apps/mist/src/sources/tdx/tdx-source.service.spec.ts --runInBand
```

Expected: FAIL because `fetchK` still calls legacy `GET /api/tdx/market-data`.

- [ ] **Step 3: Add normalized TypeScript types**

Modify `apps/mist/src/sources/tdx/types.ts`:

- `TdxEnvelope<T>`
- `TdxDatasourceError`
- `TdxNormalizedBar`
- `TdxNormalizedSnapshot`
- `TdxBarsResponseData`
- `TdxSnapshotsResponseData`

- [ ] **Step 4: Update `TdxSource.fetchK`**

Modify `tdx-source.service.ts`:

- Use `this.axios.post<TdxEnvelope<TdxBarsResponseData>>('/v1/bars/query', body)`.
- Body includes `symbols: [formatCode]`, `period`, `startTime`, `endTime`, `count` if available.
- Validate `response.data.ok === true`.
- Map `bar.barTime` with `parseISO`.
- Do not parse provider-native field maps in the new path.

- [ ] **Step 5: Update `TdxSource.fetchSnapshot`**

Modify `tdx-source.service.ts`:

- Use `POST /v1/snapshots/query`.
- Validate envelope.
- Map normalized snapshot fields to existing `TdxSnapshot`.

- [ ] **Step 6: Run test and verify GREEN**

```bash
cd /Users/moyui/sean/mist/mist
pnpm run test -- apps/mist/src/sources/tdx/tdx-source.service.spec.ts --runInBand
```

Expected: PASS.

---

### Task 7: Migrate NestJS TDX WebSocket Consumer To Normalized Bar Events

**Files:**
- Modify: `apps/mist/src/sources/tdx/tdx-websocket.service.ts`
- Create: `apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts`
- Modify: `apps/mist/src/collector/strategies/websocket-collection.strategy.ts`
- Create: `apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts`

- [ ] **Step 1: Write failing WebSocket service tests**

Create `apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts`:

```typescript
import { EventEmitter } from 'events';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TdxWebSocketService } from './tdx-websocket.service';

class FakeWebSocket extends EventEmitter {
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];

  constructor(readonly url: string) {
    super();
    setImmediate(() => this.emit('open'));
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.emit('close');
  }
}

describe('TdxWebSocketService normalized bridge', () => {
  it('sends sync_subscriptions after connect', async () => {
    const service = new TdxWebSocketService(
      { get: jest.fn((key: string) => key === 'TDX_BASE_URL' ? 'http://127.0.0.1:9001' : 'mist-backend-tdx') } as unknown as ConfigService,
      undefined as any,
      { getCurrentBeijingTime: () => new Date('2026-06-26T09:31:00+08:00') } as any,
      FakeWebSocket as any,
    );

    service.subscribe('600519.SH');
    await service.onModuleInit();

    const socket = (service as any).ws as FakeWebSocket;
    await new Promise((resolve) => setImmediate(resolve));

    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'sync_subscriptions',
      symbols: ['600519.SH'],
    });
  });

  it('emits normalized bar callbacks without snapshot aggregation', () => {
    const service = new TdxWebSocketService(
      { get: jest.fn(() => undefined) } as unknown as ConfigService,
      undefined as any,
      { getCurrentBeijingTime: () => new Date('2026-06-26T09:31:00+08:00') } as any,
      FakeWebSocket as any,
    );
    const callback = jest.fn();
    service.onBar(callback);

    (service as any).handleMessage(JSON.stringify({
      type: 'bar',
      provider: 'tdx',
      data: {
        symbol: '600519.SH',
        period: '1m',
        barTime: '2026-06-26T09:31:00+08:00',
        open: 10.1,
        high: 10.3,
        low: 10.0,
        close: 10.2,
        volume: 1200,
        amount: 12345.6,
      },
    }));

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      symbol: '600519.SH',
      close: 10.2,
    }));
  });
});
```

Add a fourth constructor parameter to `TdxWebSocketService`:

```typescript
private readonly webSocketCtor: typeof WebSocket = WebSocket
```

Then create sockets with `new this.webSocketCtor(this.wsUrl)` so tests can pass
`FakeWebSocket` without network access.

- [ ] **Step 2: Write failing collection strategy tests**

Create `apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts`:

```typescript
import { Logger } from '@nestjs/common';
import { DataSource, Period } from '@app/shared-data';
import { WebSocketCollectionStrategy } from './websocket-collection.strategy';

describe('WebSocketCollectionStrategy TDX normalized bars', () => {
  it('resolves real security before saving normalized bar events', async () => {
    const security = { id: 1, code: '600519', sourceConfigs: [] } as any;
    const collectorService = {
      findSecurityByCode: jest.fn().mockResolvedValue(security),
      saveRawKData: jest.fn().mockResolvedValue(undefined),
    };
    const tdxWsService = {
      onBar: jest.fn((callback) => callback({
        symbol: '600519.SH',
        period: Period.ONE_MIN,
        timestamp: new Date('2026-06-26T09:31:00+08:00'),
        open: 10.1,
        high: 10.3,
        low: 10.0,
        close: 10.2,
        volume: 1200,
        amount: 12345.6,
      })),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    };

    new WebSocketCollectionStrategy(
      DataSource.TDX,
      collectorService as any,
      {} as any,
      new Logger('test'),
      tdxWsService as any,
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(collectorService.findSecurityByCode).toHaveBeenCalledWith('600519');
    expect(collectorService.saveRawKData).toHaveBeenCalledWith(
      security,
      [expect.objectContaining({ close: 10.2 })],
      DataSource.TDX,
      Period.ONE_MIN,
    );
  });
});
```

- [ ] **Step 3: Run tests and verify RED**

```bash
cd /Users/moyui/sean/mist/mist
pnpm run test -- apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts --runInBand
```

Expected: FAIL because normalized bar APIs do not exist.

- [ ] **Step 4: Update WebSocket service**

Modify `tdx-websocket.service.ts`:

- Add `onBar(callback)` beside or instead of `onCandleComplete`.
- Keep `onSnapshot` only if existing callers still need it.
- On open, send `sync_subscriptions` with all current subscriptions.
- On `subscribe(stockCode)`, add to set and send `sync_subscriptions`.
- On `unsubscribe(stockCode)`, remove from set and send `sync_subscriptions`.
- On `bar` message, parse normalized bar into `{ symbol, period, timestamp, open, high, low, close, volume, amount }` and call bar callbacks.
- Do not route normalized `bar` messages through `KCandleAggregator`.
- Preserve heartbeat `ping` and `pong`.

- [ ] **Step 5: Update collection strategy**

Modify `websocket-collection.strategy.ts`:

- Register `tdxWsService.onBar(...)`.
- Convert normalized symbol to Mist security code:
  - `600519.SH` -> `600519`
  - `000001.SZ` -> `000001`
  - `SH600519` -> `600519`
- Resolve the real `Security` with `collectorService.findSecurityByCode(code)`.
- If security is missing, log and skip.
- Call `saveRawKData(security, [bar], DataSource.TDX, period)`.

- [ ] **Step 6: Run tests and verify GREEN**

```bash
cd /Users/moyui/sean/mist/mist
pnpm run test -- apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts --runInBand
```

Expected: PASS.

---

### Task 8: Add WinSW Service Path And Smoke Scripts

**Files:**
- Create: `../mist-datasource/scripts/winsw/mist-tdx-datasource.xml`
- Create: `../mist-datasource/scripts/winsw/install-tdx-datasource.ps1`
- Create: `../mist-datasource/scripts/winsw/uninstall-tdx-datasource.ps1`
- Create: `../mist-datasource/scripts/winsw/test-tdx-datasource.ps1`
- Modify: `../mist-datasource/scripts/windows-common.ps1`
- Modify: `../mist-datasource/README.md`
- Modify: `deploy/windows/README-Windows.md`

- [ ] **Step 1: Write smoke script contract**

Create `../mist-datasource/scripts/winsw/test-tdx-datasource.ps1` with parameters:

```powershell
param(
  [string]$BaseUrl = "http://127.0.0.1:9001",
  [string]$WsUrl = "ws://127.0.0.1:9001/ws/quote/smoke-test",
  [string]$Symbol = "600519.SH"
)
```

The script must:

- Call `$BaseUrl/health`.
- Verify `tdxHttpReachable`, `tqInitialized`, `eventQueueDepth`, and `collectorState` keys exist.
- Call `POST $BaseUrl/v1/raw/tdx/call`.
- Call `POST $BaseUrl/v1/bars/query`.
- Open WebSocket, receive `ready`, send `sync_subscriptions`, receive `subscribed`.
- Exit non-zero on failure.

- [ ] **Step 2: Add WinSW XML template**

Create `scripts/winsw/mist-tdx-datasource.xml`:

- Service id/name: `mist-tdx-datasource`.
- Executable: configured Python or `uv`.
- Arguments: run `uvicorn tdx.main:app --host %DATASOURCE_HOST% --port %DATASOURCE_PORT%`.
- Environment variables include `TDX_HTTP_URL`, `TDX_SDK_PATH`, `DATASOURCE_HOST`, `DATASOURCE_PORT`, `TDX_MINUTE_PERIOD`, `TDX_COLLECT_DELAY_SECONDS`, `TDX_RETRY_DELAY_SECONDS`, `TDX_RECONCILE_INTERVAL_SECONDS`, `TDX_MAX_SUBSCRIPTIONS`, and `TDX_WS_QUEUE_MAX_SIZE`.
- Log mode rolls by size.

- [ ] **Step 3: Add install/uninstall scripts**

Install script behavior:

- Validate WinSW executable exists.
- Render or copy XML.
- Stop legacy `MistTDX` if explicitly requested by a `-DisableLegacyMistTDX` switch.
- Install or update `mist-tdx-datasource`.
- Start service.

Uninstall script behavior:

- Stop only `mist-tdx-datasource`.
- Uninstall only `mist-tdx-datasource`.
- Do not remove TDX client files or SDK files.

- [ ] **Step 4: Update docs**

Document:

- Python service remains `mist-datasource` TDX adapter.
- Windows service name is `mist-tdx-datasource`.
- Default backend `TDX_BASE_URL` remains `http://127.0.0.1:9001` during migration.
- TDX client login and strategy cleanup remain outside public service automation.
- No `DATASOURCE_DB` is required for the new TDX path.

- [ ] **Step 5: Run script syntax checks**

```bash
cd /Users/moyui/sean/mist/mist-datasource
pwsh -NoProfile -File scripts/winsw/install-tdx-datasource.ps1 -WhatIf
pwsh -NoProfile -File scripts/winsw/uninstall-tdx-datasource.ps1 -WhatIf
```

Expected: scripts parse and dry-run without destructive actions. If `pwsh` is unavailable on macOS, record that syntax check needs Windows/PowerShell verification.

---

### Task 9: Final Verification

**Files:**
- All files changed by Tasks 1-8

- [ ] **Step 1: Verify stale design assumptions are absent**

```bash
cd /Users/moyui/sean/mist/mist
rg -n "SQLite|sqlite|DATASOURCE_DB|cacheDbWritable|DATASOURCE_CACHE_UNAVAILABLE|/v1/bars/latest|bars/latest" \
  openspec/changes/refactor-tdx-python-datasource \
  ../mist-datasource \
  apps/mist/src/sources/tdx \
  apps/mist/src/collector/strategies \
  libs/config/src/validation.schema.ts
```

Expected: no stale implementation requirements. Mentions in historical docs or explicit "not required" notes are acceptable only if clearly marked as non-goals.

- [ ] **Step 2: Run Python tests**

```bash
cd /Users/moyui/sean/mist/mist-datasource
uv run pytest -m "not live"
uv run ruff check .
uv run pyright src tdx qmt
```

Expected: PASS.

- [ ] **Step 3: Run NestJS targeted tests**

```bash
cd /Users/moyui/sean/mist/mist
pnpm run test -- apps/mist/src/sources/tdx/tdx-source.service.spec.ts apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts apps/mist/src/collector/strategies/websocket-collection.strategy.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 4: Run broader backend validation if targeted tests pass**

```bash
cd /Users/moyui/sean/mist/mist
pnpm run test -- apps/mist/src/collector apps/mist/src/sources/tdx libs/config --runInBand
```

Expected: PASS or documented unrelated failures.

- [ ] **Step 5: Run OpenSpec validation**

```bash
cd /Users/moyui/sean/mist/mist
openspec validate --changes "refactor-tdx-python-datasource"
```

Expected: PASS.

- [ ] **Step 6: Windows live smoke verification**

Run on the Windows API machine with TongDaXin logged in and TQ authorized:

```powershell
cd <mist-datasource>
.\scripts\winsw\test-tdx-datasource.ps1 -BaseUrl "http://127.0.0.1:9001" -WsUrl "ws://127.0.0.1:9001/ws/quote/smoke-test" -Symbol "600519.SH"
```

Expected: health ok, raw call ok, normalized bars ok, WebSocket `ready` and `subscribed` ok.

---

## Review Checklist

- [ ] Python has no durable local TDX database for bars or subscription state.
- [ ] NestJS sends `sync_subscriptions` on WebSocket connect and reconnect.
- [ ] Python callbacks only mark dirty symbols and return quickly.
- [ ] Python emits normalized `bar` events, not provider-native snapshots, for minute freshness.
- [ ] NestJS persists normalized bar events through existing K-line save flow.
- [ ] Duplicate bar events are safe through the existing `K` uniqueness boundary.
- [ ] Legacy `/api/tdx/*` and `/ws/quote/*` compatibility remains during migration.
- [ ] OpenSpec validates after implementation.
