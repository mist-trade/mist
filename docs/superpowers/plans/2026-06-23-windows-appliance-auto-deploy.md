# Windows Appliance Auto Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions self-hosted runner deployment path for the Windows API appliance.

**Architecture:** GitHub-hosted Windows runners continue to build `mist-api-appliance-win-x64.zip`. A separate manually triggered deploy workflow runs on the Windows API machine with label `mist-api`, downloads a selected build artifact, backs up local state, extracts the new appliance, runs the installer with portable MySQL, and performs health checks.

**Tech Stack:** GitHub Actions, Windows self-hosted runner, PowerShell, NSSM-based appliance scripts, portable MySQL.

---

## Files

- Create `.github/workflows/windows-appliance-deploy.yml` for manual self-hosted runner deployment.
- Create `deploy/windows/deploy-appliance.ps1` for Windows-side backup, extract, install, and health-check orchestration.
- Create `deploy/windows/test-deploy-appliance.ps1` for PowerShell parser and pure-function checks.
- Update `deploy/windows/README-Windows.md` with runner setup and workflow input guidance.

## Tasks

- [x] Add a PowerShell test for deploy script helper behavior.
- [x] Implement `deploy-appliance.ps1` with `-ZipPath`, `-DeployDir`, `-InstallPortableMySQL`, and `-SkipDatasourceTest`.
- [x] Preserve `backend/.env`, `datasource/.env`, `mysql/data`, and `mysql/credentials.env` before replacing `D:\MistAPI`.
- [x] Stop existing appliance services before replacing files.
- [x] Run `install-all.ps1 -InstallPortableMySQL` and `health-check.ps1 -IncludeMySQL`.
- [x] Print recent datasource, backend, and MySQL logs on failure.
- [x] Add a manual `windows-appliance-deploy.yml` workflow using `actions/download-artifact@v4` with `run-id`.
- [x] Document Windows self-hosted runner setup and deploy inputs.

## Verification

```powershell
pwsh-preview -NoProfile -ExecutionPolicy Bypass -File deploy/windows/test-deploy-appliance.ps1
pwsh-preview -NoProfile -Command "[scriptblock]::Create((Get-Content deploy/windows/deploy-appliance.ps1 -Raw)) | Out-Null; [scriptblock]::Create((Get-Content deploy/windows/test-deploy-appliance.ps1 -Raw)) | Out-Null"
```

The remaining validation must run on the Windows API machine after registering
the self-hosted runner because NSSM service management and portable MySQL
installation require Windows administrator privileges.
