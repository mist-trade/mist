## 1. OpenSpec And Documentation Baseline

- [x] 1.1 Create OpenSpec proposal, design, and spec deltas for the full-QMT bridge.
- [x] 1.2 Add datasource documentation that replaces MiniQMT/`xtquant` guidance with full-QMT built-in Python guidance.
- [x] 1.3 Add Windows spike evidence templates for library/network capability and process/execution model.

## 2. Static Guardrails

- [x] 2.1 Add repository hygiene tests that forbid MiniQMT, `xtquant`, `QMT_SDK_PATH`, and XtQuant production references.
- [x] 2.2 Add bridge-script hygiene tests that forbid unverified third-party libraries, threads, processes, subprocesses, and WebSocket dependencies inside the QMT built-in script.
- [x] 2.3 Add account/trading boundary tests that reject QMT account, position, order, deal, cancel, and placement method exposure in the market datasource.

## 3. Command Gateway Scaffolding

- [x] 3.1 Add a datasource-side QMT command gateway with single-owner registration, heartbeat, queued commands, posted results, and timeout errors.
- [x] 3.2 Add unit tests for command ordering, single-owner locking, pending/no-work polling, result posting, and command timeout behavior.
- [x] 3.3 Add a stdlib-only QMT built-in Python bridge script that polls the command gateway and records spike output without imports that violate bridge hygiene.

## 4. Provider And Contract Scaffolding

- [x] 4.1 Update QMT provider capability metadata so live capabilities remain disabled or spike-blocked before Windows evidence exists.
- [x] 4.2 Add normalized QMT response fixtures and contract tests for spike-blocked provider responses.
- [x] 4.3 Add backend guard tests preventing product code from calling QMT bridge internals, raw command endpoints, MiniQMT, or `xtquant`.
- [x] 4.4 Update OpenSpec DAT bars scope for `1d`, `1m`, `5m` and TDX-style provider layering.
- [x] 4.5 Add QMT local DAT reader, normalizer, provider operation, and `/v1/bars/query provider=qmt` contract tests.
- [x] 4.6 Add guardrails that keep QMT DAT parsing out of route handlers and keep MiniQMT/`xtquant` out of production paths.

## 5. Windows Spike Execution

- [ ] 5.1 Run library/network spike on the Windows full-QMT machine and capture evidence.
- [ ] 5.2 Run WebSocket single-thread command-loop spike and capture datasource-pushed command/result evidence.
- [ ] 5.3 Run process/execution-model spike on the Windows full-QMT machine and capture evidence.
- [ ] 5.4 Verify full-QMT local DAT historical-bars reads, file-stability checks, and the default after-18:00 read block.
- [ ] 5.5 Update QMT bridge design defaults if spike evidence contradicts the single-owner polling assumptions.

## 6. Live Provider Enablement

- [ ] 6.1 Implement native full-QMT API command handlers from captured Windows shapes.
- [ ] 6.2 Promote non-account QMT API families behind normalized `/v1` provider routes.
- [ ] 6.3 Add Windows runtime smoke for full-QMT health, bars, snapshots, calendar, sectors, finance/reference/formula, and subscription behavior.
