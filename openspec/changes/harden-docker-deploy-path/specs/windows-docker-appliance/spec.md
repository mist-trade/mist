## ADDED Requirements

### Requirement: Production app image tags are explicit

The Windows Docker deployment SHALL require explicit backend and frontend app
image tags for production workflow dispatches and deployment script runs.

#### Scenario: Operator dispatches production deploy workflow

- **WHEN** the operator runs `Deploy Windows Mist Stack`
- **THEN** backend and frontend image tag inputs MUST be supplied explicitly
- **AND** the workflow MUST NOT default either app image tag to `latest`

#### Scenario: Deployment script receives app tags

- **WHEN** `deploy-docker-appliance.ps1` prepares the Docker root
- **THEN** it MUST reject blank backend or frontend app image tags
- **AND** it MUST reject `latest` unless an explicit development override is
  added in a future change

### Requirement: Deployment records successful app image tags

The Windows Docker deployment SHALL persist the last successful backend and
frontend app image tags under the Docker deployment root after a healthy deploy.

#### Scenario: Deployment completes successfully

- **WHEN** migrations, app startup, health checks, and diagnostics complete
- **THEN** the deploy script MUST write the deployed backend image tag and
  frontend image tag to a deploy-history file under `E:\quant\MistDocker`
- **AND** the deploy-history file MUST NOT include database passwords,
  datasource paths, or GitHub tokens

### Requirement: Rollback falls back to recorded successful tags

The Windows Docker deployment SHALL use explicit previous tags first and then
recorded successful tags when rolling back a failed app rollout.

#### Scenario: Failure occurs with explicit previous tags

- **WHEN** deployment fails after the Docker root is prepared
- **AND** `previous_image_tag` or `previous_frontend_image_tag` is supplied
- **THEN** rollback MUST restore the supplied tag values before restarting app
  services

#### Scenario: Failure occurs without explicit previous tags

- **WHEN** deployment fails after the Docker root is prepared
- **AND** deploy-history contains a prior backend or frontend app tag
- **THEN** rollback MUST restore the recorded successful tag before restarting
  app services

#### Scenario: Failure occurs without any rollback tag

- **WHEN** deployment fails and neither explicit nor recorded rollback tags are
  available
- **THEN** rollback MUST NOT restart app services with the failed tag
- **AND** the deploy script MUST keep the original deployment failure visible to
  the caller

### Requirement: Diagnostics failures do not block rollback

The Windows Docker deployment SHALL keep diagnostic collection separate from
rollback control flow.

#### Scenario: Deployment fails and diagnostics also fail

- **WHEN** the deploy script enters the failure handler
- **AND** diagnostic collection throws an error
- **THEN** the script MUST warn about the diagnostics failure
- **AND** it MUST still attempt rollback
- **AND** it MUST rethrow the original deployment failure rather than the
  diagnostics failure

### Requirement: Web gateway image source policy is explicit

The Windows Docker deployment SHALL keep the nginx web gateway image
configurable and document the current mirror default used by the Windows runner.

#### Scenario: Operator uses default gateway image

- **WHEN** no custom `web_gateway_image` input or `WEB_GATEWAY_IMAGE` value is
  supplied
- **THEN** the deployment MAY use the documented
  `docker.m.daocloud.io/library/nginx:1.27-alpine` mirror default
- **AND** docs MUST state that Docker Hub image pull failures can use this
  mirror while GitHub Actions archive download failures are unrelated

#### Scenario: Operator pins a gateway image

- **WHEN** the operator supplies a gateway image with a digest or private mirror
- **THEN** the workflow and deploy script MUST pass that exact value to
  `WEB_GATEWAY_IMAGE`
- **AND** the compose template MUST use the configured value without rewriting
  it
