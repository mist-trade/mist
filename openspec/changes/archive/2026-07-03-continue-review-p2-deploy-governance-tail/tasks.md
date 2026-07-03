## 1. Red Tests

- [x] 1.1 Add a deploy script test that fails until PowerShell defaults are
      centralized in a shared module.
- [x] 1.2 Add a Mac watchdog test that fails until shell defaults are centralized.
- [x] 1.3 Add a Pester-compatible behavior test entry point that fails until it
      can load and assert deploy defaults.

## 2. Implementation

- [x] 2.1 Add shared PowerShell and shell deploy defaults modules.
- [x] 2.2 Update deploy PowerShell scripts to use shared defaults while
      preserving existing parameter overrides.
- [x] 2.3 Update the Mac watchdog deploy script to use shared shell defaults.
- [x] 2.4 Add a local PowerShell runner for the Pester-compatible tests when
      Pester is unavailable.

## 3. Evidence And Inventory

- [x] 3.1 Run deploy PowerShell and shell tests.
- [x] 3.2 Validate the OpenSpec change.
- [x] 3.3 Record evidence for optional M6.1/S6 governance and update
      `REVIEW_ITEM_INVENTORY.md` remaining status.
