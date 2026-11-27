import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ExternalFactorPluginLoader,
  isFactorPlugin,
} from './external-plugin-loader';
import { InMemoryFactorPluginRegistry } from './factor-plugin-registry';
import type { FactorOpinion, FactorPlugin } from './factor.types';

describe('ExternalFactorPluginLoader', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    ExternalFactorPluginLoader.resetConfiguration();
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
      tempDir = null;
    }
  });

  describe('isFactorPlugin type guard', () => {
    it('returns true for a compliant plugin object', () => {
      const valid: FactorPlugin = {
        id: 'plugin.test.custom',
        name: 'Custom Test Plugin',
        category: 'TECHNICAL',
        version: '1.0.0',
        description: 'Test plugin',
        evaluate: async (): Promise<FactorOpinion> => ({
          action: 'NEUTRAL',
          reason: 'test',
        }),
      };
      expect(isFactorPlugin(valid)).toBe(true);
    });

    it('returns false for null, primitives, or incomplete objects', () => {
      expect(isFactorPlugin(null)).toBe(false);
      expect(isFactorPlugin(undefined)).toBe(false);
      expect(isFactorPlugin(123)).toBe(false);
      expect(isFactorPlugin('plugin')).toBe(false);
      expect(isFactorPlugin({})).toBe(false);
      expect(isFactorPlugin({ id: 'test' })).toBe(false);
      expect(isFactorPlugin({ id: 'test', name: 'test' })).toBe(false);
      expect(
        isFactorPlugin({
          id: 'test',
          name: 'test',
          category: 'TECHNICAL',
        }),
      ).toBe(false);
    });
  });

  describe('Dynamic loading & fallback behavior', () => {
    it('returns empty array when disabled', () => {
      ExternalFactorPluginLoader.setDisabled(true);
      const plugins = ExternalFactorPluginLoader.loadPlugins();
      expect(plugins).toEqual([]);
    });

    it('returns empty array cleanly when non-existent path is configured', () => {
      ExternalFactorPluginLoader.setCustomPaths(['/non/existent/path/12345']);
      const plugins = ExternalFactorPluginLoader.loadPlugins();
      expect(plugins).toEqual([]);
    });

    it('loads plugins from array export (module.plugins)', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mist-plugin-test-'));
      const testFile = path.join(tempDir, 'index.js');
      fs.writeFileSync(
        testFile,
        `
        exports.plugins = [
          {
            id: 'plugin.private.alpha1',
            name: 'Private Alpha 1',
            category: 'CHAN',
            version: '1.0.0',
            description: 'Alpha 1',
            evaluate: async () => ({ action: 'BUY', reason: 'ok' })
          },
          {
            id: 'plugin.private.alpha2',
            name: 'Private Alpha 2',
            category: 'TECHNICAL',
            version: '1.0.0',
            description: 'Alpha 2',
            evaluate: async () => ({ action: 'NEUTRAL', reason: 'hold' })
          }
        ];
      `,
        'utf8',
      );

      ExternalFactorPluginLoader.setCustomPaths([tempDir]);
      const plugins = ExternalFactorPluginLoader.loadPlugins();
      expect(plugins.length).toBe(2);
      expect(plugins[0].id).toBe('plugin.private.alpha1');
      expect(plugins[1].id).toBe('plugin.private.alpha2');
    });

    it('loads plugins from factory function export (module.getPlugins)', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mist-plugin-factory-'));
      const testFile = path.join(tempDir, 'index.js');
      fs.writeFileSync(
        testFile,
        `
        exports.getPlugins = () => [
          {
            id: 'plugin.factory.foo',
            name: 'Factory Foo',
            category: 'REGIME',
            version: '1.0.0',
            description: 'Factory Foo',
            evaluate: async () => ({ action: 'NEUTRAL', reason: 'regime' })
          }
        ];
      `,
        'utf8',
      );

      ExternalFactorPluginLoader.setCustomPaths([tempDir]);
      const plugins = ExternalFactorPluginLoader.loadPlugins();
      expect(plugins.length).toBe(1);
      expect(plugins[0].id).toBe('plugin.factory.foo');
    });

    it('loads plugins from class constructor exports', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mist-plugin-class-'));
      const testFile = path.join(tempDir, 'index.js');
      fs.writeFileSync(
        testFile,
        `
        class CustomPlugin {
          constructor() {
            this.id = 'plugin.class.bar';
            this.name = 'Class Bar';
            this.category = 'EVENT';
            this.version = '1.0.0';
            this.description = 'Class plugin';
          }
          async evaluate() {
            return { action: 'SELL', reason: 'risk' };
          }
        }
        exports.CustomPlugin = CustomPlugin;
      `,
        'utf8',
      );

      ExternalFactorPluginLoader.setCustomPaths([tempDir]);
      const plugins = ExternalFactorPluginLoader.loadPlugins();
      expect(plugins.length).toBe(1);
      expect(plugins[0].id).toBe('plugin.class.bar');
    });

    it('registers discovered plugins into FactorPluginRegistry', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mist-plugin-reg-'));
      const testFile = path.join(tempDir, 'index.js');
      fs.writeFileSync(
        testFile,
        `
        exports.plugins = [
          {
            id: 'plugin.reg.p1',
            name: 'Reg P1',
            category: 'AI_SENTIMENT',
            version: '1.0.0',
            description: 'Reg P1',
            evaluate: async () => ({ action: 'NEUTRAL', reason: 'neutral' })
          }
        ];
      `,
        'utf8',
      );

      ExternalFactorPluginLoader.setCustomPaths([tempDir]);
      const registry = new InMemoryFactorPluginRegistry();
      const count =
        ExternalFactorPluginLoader.registerExternalPlugins(registry);
      expect(count).toBe(1);
      expect(registry.has('plugin.reg.p1')).toBe(true);
      expect(registry.get('plugin.reg.p1')?.name).toBe('Reg P1');

      // Second register should not duplicate
      const secondCount =
        ExternalFactorPluginLoader.registerExternalPlugins(registry);
      expect(secondCount).toBe(0);
    });

    it('discovers and registers category=EXIT factor plugins with equal parity', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mist-plugin-exit-'));
      const testFile = path.join(tempDir, 'index.js');
      fs.writeFileSync(
        testFile,
        `
        exports.plugins = [
          {
            id: 'plugin.tactical.test_exit',
            name: 'Test Tactical Exit Plugin',
            category: 'EXIT',
            version: '1.0.0',
            description: 'Test exit',
            evaluate: async () => ({ action: 'SELL', reason: 'hit exit' })
          }
        ];
      `,
        'utf8',
      );

      ExternalFactorPluginLoader.setCustomPaths([tempDir]);
      const plugins = ExternalFactorPluginLoader.loadPlugins();
      expect(plugins.length).toBe(1);
      expect(plugins[0].category).toBe('EXIT');

      const registry = new InMemoryFactorPluginRegistry();
      ExternalFactorPluginLoader.registerExternalPlugins(registry);
      expect(registry.has('plugin.tactical.test_exit')).toBe(true);
      const exitPlugins = registry.listByCategory('EXIT');
      expect(exitPlugins.length).toBe(1);
      expect(exitPlugins[0].id).toBe('plugin.tactical.test_exit');
    });

    it('tolerates broken syntax files without crashing', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mist-plugin-broken-'));
      const testFile = path.join(tempDir, 'index.js');
      fs.writeFileSync(
        testFile,
        `this is invalid javascript syntax {{`,
        'utf8',
      );

      ExternalFactorPluginLoader.setCustomPaths([tempDir]);
      const plugins = ExternalFactorPluginLoader.loadPlugins();
      expect(plugins).toEqual([]);
    });

    it('discovers peer workspace plugins when the private workspace is present', () => {
      // jest 全局 setup 默认禁用了私仓探测（组8）——本测试显式指向平级私仓目录
      // 以验证 peer 发现机制本身仍然有效（显式 env 独占语义）。
      process.env.MIST_PRIVATE_PLUGINS_DIR = path.resolve(
        process.cwd(),
        '..',
        'mist-alpha-private',
      );
      const peerDir = path.resolve(process.cwd(), '..', 'mist-alpha-private');
      const hasPrivateWorkspace =
        fs.existsSync(peerDir) &&
        (fs.existsSync(path.join(peerDir, 'src', 'index.ts')) ||
          fs.existsSync(path.join(peerDir, 'dist', 'index.js')) ||
          fs.existsSync(path.join(peerDir, 'index.ts')) ||
          fs.existsSync(path.join(peerDir, 'index.js')));

      const plugins = ExternalFactorPluginLoader.loadPlugins();

      if (!hasPrivateWorkspace) {
        // 单仓 checkout（公开 CI）：发现机制必须静默降级，公开套件不得失败。
        expect(plugins).toEqual([]);
        return;
      }

      // 多仓工作区：发现机制有效——断言通用插件契约，避免私有清单泄漏
      expect(plugins.length).toBeGreaterThanOrEqual(1);
      plugins.forEach((p) => {
        expect(p.id).toBeDefined();
        expect(p.name).toBeDefined();
        expect(typeof p.evaluate).toBe('function');
      });
    });

    it('createVirtualExitPolicy forwards execution options and prioritizes loaded external policy ahead of PriceLevelExitPolicy fallback', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mist-plugin-vexit-'));
      const testFile = path.join(tempDir, 'index.js');
      fs.writeFileSync(
        testFile,
        `
        let capturedOptions = null;
        let activeChannel = null;
        exports.plugins = [];
        exports.createVirtualExitPolicy = function(exitPluginsOrOpts, maybeOpts) {
          capturedOptions =
            Array.isArray(exitPluginsOrOpts) || exitPluginsOrOpts === undefined
              ? maybeOpts
              : exitPluginsOrOpts;
          return {
            configure(specs) {
              activeChannel = specs[0]?.channel ?? null;
            },
            onSignal(sig) {
              if (sig.signalKind === 'entry') activeChannel = sig.channel ?? activeChannel;
            },
            onBar(bar, period) {
              if (!activeChannel || activeChannel.period !== period) return [];
              const channel = activeChannel;
              activeChannel = null;
              return [{
                channel,
                ownerPluginId: 'plugin.ext.struct',
                ruleId: 'ext-struct',
                exitKind: 'STRUCTURAL_BREAKDOWN',
                reason: 'ext priority first',
                badgeText: '外部优先出场',
                evidence: { capturedOptions }
              }];
            },
            onExternalExit() {
              activeChannel = null;
            }
          };
        };
      `,
        'utf8',
      );

      ExternalFactorPluginLoader.setCustomPaths([tempDir]);
      const policy = ExternalFactorPluginLoader.createVirtualExitPolicy({
        executionMode: 'next_bar_open',
        surveillancePeriods: [5],
      });
      const channel = { definitionId: 21, versionId: 1, period: 1440 };
      policy.configure([
        {
          channel,
          bindings: [
            {
              ownerPluginId: 'p',
              rule: { kind: 'breakeven', activationGain: 0.01 },
            },
            {
              ownerPluginId: 'p',
              rule: { kind: 'time_expired', maxHoldingBars: 1 },
            },
          ],
        },
      ]);
      policy.onSignal({
        definitionId: 21,
        versionId: 1,
        signalKind: 'entry',
        channel,
        signalTime: new Date('2026-01-05T00:00:00+08:00'),
        triggerPrice: 10,
        pivotTime: null,
        pivotPrice: null,
        signalType: 'ENTRY',
        decisionTrace: {},
        contextSnapshot: {},
        ruleSnapshot: {},
      });

      const d1 = {
        securityId: 1,
        securityCode: '000001',
        source: 'tdx' as const,
        period: 1440,
        timestamp: new Date('2026-01-06T00:00:00+08:00'),
        open: 10,
        high: 10,
        low: 9,
        close: 9.5,
        volume: '100',
        amount: '950',
        type: 'complete' as const,
      };
      const d2 = {
        ...d1,
        timestamp: new Date('2026-01-07T00:00:00+08:00'),
        close: 9.0,
      };
      const d1Proposals = policy.onBar(d1, 1440);
      expect(d1Proposals).toHaveLength(1);
      expect(d1Proposals[0]?.exitKind).toBe('STRUCTURAL_BREAKDOWN');
      expect(d1Proposals[0]?.evidence?.capturedOptions).toEqual({
        executionMode: 'next_bar_open',
        intradaySurveillancePeriods: [5],
      });

      // Fallback PriceLevelExitPolicy must have received onExternalExit and stay silent on D2
      expect(policy.onBar(d2, 1440)).toHaveLength(0);
    });
  });
});
