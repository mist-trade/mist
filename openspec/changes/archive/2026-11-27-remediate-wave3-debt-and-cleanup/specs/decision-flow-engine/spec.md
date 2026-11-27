## ADDED Requirements

### Requirement: Decision Flow Validation Enforces Unique Node IDs And Required Node Fields
The compilation boundary (`validateDecisionFlowTree` and `collectPluginReferences`) SHALL fail closed with `StoredDefinitionCompileError('DECISION_FLOW_RULE_INVALID', ...)` when:
- Any two distinct node objects share the same `node.id` (while permitting intentional shared-reference DAG nodes);
- A `GUARD` or `EXTRACTOR` node lacks a non-empty string `pluginId`, an `EXTRACTOR` lacks a non-empty string `exportAttributeKey`, a `BRANCH` lacks a valid `condition` object (or has an empty string `condition.pluginId`), or a `TERMINAL` has an invalid `action`.
- `collectPluginReferences` SHALL include `BRANCH.condition.pluginId` when declared so context derivation validates every referenced plugin.

#### Scenario: Duplicate node ID across distinct nodes fails closed
- **WHEN** `validateDecisionFlowTree` validates a tree containing two distinct node objects with identical `id`
- **THEN** it MUST throw `StoredDefinitionCompileError` with code `'DECISION_FLOW_RULE_INVALID'`
