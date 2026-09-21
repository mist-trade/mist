import * as fs from 'fs';
import * as path from 'path';
import { ChanFourQuadrantTactics } from './contracts/chan-four-quadrant-tactics.interface';
import { StandardChanTactics } from './default/standard-chan-tactics';

export interface TacticsMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author?: string;
  readonly isPrivate: boolean;
  readonly loadedFromPath?: string;
}

/**
 * 通用动态战术加载器（Universal Dynamic Tactics Loader）
 *
 * 核心机制：
 * 1. 编译期完全解耦：不产生任何静态 import 依赖，远端 CI 在没有私有代码时 100% 顺利编译通过；
 * 2. 多重优先探测：优先读取环境变量路径，次级读取本地 private/ 目录；
 * 3. 安全平滑降级：未检测到私有文件或加载异常时，自动静默回退至 StandardChanTactics；
 * 4. 支持热重载：提供 reloadTactics()，在开发调试或热更新时无需重启进程。
 */
export class DynamicTacticsLoader {
  private static cachedInstance: ChanFourQuadrantTactics | null = null;
  private static activeMetadata: TacticsMetadata | null = null;

  /**
   * 获取当前生效的战术单例（若未加载则自动探测装配）
   */
  public static getTactics(): ChanFourQuadrantTactics {
    if (!this.cachedInstance) {
      this.cachedInstance = this.resolveTactics();
    }
    return this.cachedInstance;
  }

  /**
   * 获取当前生效战术的元数据状态
   */
  public static getActiveMetadata(): TacticsMetadata {
    if (!this.activeMetadata) {
      this.getTactics();
    }
    return this.activeMetadata!;
  }

  /**
   * 热重载：清除模块缓存并重新探测加载（用于本地开发或生产动态更新）
   */
  public static reloadTactics(): ChanFourQuadrantTactics {
    if (this.activeMetadata?.loadedFromPath) {
      try {
        const resolved = require.resolve(this.activeMetadata.loadedFromPath);
        delete require.cache[resolved];
      } catch {
        // ignore cache deletion failure
      }
    }
    this.cachedInstance = null;
    this.activeMetadata = null;
    return this.getTactics();
  }

  /**
   * 内部核心装配探测流程
   */
  private static resolveTactics(): ChanFourQuadrantTactics {
    const candidatePaths = this.getCandidatePaths();

    for (const candidate of candidatePaths) {
      const resolvedFile = this.resolveExistingFile(candidate);
      if (resolvedFile) {
        const instance = this.tryLoadModule(resolvedFile);
        if (instance) {
          this.activeMetadata = {
            id: instance.id,
            name: instance.name,
            version: instance.version,
            author: instance.author,
            isPrivate: true,
            loadedFromPath: resolvedFile,
          };
          return instance;
        }
      }
    }

    // 未发现私有战术实现，平滑回退至标准公开基线
    const fallback = new StandardChanTactics();
    this.activeMetadata = {
      id: fallback.id,
      name: fallback.name,
      version: fallback.version,
      author: fallback.author,
      isPrivate: false,
    };
    return fallback;
  }

  /**
   * 获取可能包含私有战术的候选路径列表（按优先级排序）
   */
  private static getCandidatePaths(): string[] {
    if (process.env.MIST_DISABLE_PRIVATE_TACTICS === 'true') {
      return [];
    }

    // 1. 显式环境变量指定完整路径
    if (process.env.MIST_PRIVATE_TACTICS_PATH) {
      return [process.env.MIST_PRIVATE_TACTICS_PATH];
    }

    // 2. 环境变量指定目录（优先锁定此目录）
    if (process.env.MIST_PRIVATE_TACTICS_DIR) {
      return [
        path.join(process.env.MIST_PRIVATE_TACTICS_DIR, 'my-secret-tactics'),
        path.join(process.env.MIST_PRIVATE_TACTICS_DIR, 'index'),
      ];
    }

    // 3. 约定相对路径（本地开发工作区内 private/ 目录）
    return [
      path.join(__dirname, 'private', 'my-secret-tactics'),
      path.join(__dirname, 'private', 'index'),
    ];
  }

  /**
   * 检查候选路径加上常用扩展名后的真实文件存在性
   */
  private static resolveExistingFile(basePath: string): string | null {
    if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
      return basePath;
    }

    const extensions = ['.js', '.ts', '.cjs', '.mjs'];
    for (const ext of extensions) {
      const fullPath = basePath + ext;
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fullPath;
      }
    }

    return null;
  }

  /**
   * 安全动态导入模块并实例化战术类
   */
  private static tryLoadModule(
    filePath: string,
  ): ChanFourQuadrantTactics | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const mod = require(filePath);
      const TargetClass =
        mod.MySecretTactics ||
        mod.PrivateChanTactics ||
        mod.CustomChanTactics ||
        mod.default;

      if (typeof TargetClass === 'function') {
        const instance = new TargetClass();
        if (this.isValidTacticsInstance(instance)) {
          return instance;
        }
      } else if (this.isValidTacticsInstance(TargetClass)) {
        return TargetClass;
      }
    } catch (err) {
      console.warn(
        `[DynamicTacticsLoader] 发现私有模块文件 ${filePath} 但加载失败，安全回退:`,
        err,
      );
    }
    return null;
  }

  /**
   * 校验对象是否满足 ChanFourQuadrantTactics 四象限契约
   */
  private static isValidTacticsInstance(
    obj: unknown,
  ): obj is ChanFourQuadrantTactics {
    if (!obj || typeof obj !== 'object') {
      return false;
    }
    const t = obj as Record<string, unknown>;
    return (
      typeof t.id === 'string' &&
      typeof t.name === 'string' &&
      typeof t.evaluateLeftBuy === 'function' &&
      typeof t.evaluateRightBuy === 'function' &&
      typeof t.evaluateLeftSell === 'function' &&
      typeof t.evaluateRightSell === 'function'
    );
  }
}
