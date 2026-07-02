## Context

`mist-skills` is installed both as a Python package for local/CI tests and as
script directories under AstrBot's data mount. Previous cleanup introduced
shared request runners, but the repository still has script-local
`sys.path.insert` calls, test-local path mutation, scattered API path/field
literals, message-string retry decisions, and no lint/type/format contract.

## Goals / Non-Goals

**Goals:**

- Close the selected P2 skills review findings with focused tests and evidence.
- Keep the existing script CLI behavior and AstrBot smoke flow documented.
- Make API paths, request fields, retry status codes, and source choices visible
  in one shared contract module.
- Add lightweight lint/type/format configuration that can run in CI and locally.

**Non-Goals:**

- Do not change the Mist backend API.
- Do not change the AstrBot skill directory layout.
- Do not reimplement the shared runners already delivered by
  `fix-mcp-skills-contracts`.
- Do not claim P2 items outside the selected skills IDs.

## Decisions

1. **Centralize API contract constants in `shared.api_contracts`.**
   The shared runners and thin scripts will import endpoint builders, payload
   field names, security type constants, source priority, and retry status codes
   from one module. This keeps M4.1 small and testable without introducing
   dataclasses or a heavy client layer.

2. **Use structured HTTP status codes for auto-collection retry decisions.**
   K-line retry will depend on configured retry status codes such as 400/404.
   Error text will remain available for user-facing output, but it will not
   decide whether a script initializes securities or collects data.

3. **Remove in-file path mutation and make runtime path setup explicit.**
   Scripts and tests will not call `sys.path.insert`. Local/CI tests rely on the
   editable package and pytest `pythonpath`; AstrBot smoke docs will set
   `PYTHONPATH=/AstrBot/data` so copied `shared/` imports resolve without
   script-local mutation.

4. **Adopt repository-local quality gates.**
   `mist-skills` will add `ruff`, `pyright`, and `black` configuration. CI will
   install the dev extra and run lint, typecheck, format check, and pytest.

## Risks / Trade-offs

- Runtime smoke commands must include `PYTHONPATH=/AstrBot/data` unless
  `mist-skills` is installed in that Python environment. Mitigation: update
  README/RUNBOOK and verify direct script execution locally with `PYTHONPATH`.
- `pyright` may expose broader typing debt. Mitigation: start with strict enough
  checks for this package and keep any ignores explicit in configuration.
- Centralizing constants can make tests less literal. Mitigation: keep endpoint
  expectations in tests where they prove script routing, and add direct contract
  tests for the shared constants.
