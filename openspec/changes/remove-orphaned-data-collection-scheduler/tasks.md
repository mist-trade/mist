## 1. Lifecycle prerequisite and fresh inventory

- [ ] 1.1 Confirm `experimental-tdx-realtime-slice` task 7.2 has reached a
      recorded accepted-HIL or reference-quarantine outcome; record the
      evidence path and prerequisite Mist commit before editing scheduler code.
- [ ] 1.2 Update from the then-current `master` and search all active source,
      Nest metadata/providers, barrels, scripts, tests, and current docs for
      `DataCollectionScheduler` and its lifecycle methods.
- [ ] 1.3 Record an orphan proof showing no production construction,
      injection, dynamic load, or call site; stop and revise the design if a
      runtime consumer is found.

## 2. Narrow scheduler removal

- [ ] 2.1 Delete `data-collection.scheduler.ts` and
      `data-collection.scheduler.spec.ts` together.
- [ ] 2.2 Remove or correct scheduler-specific comments and exports identified
      by the inventory, including the stale `DataSourceSelectionService`
      ownership comment.
- [ ] 2.3 Audit scheduler-adjacent `IDataCollectionStrategy` methods and record
      why each is retained or separately deferred; do not change active
      schedule-controller, polling-strategy, scan, or realtime behavior.
- [ ] 2.4 Add a focused static regression assertion that prevents the orphaned
      scheduler symbol or provider registration from returning to active
      backend source.

## 3. Verification and handoff

- [ ] 3.1 Run focused schedule-controller, polling-strategy, mode-matrix, and
      relevant repository-hygiene tests.
- [ ] 3.2 Run full Mist tests with coverage, typecheck, lint, CI release
      contracts, `openspec validate remove-orphaned-data-collection-scheduler
      --strict`, and `git diff --check`.
- [ ] 3.3 Re-run the repository-wide scheduler reference search, attach the
      before/after evidence, confirm public/runtime behavior is unchanged, and
      commit the cleanup as an independently revertible change.
