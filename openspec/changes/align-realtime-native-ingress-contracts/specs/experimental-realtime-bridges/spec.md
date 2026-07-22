## REMOVED Requirements

### Requirement: TDX builtin realtime is always active and QMT is independently gated
**Reason**: The experimental activation contract is superseded by formal dual-source builtin production realtime.
**Migration**: Use `realtime-market-data-ingress`; configure production QMT as `builtin` and retain `off` only for explicit rollback.

### Requirement: Experimental snapshots are fenced and strict
**Reason**: Formal schema v1 native frames and per-symbol fencing replace the draft transport.
**Migration**: Use the strict framing and fencing requirements in `realtime-market-data-ingress` and `datasource-provider-contract`.

### Requirement: Experimental transports have no K or business side effects
**Reason**: Side-effect isolation is now an explicit formal ingress requirement and will later be changed only by a separate productization capability.
**Migration**: Use `realtime-market-data-ingress` transport acceptance isolation.

### Requirement: Theme A completion requires Windows evidence
**Reason**: Theme A is complete and archived; new breaking contracts require new HIL rather than reopening Theme A.
**Migration**: Use the Windows HIL gate in `realtime-market-data-ingress`.

### Requirement: Experimental activation is reversible and evidence is phased
**Reason**: Formal deployment, evidence and rollback workflows replace experimental mode switching.
**Migration**: Use formal realtime workflow names and the production baseline requirements.

### Requirement: Windows restart domains are independently recoverable
**Reason**: Restart recovery remains required but is now owned by formal realtime runtime safety and deployment evidence.
**Migration**: Preserve independent datasource/terminal recovery while updating current workflow contracts to formal naming.
