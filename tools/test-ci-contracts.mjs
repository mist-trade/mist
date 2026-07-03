#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const workspaceRoot = resolve(
  process.env.MIST_WORKSPACE_ROOT ?? join(process.cwd(), '..'),
);

const repos = {
  mist: join(workspaceRoot, 'mist'),
  frontend: join(workspaceRoot, 'mist-fe'),
  datasource: join(workspaceRoot, 'mist-datasource'),
  monitoring: join(workspaceRoot, 'mist-monitoring'),
  skills: join(workspaceRoot, 'mist-skills'),
};

function fail(message) {
  throw new Error(message);
}

function read(path) {
  if (!existsSync(path)) {
    fail(`Missing expected file: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assertIncludes(content, expected, label) {
  if (!content.includes(expected)) {
    fail(`${label} must include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(content, unexpected, label) {
  if (content.includes(unexpected)) {
    fail(`${label} must not include ${JSON.stringify(unexpected)}`);
  }
}

function assertNode24Nvm(repoPath, label) {
  const nvmrc = read(join(repoPath, '.nvmrc')).trim();
  if (nvmrc !== '24') {
    fail(`${label} .nvmrc must be 24, got ${JSON.stringify(nvmrc)}`);
  }
}

function assertPackageScript(packageJson, scriptName, expectedPart, label) {
  const script = packageJson.scripts?.[scriptName];
  if (!script) {
    fail(`${label} package.json must define scripts.${scriptName}`);
  }
  if (expectedPart && !script.includes(expectedPart)) {
    fail(
      `${label} scripts.${scriptName} must include ${JSON.stringify(expectedPart)}`,
    );
  }
  return script;
}

function assertPackageScriptConfigTargetsExist(packageJson, scriptName, label) {
  const script = packageJson.scripts?.[scriptName];
  if (!script) {
    return;
  }

  const configMatches = [...script.matchAll(/--config\s+([^\s]+)/g)];
  for (const match of configMatches) {
    const configPath = match[1].replace(/^['"]|['"]$/g, '');
    if (!existsSync(join(repos.mist, configPath))) {
      fail(
        `${label} scripts.${scriptName} references missing config ${JSON.stringify(configPath)}`,
      );
    }
  }
}

function assertBackendToolingHygiene(packageJson) {
  const lintStaged = packageJson['lint-staged'] ?? {};
  const lintStagedKeys = Object.keys(lintStaged);
  const coversMjs = lintStagedKeys.some((key) => key.includes('mjs'));
  if (!coversMjs) {
    fail('mist lint-staged must cover .mjs tool scripts');
  }

  const tsconfig = readJson(join(repos.mist, 'tsconfig.json'));
  if (tsconfig.compilerOptions?.forceConsistentCasingInFileNames !== true) {
    fail('mist tsconfig must enable forceConsistentCasingInFileNames');
  }

  const paths = tsconfig.compilerOptions?.paths ?? {};
  for (const pathKey of Object.keys(paths)) {
    if (pathKey.startsWith('@app/prompts')) {
      fail('mist tsconfig must not contain stale @app/prompts aliases');
    }
  }

  for (const [pathKey, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets)) {
      continue;
    }
    if (new Set(targets).size !== targets.length) {
      fail(`mist tsconfig path ${pathKey} must not contain duplicate targets`);
    }
  }
}

function assertBackendJestHygiene(packageJson) {
  const jestConfig = packageJson.jest ?? {};
  const collectCoverageFrom = jestConfig.collectCoverageFrom ?? [];
  for (const expected of [
    '!**/*.spec.ts',
    '!**/main.ts',
    '!**/*.config.*',
    '!**/.eslintrc.js',
  ]) {
    if (!collectCoverageFrom.includes(expected)) {
      fail(`mist jest.collectCoverageFrom must include ${expected}`);
    }
  }

  const testPathIgnorePatterns = jestConfig.testPathIgnorePatterns ?? [];
  const ignoresChanArchive = testPathIgnorePatterns.some((pattern) =>
    pattern.includes('apps/mist/src/chan/test/archive'),
  );
  if (!ignoresChanArchive) {
    fail('mist jest.testPathIgnorePatterns must ignore Chan test archive');
  }

  const chanTestDir = join(repos.mist, 'apps/mist/src/chan/test');
  const julyDiagnosticSpecs = [
    'july-2025-analysis.spec.ts',
    'july-2025-bi0-analysis.spec.ts',
    'july-2025-final-analysis.spec.ts',
    'july-2025-rollback-analysis.spec.ts',
    'july-2025-rollback-trace.spec.ts',
    'july-2025-root-cause.spec.ts',
    'july-29-aug-01-check.spec.ts',
    'wide-bi-july-2025.spec.ts',
  ];
  const directJulyDiagnostics = readdirSync(chanTestDir).filter((name) =>
    julyDiagnosticSpecs.includes(name),
  );
  if (directJulyDiagnostics.length > 0) {
    fail(
      `mist Chan July diagnostic specs must live under test/archive: ${directJulyDiagnostics.join(', ')}`,
    );
  }

  const missingArchivedDiagnostics = julyDiagnosticSpecs.filter(
    (name) => !existsSync(join(chanTestDir, 'archive', `${name}.archive`)),
  );
  if (missingArchivedDiagnostics.length > 0) {
    fail(
      `mist Chan July diagnostic specs must be preserved with .archive suffix: ${missingArchivedDiagnostics.join(', ')}`,
    );
  }
}

function assertNoSelectedBackendProductionConsoleCalls() {
  const selectedProductionFiles = [
    'apps/mist/src/collector/collector.service.ts',
    'libs/utils/src/services/data-source.service.ts',
  ];
  const consoleCallPattern = /\bconsole\.(?:log|warn|error|info|debug)\s*\(/g;

  for (const relativePath of selectedProductionFiles) {
    const content = read(join(repos.mist, relativePath));
    const matches = [...content.matchAll(consoleCallPattern)].map(
      (match) => match[0],
    );
    if (matches.length > 0) {
      fail(
        `${relativePath} must use NestJS Logger instead of console.*: ${matches.join(', ')}`,
      );
    }
  }
}

function assertBackendHttpConfigHygiene() {
  const utilsService = read(
    join(repos.mist, 'libs/utils/src/utils.service.ts'),
  );
  if (
    !/import\s+axios,\s*\{\s*AxiosInstance\s*\}\s+from\s+['"]axios['"]/.test(
      utilsService,
    )
  ) {
    fail('UtilsService must import AxiosInstance from axios');
  }
  if (
    !/createAxiosInstance\s*\([^)]*\)\s*:\s*AxiosInstance\s*\{/.test(
      utilsService,
    )
  ) {
    fail('UtilsService.createAxiosInstance must return AxiosInstance');
  }
  if (/createAxiosInstance\s*\([^)]*\)\s*:\s*any\s*\{/.test(utilsService)) {
    fail('UtilsService.createAxiosInstance must not return any');
  }

  const sourcesConstant = read(
    join(repos.mist, 'apps/mist/src/sources/constants.ts'),
  );
  assertIncludes(
    sourcesConstant,
    'DATASOURCE_HTTP_TIMEOUT_MS = 30000',
    'mist datasource HTTP timeout constants',
  );

  for (const relativePath of [
    'apps/mist/src/sources/east-money/east-money-source.service.ts',
    'apps/mist/src/sources/tdx/tdx-source.service.ts',
  ]) {
    const content = read(join(repos.mist, relativePath));
    assertIncludes(
      content,
      'DATASOURCE_HTTP_TIMEOUT_MS',
      `${relativePath} datasource timeout`,
    );
    const literalTimeoutPattern = /timeout:\s*30000\b/;
    if (literalTimeoutPattern.test(content)) {
      fail(`${relativePath} must use DATASOURCE_HTTP_TIMEOUT_MS for timeout`);
    }
  }
}

function assertBackendRuntimeSweep() {
  const collectorService = read(
    join(repos.mist, 'apps/mist/src/collector/collector.service.ts'),
  );
  assertNotIncludes(
    collectorService,
    'ISourceFetcher<any>',
    'mist CollectorService source fetcher typing',
  );
  assertIncludes(
    collectorService,
    'SourceFetcher = EastMoneySource | TdxSource',
    'mist CollectorService source fetcher typing',
  );

  const indicatorService = read(
    join(repos.mist, 'apps/mist/src/indicator/indicator.service.ts'),
  );
  assertNotIncludes(
    indicatorService,
    'String(query.period) as unknown as Period',
    'mist IndicatorService period query',
  );

  const tdxSource = read(
    join(repos.mist, 'apps/mist/src/sources/tdx/tdx-source.service.ts'),
  );
  assertNotIncludes(
    tdxSource,
    'normalizeTdxPeriodFormat',
    'mist TdxSource period mapping',
  );

  const tdxWebSocket = read(
    join(repos.mist, 'apps/mist/src/sources/tdx/tdx-websocket.service.ts'),
  );
  for (const expected of [
    'TDX_WS_RECONNECT_DELAY_MS',
    'TDX_WS_HEARTBEAT_INTERVAL_MS',
    'periodMappingService.fromSourceFormat',
  ]) {
    assertIncludes(tdxWebSocket, expected, 'mist TDX WebSocket runtime sweep');
  }
  for (const unexpected of [
    'private readonly reconnectDelay = 5000',
    'private readonly heartbeatIntervalMs = 30000',
  ]) {
    assertNotIncludes(
      tdxWebSocket,
      unexpected,
      'mist TDX WebSocket runtime sweep',
    );
  }

  const dataMcpService = read(
    join(repos.mist, 'apps/mcp-server/src/services/data-mcp.service.ts'),
  );
  const queryBuilderCalls = [
    ...dataMcpService.matchAll(/createQueryBuilder\('bar'\)/g),
  ];
  if (queryBuilderCalls.length !== 1) {
    fail(
      `DataMcpService must create bar query builders through one shared helper, found ${queryBuilderCalls.length}`,
    );
  }
  assertIncludes(
    dataMcpService,
    'LATEST_PERIOD_QUERIES',
    'mist DataMcpService latest data mapping',
  );
  assertNotIncludes(
    dataMcpService,
    "'1min': periodData[0]",
    'mist DataMcpService latest data mapping',
  );

  const websocketStrategy = read(
    join(
      repos.mist,
      'apps/mist/src/collector/strategies/websocket-collection.strategy.ts',
    ),
  );
  const saveRawCalls = [...websocketStrategy.matchAll(/saveRawKData\(/g)];
  if (saveRawCalls.length !== 1) {
    fail(
      `WebSocketCollectionStrategy must save TDX KData through one helper, found ${saveRawCalls.length}`,
    );
  }
  assertIncludes(
    websocketStrategy,
    'saveTdxKData',
    'mist WebSocketCollectionStrategy shared save helper',
  );

  const chanService = read(
    join(repos.mist, 'apps/mist/src/chan/chan.service.ts'),
  );
  assertIncludes(chanService, 'analyze(', 'mist ChanService analysis helper');

  const chanMcpService = read(
    join(repos.mist, 'apps/mcp-server/src/services/chan-mcp.service.ts'),
  );
  assertIncludes(
    chanMcpService,
    'this.chanService.analyze',
    'mist Chan MCP analysis helper',
  );

  const biService = read(
    join(repos.mist, 'apps/mist/src/chan/services/bi.service.ts'),
  );
  if (/(?:startFenxing|endFenxing)!\./.test(biService)) {
    fail('BiService merge paths must use explicit Fenxing invariant guards');
  }
  assertIncludes(
    biService,
    'assertCompleteBi',
    'mist BiService invariant guard',
  );

  const efExtension = read(
    join(repos.mist, 'libs/shared-data/src/entities/k-extension-ef.entity.ts'),
  );
  if (/=\s*0n?;/.test(efExtension)) {
    fail('KExtensionEf nullable fields must default to null, not 0 or 0n');
  }
}

function assertEnvFilesUntracked() {
  const tracked = execFileSync(
    'git',
    ['ls-files', '.env.development', '.env.production'],
    {
      cwd: repos.mist,
      encoding: 'utf8',
    },
  ).trim();

  if (tracked) {
    fail(`mist local env files must not be tracked, still tracked: ${tracked}`);
  }
}

function assertOptionalRepoContracts(repoName, assertContracts) {
  const repoPath = repos[repoName];
  if (!existsSync(repoPath)) {
    console.log(
      `Skipping ${repoName} CI contracts; repo not found at ${repoPath}`,
    );
    return;
  }
  assertContracts();
}

function assertMistBackendContracts() {
  const packageJson = readJson(join(repos.mist, 'package.json'));
  assertNode24Nvm(repos.mist, 'mist');
  if (packageJson.engines?.node !== '>=24.0.0') {
    fail('mist package.json engines.node must be >=24.0.0');
  }

  const lintFix = assertPackageScript(packageJson, 'lint', '--fix', 'mist');
  const lintCheck = assertPackageScript(
    packageJson,
    'lint:check',
    undefined,
    'mist',
  );
  assertNotIncludes(lintCheck, '--fix', 'mist scripts.lint:check');
  assertIncludes(lintFix, 'eslint', 'mist scripts.lint');
  assertPackageScript(packageJson, 'typecheck', 'tsc --noEmit', 'mist');
  assertPackageScript(packageJson, 'test:ci', '--runInBand', 'mist');
  assertPackageScript(
    packageJson,
    'ci:contracts',
    'tools/test-ci-contracts.mjs',
    'mist',
  );
  assertPackageScriptConfigTargetsExist(packageJson, 'test:e2e', 'mist');
  assertBackendToolingHygiene(packageJson);
  assertBackendJestHygiene(packageJson);
  assertNoSelectedBackendProductionConsoleCalls();
  assertBackendHttpConfigHygiene();
  assertBackendRuntimeSweep();

  const gitignore = read(join(repos.mist, '.gitignore'));
  assertIncludes(gitignore, '.env.*', 'mist .gitignore');
  assertIncludes(gitignore, '!.env.example', 'mist .gitignore');
  assertEnvFilesUntracked();

  const dockerWorkflow = read(join(repos.mist, '.github/workflows/docker.yml'));
  assertIncludes(dockerWorkflow, 'validate:', 'mist docker workflow');
  assertIncludes(dockerWorkflow, 'needs: validate', 'mist docker workflow');
  assertIncludes(dockerWorkflow, 'node-version: 24.x', 'mist docker workflow');
  assertIncludes(dockerWorkflow, 'pnpm run lint:check', 'mist docker workflow');
  assertIncludes(dockerWorkflow, 'pnpm run typecheck', 'mist docker workflow');
  assertIncludes(dockerWorkflow, 'pnpm run test:ci', 'mist docker workflow');
  assertIncludes(
    dockerWorkflow,
    'pnpm run ci:contracts',
    'mist docker workflow',
  );

  const releaseWorkflow = read(
    join(repos.mist, '.github/workflows/release.yml'),
  );
  assertIncludes(releaseWorkflow, 'validate:', 'mist release workflow');
  assertIncludes(releaseWorkflow, 'needs: validate', 'mist release workflow');
  assertIncludes(
    releaseWorkflow,
    'environment: production-release',
    'mist release workflow',
  );
  assertIncludes(
    releaseWorkflow,
    'node-version: 24.x',
    'mist release workflow',
  );
  assertIncludes(
    releaseWorkflow,
    'pnpm run lint:check',
    'mist release workflow',
  );
  assertIncludes(
    releaseWorkflow,
    'pnpm run typecheck',
    'mist release workflow',
  );
  assertIncludes(releaseWorkflow, 'pnpm run test:ci', 'mist release workflow');
  assertIncludes(
    releaseWorkflow,
    'pnpm run ci:contracts',
    'mist release workflow',
  );

  const buildWorkflow = read(join(repos.mist, '.github/workflows/build.yml'));
  assertIncludes(buildWorkflow, 'pnpm run lint:check', 'mist build workflow');
  assertIncludes(buildWorkflow, 'pnpm run typecheck', 'mist build workflow');
  assertIncludes(buildWorkflow, 'pnpm run test:ci', 'mist build workflow');
}

function assertFrontendContracts() {
  const packageJson = readJson(join(repos.frontend, 'package.json'));
  assertNode24Nvm(repos.frontend, 'mist-fe');
  if (packageJson.engines?.node !== '>=24.0.0') {
    fail('mist-fe package.json engines.node must be >=24.0.0');
  }
  assertPackageScript(packageJson, 'typecheck', 'tsc --noEmit', 'mist-fe');
  assertPackageScript(packageJson, 'test:ci', '--runInBand', 'mist-fe');

  const workflow = read(join(repos.frontend, '.github/workflows/docker.yml'));
  assertIncludes(workflow, 'validate:', 'mist-fe docker workflow');
  assertIncludes(workflow, 'needs: validate', 'mist-fe docker workflow');
  assertIncludes(workflow, 'node-version: 24.x', 'mist-fe docker workflow');
  assertIncludes(workflow, 'pnpm lint', 'mist-fe docker workflow');
  assertIncludes(workflow, 'pnpm run typecheck', 'mist-fe docker workflow');
  assertIncludes(workflow, 'pnpm run test:ci', 'mist-fe docker workflow');
  assertIncludes(
    workflow,
    'default: node:24-alpine',
    'mist-fe docker workflow',
  );
}

function assertDatasourceContracts() {
  const workflow = read(join(repos.datasource, '.github/workflows/ci.yml'));
  assertIncludes(
    workflow,
    'python-version: "3.12"',
    'mist-datasource CI workflow',
  );
  assertIncludes(
    workflow,
    'uv run ruff check .',
    'mist-datasource CI workflow',
  );
  assertIncludes(
    workflow,
    'uv run pytest -m "not live"',
    'mist-datasource CI workflow',
  );
}

function assertMonitoringContracts() {
  const workflow = read(join(repos.monitoring, '.github/workflows/ci.yml'));
  assertIncludes(
    workflow,
    'go-version-file: go.mod',
    'mist-monitoring CI workflow',
  );
  assertIncludes(workflow, 'gofmt -l .', 'mist-monitoring CI workflow');
  assertIncludes(workflow, 'exit 1', 'mist-monitoring CI workflow');
  assertIncludes(workflow, 'go vet ./...', 'mist-monitoring CI workflow');
  assertIncludes(workflow, 'go test ./...', 'mist-monitoring CI workflow');
  assertIncludes(
    workflow,
    'python -m pytest tests',
    'mist-monitoring CI workflow',
  );
}

function assertSkillsContracts() {
  const workflow = read(join(repos.skills, '.github/workflows/ci.yml'));
  assertIncludes(workflow, 'python-version: "3.12"', 'mist-skills CI workflow');
  assertIncludes(
    workflow,
    'uv sync --frozen --extra dev',
    'mist-skills CI workflow',
  );
  assertIncludes(workflow, 'uv run ruff check .', 'mist-skills CI workflow');
  assertIncludes(workflow, 'uv run pyright', 'mist-skills CI workflow');
  assertIncludes(workflow, 'uv run black --check .', 'mist-skills CI workflow');
  assertIncludes(workflow, 'uv run pytest', 'mist-skills CI workflow');
}

assertMistBackendContracts();
assertOptionalRepoContracts('frontend', assertFrontendContracts);
assertOptionalRepoContracts('datasource', assertDatasourceContracts);
assertOptionalRepoContracts('monitoring', assertMonitoringContracts);
assertOptionalRepoContracts('skills', assertSkillsContracts);

console.log('CI release contract checks passed.');
