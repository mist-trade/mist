## Context

The active production path is a Windows Docker stack plus host-side TDX
datasource service. Defaults such as `E:\quant\MistDocker`,
`F:\quant\MistAPI\datasource`, `www.moyui.mist`, and datasource health URLs are
intentional production defaults, but they are spread through script parameter
blocks, workflow defaults, README examples, and tests. M6.1 required the runtime
values to be configurable; this tail improves maintainability by making the
source of defaults explicit.

S6 requested a gradual move from pure source-string tests toward behavior
coverage. Existing tests already parse temp env files and rendered compose
config, but there is no Pester entry point. This change adds Pester-compatible
tests without requiring all existing PowerShell tests to be rewritten at once.

## Goals / Non-Goals

**Goals:**

- Centralize deploy-related defaults in shared script modules.
- Preserve every current default value and workflow input behavior.
- Add Pester-compatible tests that dot-source scripts/modules and assert real
  loaded defaults or helper behavior.
- Keep existing source-string tests where they guard workflow YAML or static
  script contracts.

**Non-Goals:**

- Do not change Windows install paths, ports, hostnames, service names, image
  tags, or the Docker/host datasource boundary.
- Do not force CI to install Pester in unrelated repositories.
- Do not expand datasource live replay beyond the already completed T9 fixture.

## Decisions

1. Use `scripts/common/deploy-defaults.ps1` for PowerShell defaults.

   This keeps Windows script defaults close to existing `deploy-common.ps1`
   helpers and avoids adding a config parser dependency. Scripts still expose
   explicit parameters so workflows and operators can override values normally.

2. Use `scripts/common/deploy-defaults.sh` for shell defaults.

   The Mac watchdog deploy script is bash, so sharing the PowerShell module
   directly would add needless complexity. A small shell defaults file keeps the
   source explicit and easy to test.

3. Add a Pester-style test file plus a lightweight runner fallback.

   Some local machines may not have Pester installed. The test file should be
   valid Pester syntax, and a repository script can execute the same assertions
   directly when Pester is unavailable. This upgrades S6 without making local
   validation brittle.

## Risks / Trade-offs

- Default module indirection can make simple scripts harder to scan.
  Mitigation: keep variable names explicit and use defaults only in parameter
  initializers.
- Pester may not be installed on the Mac runner.
  Mitigation: provide a direct PowerShell runner for the same behavior
  assertions and document the optional Pester path.
