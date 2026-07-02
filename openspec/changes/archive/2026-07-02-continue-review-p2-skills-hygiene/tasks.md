## 1. Contract Tests First

- [x] 1.1 Add failing skills hygiene tests for no `sys.path.insert`, centralized API contracts, structured retry decisions, and CI quality gates.
- [x] 1.2 Run targeted tests and confirm the new tests fail for the current implementation.

## 2. Skills Runtime Hygiene

- [x] 2.1 Add `shared.api_contracts` and update shared runners/scripts to use centralized endpoints, fields, security constants, and retry status codes.
- [x] 2.2 Remove `sys.path.insert` from scripts and tests, add a test loader for hyphenated skill script directories, and update AstrBot docs for explicit package/PYTHONPATH loading.
- [x] 2.3 Run targeted pytest checks and confirm the runtime hygiene tests pass.

## 3. Tooling Gates

- [x] 3.1 Add `ruff`, `pyright`, and `black` dev dependencies/configuration and update skills CI to run lint, typecheck, format check, and pytest.
- [x] 3.2 Update `uv.lock` and run the local Ruff, Pyright, Black check, and pytest verification commands.

## 4. Evidence

- [x] 4.1 Record review-ID to changed-file to verification-command evidence, including prior archived H10 coverage.
- [x] 4.2 Run `openspec validate continue-review-p2-skills-hygiene --strict` and commit the completed batch.
