## ADDED Requirements

### Requirement: Production baseline records formal dual-source realtime state
The refreshed production baseline SHALL record TDX and QMT as formal builtin realtime sources after their contract, HIL and rollback gates pass.

#### Scenario: Final production baseline is captured
- **WHEN** the formal realtime release is accepted
- **THEN** evidence records exact repository/image/bridge identities, `QMT_REALTIME_MODE=builtin`, source allowlists, owner/epoch state and monitoring convergence

#### Scenario: QMT is temporarily rolled back
- **WHEN** the baseline is captured while an approved rollback has set QMT to `off`
- **THEN** the evidence identifies the operator action, backup identifier, reason and recovery command and MUST NOT describe `off` as the target default

### Requirement: Protected tables remain unchanged during ingress promotion
The formal ingress deployment and HIL SHALL compare deterministic row counts and digests for protected MySQL tables before and after every source phase.

#### Scenario: Ingress-only verification completes
- **WHEN** TDX or QMT baseline, enabled, restart or rollback evidence is accepted
- **THEN** `k`, provider K extensions, strategy signals and alert-event protected digests remain identical
