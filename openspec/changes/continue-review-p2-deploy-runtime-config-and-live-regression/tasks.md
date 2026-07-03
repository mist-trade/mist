## 1. Red Tests

- [x] 1.1 Add deploy config tests that fail until gateway image defaults are
      digest-pinned and override-documented.
- [x] 1.2 Add deploy behavior tests that fail until runtime path, URL, port, and
      public host defaults can be rendered from env/parameters in a temp
      config.
- [x] 1.3 Add datasource replay tests that fail until captured live-shaped TDX
      payloads are available to non-live CI tests.
- [x] 1.4 Run the targeted deploy and datasource tests and record the expected
      red failures.

## 2. Implement Deploy Runtime Config And Image Policy

- [x] 2.1 Add or update centralized deploy runtime defaults for Docker root,
      datasource root, datasource URL, web gateway port, and public host name.
- [x] 2.2 Pin the default `WEB_GATEWAY_IMAGE` with an immutable digest while
      preserving the documented override path.
- [x] 2.3 Update README/env comments so mirror/digest override guidance matches
      the tested behavior.
- [x] 2.4 Keep current production ports, service names, compose services, and
      workflow handoff semantics compatible.

## 3. Implement Datasource Live Replay Regression

- [x] 3.1 Add a captured live-shaped TDX fixture under datasource tests.
- [x] 3.2 Route the fixture through normalized provider/model logic without
      requiring a live TDX SDK.
- [x] 3.3 Keep `pytest -m live` collection/reporting intact for manual live
      verification.

## 4. Verification And Evidence

- [x] 4.1 Re-run targeted `mist-deploy` PowerShell tests with `pwsh-preview`.
- [x] 4.2 Re-run targeted `mist-datasource` pytest tests and the non-live live
      collection check.
- [x] 4.3 Run `openspec validate
      continue-review-p2-deploy-runtime-config-and-live-regression --strict`.
- [x] 4.4 Run `git diff --check` in touched repositories.
- [x] 4.5 Add evidence mapping `M6.1`, `S6`, `L14`, and `T9` to files and
      verification commands.
