import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FactorPlugin } from './factor.types';
import type { FactorPluginRegistry } from './factor-plugin-registry';

/**
 * 校验对象是否满足 FactorPlugin 契约
 */
export function isFactorPlugin(obj: unknown): obj is FactorPlugin {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  const cand = obj as Record<string, unknown>;
  return (
    typeof cand.id === 'string' &&
    cand.id.trim().length > 0 &&
    typeof cand.name === 'string' &&
    typeof cand.category === 'string' &&
    typeof cand.evaluate === 'function'
  );
}

/**
 * 通用外部因子插件动态加载器 (ExternalFactorPluginLoader)
 *
 * 职责：
 * 1. 运行时自动探测外部私有插件目录（如 mist-alpha-private 或环境变量指定路径）；
 * 2. 动态发现、验证并批量挂载外部 FactorPlugin 实例；
 * 3. 当外部目录不存在时（如开源公版环境、公共 CI），保持优雅零报错降级；
 * 4. 彻底解耦公仓与私仓，保障核心策略 IP 100% 物理隔离。
 */
export class ExternalFactorPluginLoader {
  private static customPaths: string[] = [];
  private static disabled = false;

  /**
   * 设置是否禁用外部插件加载（主要用于单元测试与基线隔离）
   */
  public static setDisabled(disabled: boolean): void {
    this.disabled = disabled;
  }

  /**
   * 显式配置外部插件候选路径（按优先级排序，主要用于测试或多环境指定）
   */
  public static setCustomPaths(paths: string[]): void {
    this.customPaths = [...paths];
  }

  /**
   * 重置配置为默认约定探测
   */
  public static resetConfiguration(): void {
    this.customPaths = [];
    this.disabled = false;
  }

  /**
   * 扫描并加载所有合法的外部因子插件实例
   */
  public static loadPlugins(): readonly FactorPlugin[] {
    if (this.disabled) {
      return [];
    }

    const candidatePaths = this.getCandidatePaths();
    const discoveredPlugins = new Map<string, FactorPlugin>();

    for (const candPath of candidatePaths) {
      const entryFiles = this.resolveEntryFiles(candPath);
      for (const entryFile of entryFiles) {
        const plugins = this.tryLoadModule(entryFile);
        for (const plugin of plugins) {
          if (!discoveredPlugins.has(plugin.id)) {
            discoveredPlugins.set(plugin.id, plugin);
          }
        }
      }
    }

    return Array.from(discoveredPlugins.values());
  }

  /**
   * 发现并向指定的插件注册表注册所有外部因子插件
   * @returns 成功注册的插件数量
   */
  public static registerExternalPlugins(
    registry: FactorPluginRegistry,
  ): number {
    const plugins = this.loadPlugins();
    let count = 0;
    for (const plugin of plugins) {
      if (!registry.has(plugin.id)) {
        registry.register(plugin);
        count++;
      }
    }
    return count;
  }

  /**
   * 获取可能包含外部插件的候选路径（按优先级排序）
   */
  private static getCandidatePaths(): string[] {
    if (this.customPaths.length > 0) {
      return this.customPaths;
    }

    const paths: string[] = [];

    // 1. 环境变量配置
    const envDir =
      process.env.MIST_PRIVATE_PLUGINS_DIR ||
      process.env.MIST_PRIVATE_PLUGINS_PATH;
    if (envDir && envDir.trim().length > 0) {
      paths.push(envDir.trim());
    }

    // 2. 多仓库平级约定目录 (peer workspace: ../mist-alpha-private)
    const peerFromCwd = path.resolve(process.cwd(), '..', 'mist-alpha-private');
    paths.push(peerFromCwd);

    const peerFromDirname = path.resolve(
      __dirname,
      '../../../../..',
      'mist-alpha-private',
    );
    if (!paths.includes(peerFromDirname)) {
      paths.push(peerFromDirname);
    }

    return paths;
  }

  /**
   * 解析候选路径中的入口文件列表
   */
  private static resolveEntryFiles(basePath: string): string[] {
    if (!fs.existsSync(basePath)) {
      return [];
    }

    try {
      const stat = fs.statSync(basePath);
      if (stat.isFile()) {
        return [basePath];
      }

      if (stat.isDirectory()) {
        const results: string[] = [];
        const indexCandidates = [
          path.join(basePath, 'src', 'index.ts'),
          path.join(basePath, 'dist', 'index.js'),
          path.join(basePath, 'src', 'index.js'),
          path.join(basePath, 'index.ts'),
          path.join(basePath, 'index.js'),
        ];

        for (const candidate of indexCandidates) {
          if (
            fs.existsSync(candidate) &&
            fs.statSync(candidate).isFile() &&
            !results.includes(candidate)
          ) {
            results.push(candidate);
          }
        }

        // 进一步扫描 plugins/ 目录中的独立插件文件
        const pluginsDirs = [
          path.join(basePath, 'src', 'plugins'),
          path.join(basePath, 'dist', 'plugins'),
          path.join(basePath, 'plugins'),
        ];

        for (const pDir of pluginsDirs) {
          if (fs.existsSync(pDir) && fs.statSync(pDir).isDirectory()) {
            const files = fs.readdirSync(pDir);
            for (const f of files) {
              if (
                (f.endsWith('.ts') || f.endsWith('.js')) &&
                !f.endsWith('.d.ts') &&
                !f.endsWith('.spec.ts') &&
                !f.endsWith('.test.ts')
              ) {
                const fullP = path.join(pDir, f);
                if (fs.statSync(fullP).isFile() && !results.includes(fullP)) {
                  results.push(fullP);
                }
              }
            }
          }
        }

        return results;
      }
    } catch {
      // 容错处理，探测失败返回空
    }

    return [];
  }

  /**
   * 安全动态导入模块并提取导出的 FactorPlugin 实例
   */
  private static tryLoadModule(filePath: string): FactorPlugin[] {
    const plugins: FactorPlugin[] = [];

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const mod = require(filePath);
      if (!mod || (typeof mod !== 'object' && typeof mod !== 'function')) {
        return [];
      }

      // 1. 检查 module.plugins (数组导出规范)
      if (Array.isArray(mod.plugins)) {
        for (const p of mod.plugins) {
          this.collectPluginCandidate(p, plugins);
        }
      }

      // 2. 检查 module.getPlugins() (工厂函数导出规范)
      if (typeof mod.getPlugins === 'function') {
        try {
          const res = mod.getPlugins();
          if (Array.isArray(res)) {
            for (const p of res) {
              this.collectPluginCandidate(p, plugins);
            }
          }
        } catch {
          // 忽略工厂执行异常
        }
      }

      // 3. 检查 default 导出
      if (mod.default) {
        if (Array.isArray(mod.default)) {
          for (const p of mod.default) {
            this.collectPluginCandidate(p, plugins);
          }
        } else {
          this.collectPluginCandidate(mod.default, plugins);
        }
      }

      // 4. 检查其他具名导出
      for (const [key, value] of Object.entries(mod)) {
        if (key !== 'plugins' && key !== 'default' && key !== 'getPlugins') {
          this.collectPluginCandidate(value, plugins);
        }
      }
    } catch {
      // 外部模块加载失败时静默容错，不中断系统运行
    }

    return plugins;
  }

  private static collectPluginCandidate(
    cand: unknown,
    sink: FactorPlugin[],
  ): void {
    if (!cand) return;

    if (isFactorPlugin(cand)) {
      if (!sink.some((p) => p.id === cand.id)) {
        sink.push(cand);
      }
      return;
    }

    if (typeof cand === 'function') {
      try {
        const inst = new (cand as new () => unknown)();
        if (isFactorPlugin(inst)) {
          if (!sink.some((p) => p.id === inst.id)) {
            sink.push(inst);
          }
        }
      } catch {
        // 非无参构造函数则忽略
      }
    }
  }
}
