## Context

`CollectorService` currently writes collection success, empty data, and failure
messages through global `console.*`, while nearby collection strategies already
use NestJS `Logger`. `DataSourceService` also uses `console.warn` when
`DEFAULT_DATA_SOURCE` is invalid. The review findings ask for production logging
to be uniform, especially in collection paths.

## Goals / Non-Goals

**Goals:**

- Use class-scoped NestJS `Logger` instances in selected backend production
  services.
- Preserve existing log message content and error rethrow behavior.
- Add unit tests that assert Logger calls on success, warning, and failure
  paths.
- Add a contract check that blocks `console.*` from returning to the selected
  production files.

**Non-Goals:**

- Do not redesign the collector/fetcher/strategy layering.
- Do not change error handling semantics or response payloads.
- Do not remove console output from diagnostic specs or README examples.

## Decisions

1. **Use private class-scoped `Logger` fields.**
   This matches existing NestJS patterns in strategies and avoids injecting a
   logging abstraction through every test module for a narrow hygiene fix.

2. **Mock `Logger.prototype` methods in focused unit tests.**
   The behavior to prove is that the service writes through NestJS Logger. The
   tests can spy on `Logger.prototype.warn/log/error` without exposing
   test-only methods or constructor parameters.

3. **Keep a static contract in `tools/test-ci-contracts.mjs`.**
   Unit tests prove important runtime branches; the contract catches accidental
   direct `console.*` reintroduction in the selected production files.

## Risks / Trade-offs

- Logger spies can affect other tests if not restored -> each focused test uses
  `jest.spyOn` and restores mocks through the existing cleanup path.
- Static contracts can be too broad -> the contract is scoped only to selected
  production service files, not test fixtures or documentation examples.
