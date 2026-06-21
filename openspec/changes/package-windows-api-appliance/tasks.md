# Tasks: Package Windows API appliance

## 1. Confirm deployment contract

- [x] 1.1 Confirm the Windows API machine will host MySQL.
- [x] 1.2 Confirm Redis is optional and excluded from required first-version
      deployment.
- [x] 1.3 Confirm the Mac or LLM machine will call only `MistBackend` on port
      `8001`.
- [x] 1.4 Confirm datasource SDK files are not bundled in the release artifact.

## 2. Prepare mist-datasource for repeatable packaging

- [x] 2.1 Stop ignoring `uv.lock`.
- [x] 2.1a Generate `uv.lock` during the Windows appliance workflow.
- [x] 2.1b Generate and commit a repository `uv.lock` from an environment with
      `uv` available.
- [x] 2.2 Add or update a datasource SDK preflight script.
- [x] 2.3 Validate `TDX_SDK_PATH/tqcenter.py`.
- [x] 2.4 Validate `parent(TDX_SDK_PATH)/TPythClient.dll`.
- [x] 2.5 Validate optional QMT paths when QMT is enabled.
- [x] 2.6 Document that `TDX_SDK_PATH` should stay stable because it affects
      the TDX strategy identity.

## 3. Define appliance environment templates

- [x] 3.1 Create backend `.env.example` for Windows API-machine deployment.
- [x] 3.2 Create datasource `.env.example` for Windows API-machine deployment.
- [x] 3.3 Use `TDX_BASE_URL=http://127.0.0.1:9001` for the backend.
- [x] 3.4 Bind datasource services to `127.0.0.1` by default.
- [x] 3.5 Bind `MistBackend` to `0.0.0.0:8001`.

## 4. Add backend Windows service scripts

- [x] 4.1 Add `install-service.ps1` for `MistBackend`.
- [x] 4.2 Add `uninstall-service.ps1` for `MistBackend`.
- [x] 4.3 Set NSSM `AppDirectory` to the backend package directory.
- [x] 4.4 Configure stdout and stderr log files with rotation.
- [x] 4.5 Ensure backend service reads `.env` from its package directory.

## 5. Add appliance-level scripts

- [x] 5.1 Add `install-all.ps1`.
- [x] 5.2 Add `uninstall-all.ps1`.
- [x] 5.3 Add `health-check.ps1`.
- [x] 5.4 Run preflight checks before registering services.
- [x] 5.5 Start services in order: datasource first, backend second.
- [x] 5.6 Print next-step Mac `MIST_API_BASE_URL` guidance after install.

## 6. Add database bootstrap path

- [x] 6.1 Decide whether first version uses `schema.sql`, migrations, or MySQL
      dump import.
- [x] 6.2 Add the chosen database bootstrap asset under `database/`.
- [x] 6.3 Add `import-backup.ps1` or equivalent setup script.
- [x] 6.4 Refuse to silently run production backend against an empty database.

## 7. Add GitHub Actions Windows appliance workflow

- [x] 7.1 Add `.github/workflows/windows-appliance.yml` in `mist`.
- [x] 7.2 Run the workflow on `workflow_dispatch`.
- [x] 7.3 Attach the zip on semantic version tags.
- [x] 7.4 Checkout `mist-datasource` during packaging.
- [x] 7.5 Build backend on `windows-latest`.
- [x] 7.6 Assemble `mist-api-appliance-win-x64.zip`.
- [x] 7.7 Include a `manifest.json` with source SHAs and runtime versions.

## 8. Re-scope existing workflows

- [x] 8.1 Keep Docker workflow for Linux image publishing.
- [x] 8.2 Treat the old `pkg` executable workflow as experimental or manual-only.
- [x] 8.3 Align branch triggers with the actual `master` branch if the workflow
      remains active.

## 9. Verify installation

- [ ] 9.1 Install on the Windows API machine from a clean extracted zip.
- [ ] 9.2 Verify `MistTDX` health on `127.0.0.1:9001`.
- [ ] 9.3 Verify optional `MistQMT` health on `127.0.0.1:9002`.
- [ ] 9.4 Verify `MistBackend` health on `127.0.0.1:8001/app/hello`.
- [ ] 9.5 Verify Mac can reach `http://192.168.31.x:8001/app/hello`.
- [ ] 9.6 Run `mist-skills` data, indicator, and Chan Theory smoke tests.
