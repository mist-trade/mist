## ADDED Requirements

### Requirement: TypeORM schema synchronization is disabled

All Mist NestJS applications SHALL disable TypeORM automatic schema
synchronization explicitly and SHALL NOT derive `synchronize` from `NODE_ENV`.

#### Scenario: App database options are built in any environment

- **WHEN** an app configures `TypeOrmModule.forRootAsync`
- **THEN** the returned TypeORM options MUST contain `synchronize: false`
- **AND** the value MUST NOT depend on the runtime environment name

### Requirement: Schema changes use repository migrations

Database schema changes SHALL be represented by repository SQL migrations and
SHALL NOT rely on runtime TypeORM synchronization.

#### Scenario: A database schema fix is required

- **WHEN** an entity change requires a database DDL change
- **THEN** the change MUST include or reference an explicit SQL migration under
  `deploy/database/migrations`
- **AND** tests or substitute verification MUST cover the migration contract

### Requirement: Extension entity metadata matches migration schema

Extension entity metadata SHALL match the SQL migration schema for one-to-one
`k_id` ownership and numeric field types.

#### Scenario: Extension entity declares the `k_id` relationship

- **WHEN** an extension table has a one-to-one relationship with `k`
- **THEN** the entity MUST expose a `kId` column mapped to `k_id`
- **AND** the migration MUST enforce a unique key on that `k_id`

#### Scenario: Extension entity declares numeric provider fields

- **WHEN** a provider payload and migration column represent a decimal numeric
  field
- **THEN** the TypeScript entity property MUST use a number-compatible type
- **AND** tests MUST guard against bigint/entity-column mismatches
