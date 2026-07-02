## 1. Contract Tests First

- [x] 1.1 Add failing CI contract checks for backend coverage exclusions, Chan test archive ignore, archived July diagnostic specs, and uv-based skills CI.
- [x] 1.2 Run `node tools/test-ci-contracts.mjs` and confirm the new contract fails against the current repository state.

## 2. Backend Test Hygiene

- [x] 2.1 Update Jest configuration to exclude specs, entrypoints, config files, and Chan test archives from the appropriate test/coverage paths.
- [x] 2.2 Move July Chan diagnostic specs into `apps/mist/src/chan/test/archive/` while preserving the files.
- [x] 2.3 Update the skills CI contract to expect uv, Ruff, Pyright, Black check, and pytest.

## 3. Verification

- [x] 3.1 Run contract, focused Chan Jest, lint, typecheck, and CI test commands.
- [x] 3.2 Record review-ID to changed-file to verification-command evidence.

## 4. Completion

- [x] 4.1 Run `openspec validate continue-review-p2-backend-test-hygiene --strict`.
- [x] 4.2 Commit the completed batch without staging unrelated production-baseline evidence.
