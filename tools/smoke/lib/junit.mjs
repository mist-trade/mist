// mist/tools/smoke/lib/junit.mjs
// 生成 JUnit XML 报告。CI（GitHub Actions）可解析并标注每个端点的 pass/fail。

import { writeFileSync } from 'node:fs';

/**
 * @param {Object} suite
 * @param {string} suite.name
 * @param {Array} suite.cases - [{name, passed, time, failureMessage?}]
 * @param {string} outputPath
 */
export function writeJunitReport(suite, outputPath) {
  const failures = suite.cases.filter((c) => !c.passed).length;
  const totalTime = suite.cases.reduce((s, c) => s + (c.time || 0), 0);

  const cases = suite.cases
    .map((c) => {
      const failure = c.passed
        ? ''
        : `
      <failure message="${escapeXml(c.failureMessage || 'smoke assertion failed')}"><![CDATA[${c.failureMessage || ''}]]></failure>`;
      return `    <testcase name="${escapeXml(c.name)}" time="${(c.time || 0).toFixed(3)}">${failure}
    </testcase>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="${escapeXml(suite.name)}" tests="${suite.cases.length}" failures="${failures}" time="${totalTime.toFixed(3)}">
${cases}
  </testsuite>
</testsuites>`;

  writeFileSync(outputPath, xml, 'utf8');
}

function escapeXml(s) {
  return String(s).replace(
    /[<>&'"]/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
      })[c],
  );
}
