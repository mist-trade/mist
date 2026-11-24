/**
 * 黄金文件回放门禁（REQ-ISO-04）。
 *
 * 每个场景 fixture = 场景输入 + 期望决策日志。回放结果与基线逐字段比对，
 * 任何语义变化在此显式失败并要求人工审查；重生成基线必须显式
 * `UPDATE_GOLDEN=1 npx jest ...golden`，禁止静默重生成。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  runGoldenScenario,
  type GoldenScenario,
  type SerializedLogEntry,
} from './golden';

const fixtureDir = path.join(__dirname, '__fixtures__');

describe('trading 黄金文件回放', () => {
  const files = fs
    .readdirSync(fixtureDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  it('fixture 目录非空（基线缺失即门禁失效）', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(files)('%s', (file) => {
    const fixturePath = path.join(fixtureDir, file);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
      name: string;
      scenario: GoldenScenario;
      expected: readonly SerializedLogEntry[];
    };

    it('决策日志与黄金基线逐字段一致', () => {
      const log = runGoldenScenario(fixture.scenario);
      if (process.env.UPDATE_GOLDEN === '1') {
        fs.writeFileSync(
          fixturePath,
          `${JSON.stringify({ ...fixture, expected: log }, null, 2)}\n`,
        );
      }
      expect(log).toEqual(fixture.expected);
    });
  });
});
