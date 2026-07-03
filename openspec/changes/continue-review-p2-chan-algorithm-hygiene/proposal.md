## Why

`BiService` remains the largest Chan algorithm hotspot and still repeats the
same merged-K range aggregation across candidate, two-Bi, and three-Bi paths.
The previous P2 pass fixed the known splice bug and invariant guard, but the
algorithm still needs a focused hygiene pass before larger Chan changes become
safe.

## What Changes

- Select and close `REVIEW_ITEM_INVENTORY` Chan algorithm items `H3` and
  `D1.7` for this batch.
- Add behavior-locking tests around public `getBi` output and private Bi
  construction helpers before refactoring.
- Move repeated merged-K range aggregation into a single testable helper or
  small module.
- Route candidate Bi, two-Bi merge, three-Bi merge, and unfinished Bi
  construction through the shared aggregation path.
- Keep public `ChanService`, controller, DTO, entity, and response shapes
  unchanged.
- Record evidence mapping review IDs to files and verification commands.

## Capabilities

### New Capabilities

- `chan-bi-algorithm-hygiene`: Internal quality and regression requirements for
  the Chan Bi algorithm implementation.

### Modified Capabilities

None.

## Impact

- Affected code:
  - `apps/mist/src/chan/services/bi.service.ts`
  - optional extracted helper under `apps/mist/src/chan/services/`
  - focused Chan algorithm unit tests
- Affected review IDs:
  - `CODE_REVIEW H3`
  - `CODE_SMELL_REVIEW D1.7`
- No database, HTTP API, datasource, deployment, or frontend behavior changes
  are intended.
