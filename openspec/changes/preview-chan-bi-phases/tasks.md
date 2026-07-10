## 1. Phase-aware snapshot boundary

- [ ] 1.1 Add a typed `{ phaseA, phaseB }` snapshot Bi contract and normalize
  both legacy array and canonical object fixtures in the frontend loader.
- [ ] 1.2 Update chart-data conversion so both normalized Bi phases become
  independently usable `IFetchBi[]` arrays without changing KPanel props.
- [ ] 1.3 Add focused loader/conversion tests for legacy fixtures, canonical
  fixtures, and malformed phase-aware fixtures.

## 2. Regression-console phase selection

- [ ] 2.1 Add accessible Phase A and Phase B controls to `/chan-tests`,
  defaulting to Phase B and retaining the selection when a case changes.
- [ ] 2.2 Show Phase A and Phase B Bi counts in the statistics panel with a
  compatible fallback for existing metadata.
- [ ] 2.3 Add component coverage proving the default selected overlay and the
  overlay passed after switching Phase A.

## 3. Canonical fixture generation

- [ ] 3.1 Update the snapshot generator to accept either legacy-array or
  phase-aware backend Bi responses and write canonical phase data plus counts.
- [ ] 3.2 Regenerate or deterministically derive the registered phase-aware Bi
  fixtures from the current algorithm while retaining non-Bi snapshot layers.
- [ ] 3.3 Assert the Shanghai fixture exposes the retained `2024-10-07 →
  2024-10-15` Invalid Phase A Bi and the `2024-10-07 → 2025-01-12` Valid Phase
  B Bi.

## 4. Verification and review handoff

- [ ] 4.1 Run focused frontend unit and component tests, then typecheck, lint,
  and production build.
- [ ] 4.2 Verify `/chan-tests` in the local browser: Phase B is initially
  selected, both counts are visible, switching phases updates the view, and no
  browser errors occur.
- [ ] 4.3 Validate the OpenSpec change strictly and record the completed
  evidence in the handoff.
