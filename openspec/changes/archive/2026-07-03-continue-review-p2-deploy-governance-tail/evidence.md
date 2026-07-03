# Evidence: continue-review-p2-deploy-governance-tail

## Review Scope

| Review ID | Status | Files | Evidence |
| --- | --- | --- | --- |
| `INFRA_REVIEW M6.1` optional governance tail | Fixed | `mist-deploy/scripts/common/deploy-defaults.ps1`, `mist-deploy/scripts/common/deploy-defaults.sh`, deploy PowerShell scripts, `scripts/deploy-mac-watchdog.sh`, workflow/script tests, `README.md` | Shared defaults modules now hold intentional production paths, URLs, ports, host names, image defaults, monitoring defaults, and smoke defaults. PowerShell and shell scripts resolve omitted parameters through those modules while preserving explicit overrides. |
| `INFRA_REVIEW S6` optional governance tail | Fixed | `mist-deploy/scripts/deploy-defaults.Tests.ps1`, `mist-deploy/scripts/test-deploy-defaults.ps1`, `mist-deploy/scripts/common/deploy-defaults-assertions.ps1` | Added a Pester-compatible behavior test file and a local fallback runner that executes the same behavior assertions when Pester is unavailable. Existing string guards remain as workflow/static contract tests. |
| `CODE_REVIEW L14` | Already closed by prior archived change | `mist-deploy/docker/.env.example`, `mist-deploy/docker/compose.yaml`, workflow/script/docs | No new work in this tail. Default nginx gateway image remains DaoCloud mirror plus immutable digest. |
| `INFRA_REVIEW T9` | Already closed by prior archived change | `mist-datasource/tests/unit/test_tdx_live_replay.py`, fixture, CI workflow | No new work in this tail. CI-safe live replay remains in datasource. |

## Red Test Evidence

- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-deploy-defaults.ps1`
  failed before implementation because `scripts/common/deploy-defaults.ps1` was
  missing.
- `bash scripts/test-deploy-mac-watchdog.sh` failed before implementation
  because `scripts/common/deploy-defaults.sh` was missing.

## Green Verification

- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-deploy-defaults.ps1`
  -> passed.
- `bash scripts/test-deploy-mac-watchdog.sh` -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-deploy-docker-appliance.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-health-check-docker-appliance.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-manage-tdx-datasource.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-tdx-runtime-smoke.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-deploy-windows-monitoring.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-mysql-backup-restore-script.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-docker-compose-config.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-docker-appliance-diagnostics.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-workflow-config.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-tdx-guard.ps1`
  -> passed.
- `pwsh-preview -NoProfile -ExecutionPolicy Bypass -File scripts/test-tdx-restart-login-register.ps1`
  -> passed.
