## Context

Previous P0/P1/P2 work established the active Windows production boundary:
Docker Compose owns backend, chan-api, frontend, web-gateway, and MySQL, while
TDX datasource remains a host-side WinSW service. The remaining P2 work is not
another runtime redesign; it is a tightening pass around deploy defaults,
test confidence, gateway image policy, and datasource live-test replay.

Current `mist-deploy` tests still contain useful source-text guards, but review
item `S6` asks for behavior-oriented coverage where possible. Current
`mist-datasource` CI reports live test collection but cannot prove a captured
live payload still normalizes correctly without a logged-in TDX runtime.

## Goals / Non-Goals

**Goals:**

- Keep production defaults compatible while moving scattered path/IP/domain
  defaults behind env or script parameters.
- Add behavior-style tests for rendered deploy configuration instead of only
  checking source strings.
- Pin the default nginx gateway image to a digest-capable reference and keep an
  override path for private or runner-specific mirrors.
- Add CI-safe datasource live replay coverage using captured fixture data.
- Record review-ID evidence for `M6.1`, `S6`, `L14`, and `T9`.

**Non-Goals:**

- Do not run a state-changing Windows smoke test as part of local verification.
- Do not rename Windows services, Docker Compose services, ports, or public
  datasource routes.
- Do not remove the ability to override the web gateway image for runner
  network constraints.
- Do not convert every PowerShell test to Pester in this batch.

## Decisions

1. Runtime defaults stay explicit but centralized.

   Use `docker/.env.example`, workflow `env:` handoff, and script parameters as
   the sources of truth for configurable defaults. Existing LAN examples can
   remain in docs, but tests should ensure scripts/workflows do not hide
   production-specific IPs or paths in PowerShell bodies when a parameter/env
   value is available.

2. Gateway image policy is "pinned default, overridable image".

   The default `WEB_GATEWAY_IMAGE` should include an immutable digest reference.
   Operators may still replace it with a private mirror or runner-local mirror
   value in `.env`; tests must prove compose consumes the value rather than
   hardcoding a registry in multiple places.

3. Behavior tests supplement string guards.

   Keep existing lightweight string checks because they catch accidental
   regressions cheaply, but add a temporary-workdir behavior test that renders
   env/compose inputs and verifies parsed output. This closes the `S6` spirit
   without pulling in a new PowerShell dependency.

4. Live regression is replay first, live second.

   True `pytest -m live` remains opt-in because it depends on a logged-in TDX
   terminal. CI should gain a fixture-backed replay test that exercises the same
   normalization/contract path with captured live-shaped data.

## Risks / Trade-offs

- Digest values can become unavailable on a mirror -> keep documented override
  path and avoid baking the digest anywhere except the default env example.
- Behavior tests may duplicate some source guards -> keep them focused on
  rendered output and remove only clearly obsolete string assertions.
- Captured live fixtures can drift from provider reality -> pair replay tests
  with continued live collection reporting and docs that explain when to refresh
  fixtures.
