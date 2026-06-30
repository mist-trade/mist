## Why

`securities.code` is documented as a provider-neutral pure security code, while `security_source_configs.format_code` is documented as the provider-specific transport code. Current service code and tests do not consistently enforce that boundary, and production data already shows duplicate TDX source configs for the same security.

This can create duplicate logical securities, ambiguous source selection, repeated subscriptions, and incorrect streaming/K-line association if provider-formatted symbols leak into internal identity.

## What Changes

- Define and enforce canonical `Security.code` semantics: internal security identity is provider-neutral and must not include provider market decorations such as `.SH`, `.SZ`, `SH`, or `SZ`.
- Define `SecuritySourceConfig.formatCode` as provider-specific transport format used only when calling external data providers.
- Add shared normalization utilities for converting provider symbols to canonical security codes.
- Update security lookup/initialization/source-config APIs to use canonical security codes consistently.
- Make source-config creation idempotent by upserting one active config per security/source instead of blindly inserting duplicates.
- Add data-cleanup guidance for existing duplicate `security_source_configs` rows.
- Do not change K-line storage identity: `K.securityId` remains the durable foreign key to `securities.id`.

## Capabilities

### New Capabilities

- `security-code-identity`: Canonical security-code semantics and provider-specific source-code configuration.

### Modified Capabilities

- None.

## Impact

- Backend security service and controller behavior for initialize/find/activate/deactivate/source config operations.
- Collector and streaming code paths that convert provider symbols back to internal security identity.
- Shared utility package for security-code normalization.
- MySQL `securities` and `security_source_configs` data hygiene; likely requires deleting duplicate source-config rows and optionally adding a uniqueness constraint.
- Tests and docs that currently use provider-formatted values as `Security.code`.
