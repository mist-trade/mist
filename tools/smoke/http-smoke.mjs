// mist/tools/smoke/http-smoke.mjs
// mist 后端 HTTP 路由冒烟 runner。
// 用法：node tools/smoke/http-smoke.mjs [--junit=path] [--base=url]

import { loadInventory, resolveBodyPlaceholders } from './lib/yaml-loader.mjs';
import { assertResponse } from './lib/assertions.mjs';
import { writeJunitReport } from './lib/junit.mjs';

const args = parseArgs(process.argv.slice(2));
const junitPath = args.junit || 'build/smoke-mist.xml';

const endpoints = loadInventory({
  repo: 'mist',
  baseOverride: { base: args.base },
});

console.log(`mist smoke: ${endpoints.length} endpoints to probe`);

/** @type {Map<string, any>} 已执行端点的 data（按 id 索引，供 prereq 占位符引用） */
const responses = new Map();
const cases = [];
let passed = 0,
  failed = 0;

for (const ep of endpoints) {
  const t0 = Date.now();
  const body = resolveBodyPlaceholders(ep.body, responses);
  try {
    const res = await fetch(ep.url, {
      method: ep.method,
      headers: ep.body ? { 'Content-Type': 'application/json' } : {},
      body: ep.body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    const elapsed = (Date.now() - t0) / 1000;

    // 记录响应 data 供后续 prereq 占位符使用
    if (ep.id && json?.data !== undefined) responses.set(ep.id, json.data);

    const assertions = assertResponse(res.status, json, ep.expect);
    const allPassed = assertions.every((a) => a.passed);
    const failedOnes = assertions.filter((a) => !a.passed);

    if (allPassed) {
      passed++;
      console.log(`  ✓ ${ep.id}  (${elapsed.toFixed(2)}s)`);
    } else {
      failed++;
      console.log(`  ✗ ${ep.id}  (${elapsed.toFixed(2)}s)`);
      for (const a of failedOnes) console.log(`      - ${a.message}`);
    }

    cases.push({
      name: `${ep.method} ${ep.path} [${ep.id}]`,
      passed: allPassed,
      time: elapsed,
      failureMessage: allPassed
        ? undefined
        : failedOnes.map((a) => a.message).join('; '),
    });
  } catch (err) {
    failed++;
    const elapsed = (Date.now() - t0) / 1000;
    console.log(`  ✗ ${ep.id}  ERROR: ${err.message}`);
    cases.push({
      name: `${ep.method} ${ep.path} [${ep.id}]`,
      passed: false,
      time: elapsed,
      failureMessage: `fetch error: ${err.message}`,
    });
  }
}

writeJunitReport({ name: 'mist-http-smoke', cases }, junitPath);
console.log(
  `\nmist smoke: ${passed} passed, ${failed} failed  (junit: ${junitPath})`,
);

if (failed > 0) process.exit(1);

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
