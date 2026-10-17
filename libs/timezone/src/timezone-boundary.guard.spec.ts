import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repositoryRoot = process.cwd();

function collectTypescriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.data') {
        return [];
      }
      return collectTypescriptFiles(fullPath);
    }
    return fullPath.endsWith('.ts') && !fullPath.endsWith('.d.ts')
      ? [fullPath]
      : [];
  });
}

const productionFiles = [
  ...collectTypescriptFiles(join(repositoryRoot, 'apps')),
  ...collectTypescriptFiles(join(repositoryRoot, 'libs')),
].filter((file) => !file.endsWith('.spec.ts'));

describe('Timezone & Date Utilities Boundary Guard (全仓时区与日期工具刚性门禁)', () => {
  it('productionFiles 集合必须覆盖核心 apps 和 libs 生产代码', () => {
    expect(productionFiles.length).toBeGreaterThan(50);
  });

  describe('1. 严禁生产代码私写 new Intl.DateTimeFormat (必须统一使用 @app/timezone 工具)', () => {
    it('全仓 apps/ 与 libs/ 生产代码中不得私自实例化 Intl.DateTimeFormat', () => {
      const violations: string[] = [];

      for (const file of productionFiles) {
        // 允许 timezone 库自身定义底层格式化器（如有）
        if (file.includes('/libs/timezone/')) continue;

        const content = readFileSync(file, 'utf8');
        if (content.includes('Intl.DateTimeFormat')) {
          violations.push(relative(repositoryRoot, file));
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('2. 严禁使用 toISOString().slice(0, 10) 或 split("T")[0] 提取 A 股日期 (存在 UTC 跨日 Bug)', () => {
    it('全仓 apps/ 与 libs/ 生产代码中必须使用 formatShanghaiDateString 提取日期', () => {
      const violations: string[] = [];
      const forbiddenPattern =
        /\.toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)|\.split\(\s*['"]T['"]\s*\)\[0\]/;

      for (const file of productionFiles) {
        const content = readFileSync(file, 'utf8');
        if (forbiddenPattern.test(content)) {
          violations.push(relative(repositoryRoot, file));
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('3. 严禁裸字符串 Asia/Shanghai (必须统一引用 ASIA_SHANGHAI_TIMEZONE 常量)', () => {
    it('除 libs/timezone/src/date-format.constants.ts 外，全仓禁止裸写 "Asia/Shanghai"', () => {
      const violations: string[] = [];
      const canonicalDefinitionPath = join(
        repositoryRoot,
        'libs',
        'timezone',
        'src',
        'date-format.constants.ts',
      );

      for (const file of productionFiles) {
        if (file === canonicalDefinitionPath) continue;

        const content = readFileSync(file, 'utf8');
        if (
          content.includes("'Asia/Shanghai'") ||
          content.includes('"Asia/Shanghai"')
        ) {
          violations.push(relative(repositoryRoot, file));
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('4. 门禁规则自校验 (Meta-Guard 守门有效性断言)', () => {
    it('应精准识别包含私写 Intl.DateTimeFormat 的代码', () => {
      const badCode = `
        const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai' });
      `;
      expect(badCode.includes('Intl.DateTimeFormat')).toBe(true);
    });

    it('应精准识别包含 toISOString().slice(0, 10) 的违规代码', () => {
      const badCode1 = `const date = bar.timestamp.toISOString().slice(0, 10);`;
      const badCode2 = `const date = bar.timestamp.toISOString().slice( 0 , 10 );`;
      const badCode3 = `const date = bar.timestamp.split('T')[0];`;
      const goodCode = `const date = formatShanghaiDateString(bar.timestamp);`;

      const forbiddenPattern =
        /\.toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)|\.split\(\s*['"]T['"]\s*\)\[0\]/;

      expect(forbiddenPattern.test(badCode1)).toBe(true);
      expect(forbiddenPattern.test(badCode2)).toBe(true);
      expect(forbiddenPattern.test(badCode3)).toBe(true);
      expect(forbiddenPattern.test(goodCode)).toBe(false);
    });
  });
});
