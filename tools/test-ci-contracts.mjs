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
  assertIncludes(workflow, 'gofmt -w', 'mist-monitoring CI workflow');
  assertIncludes(
    workflow,
    'git diff --exit-code',
    'mist-monitoring CI workflow',
  );
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
