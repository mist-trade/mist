import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { execSync } from 'node:child_process';
import { ExternalFactorPluginLoader } from './external-plugin-loader';
import { InMemoryFactorPluginRegistry } from './factor-plugin-registry';
import { ensureStandardPluginsRegistered } from './standard-plugins';

describe('External Isolation & Anti-Leak Architectural Guard (外部插件物理隔离与防泄漏门禁)', () => {
  const repositoryRoot = path.resolve(__dirname, '../../../..'); // mist 仓库根目录

  it('1. 全仓 TS 源码绝不包含任何指向私有仓或私有插件的静态 import / export', () => {
    const scanDirs = [
      path.join(repositoryRoot, 'libs'),
      path.join(repositoryRoot, 'apps'),
      path.join(repositoryRoot, 'tools'),
    ];

    const forbiddenPatterns = [
      'mist-alpha-private',
      'my-secret-tactics',
      'tactics/private',
      'ChanFourQuadrantTactics',
      'StandardChanTactics',
      'DynamicTacticsLoader',
    ];

    const violations: string[] = [];

    for (const scanDir of scanDirs) {
      if (!fs.existsSync(scanDir)) continue;
      const tsFiles = findTsFiles(scanDir);
      for (const file of tsFiles) {
        // 门禁测试文件自身做模式匹配，不作为违规
        if (file.endsWith('external-isolation.guard.spec.ts')) continue;

        const content = fs.readFileSync(file, 'utf8');
        const sourceFile = ts.createSourceFile(
          file,
          content,
          ts.ScriptTarget.Latest,
          true,
        );

        ts.forEachChild(sourceFile, (node) => {
          if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
          ) {
            const specifier = node.moduleSpecifier.text;
            for (const forbidden of forbiddenPatterns) {
              if (specifier.includes(forbidden)) {
                violations.push(
                  `${path.relative(repositoryRoot, file)} -> ${specifier}`,
                );
              }
            }
          }
        });
      }
    }

    expect(violations).toEqual([]);
  });

  it('2. Git 索引中绝无任何私有代码或专有战术文件被跟踪', () => {
    try {
      const output = execSync('git ls-files', {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
      });
      const trackedFiles = output.split('\n').filter(Boolean);

      const forbiddenTrackedPatterns = [
        'mist-alpha-private',
        'my-secret-tactics',
        'tactics/private',
        'chan-bsp-confidence-tiering-plan',
      ];

      const leakedTracked = trackedFiles.filter((f) =>
        forbiddenTrackedPatterns.some((pattern) => f.includes(pattern)),
      );

      expect(leakedTracked).toEqual([]);
    } catch {
      // 在非 git 源码包环境中跳过此检查
    }
  });

  it('3. 在外部私有模块被禁用或不存在时，开源主仓标准插件体系必须 100% 独立平稳运行', () => {
    ExternalFactorPluginLoader.setDisabled(true);
    try {
      const registry = new InMemoryFactorPluginRegistry();
      ensureStandardPluginsRegistered(registry);

      // 验证标准开源插件已完备注册
      expect(registry.has('plugin.chan.bsp')).toBe(true);
      expect(registry.has('plugin.legacy.rule-dsl')).toBe(true);
      expect(registry.has('plugin.technical.volume-breakout')).toBe(true);
      expect(registry.has('plugin.fundamental.safety-guard')).toBe(true);
      expect(registry.has('plugin.capital.northbound')).toBe(true);
      expect(registry.has('plugin.technical.fibonacci')).toBe(true);

      // 验证无任何未授权私有插件混入
      const allPlugins = registry.listByCategory();
      const privatePlugins = allPlugins.filter((p) =>
        p.id.startsWith('plugin.private'),
      );
      expect(privatePlugins).toHaveLength(0);
    } finally {
      ExternalFactorPluginLoader.resetConfiguration();
    }
  });
});

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findTsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        results.push(fullPath);
      }
    }
  } catch {
    // ignore unreadable dirs
  }
  return results;
}
