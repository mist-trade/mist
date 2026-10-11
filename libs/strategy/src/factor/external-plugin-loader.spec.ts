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
          confidence: 0,
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
            evaluate: async () => ({ action: 'BUY', confidence: 0.8, reason: 'ok' })
          },
          {
            id: 'plugin.private.alpha2',
            name: 'Private Alpha 2',
            category: 'TECHNICAL',
            version: '1.0.0',
            description: 'Alpha 2',
            evaluate: async () => ({ action: 'NEUTRAL', confidence: 0, reason: 'hold' })
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
            evaluate: async () => ({ action: 'NEUTRAL', confidence: 0.5, reason: 'regime' })
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
            return { action: 'SELL', confidence: 0.9, reason: 'risk' };
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
            evaluate: async () => ({ action: 'NEUTRAL', confidence: 0, reason: 'neutral' })
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

    it('automatically discovers peer workspace mist-alpha-private plugins when present', () => {
      // 不设置 customPaths，测试默认探测逻辑
      const plugins = ExternalFactorPluginLoader.loadPlugins();
      expect(plugins.length).toBeGreaterThanOrEqual(2);
      const ids = plugins.map((p) => p.id);
      expect(ids).toContain('plugin.private.chan-custom-enhancer');
      expect(ids).toContain('plugin.private.alpha-momentum');
    });
  });
});
