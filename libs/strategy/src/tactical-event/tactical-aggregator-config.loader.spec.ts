import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  InvalidTacticalAggregatorConfigError,
  TacticalAggregatorConfigLoader,
} from './tactical-aggregator-config.loader';

describe('TacticalAggregatorConfigLoader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tactical-aggregator-'));
    TacticalAggregatorConfigLoader.resetConfiguration();
  });

  afterEach(() => {
    TacticalAggregatorConfigLoader.resetConfiguration();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(payload: unknown): string {
    const file = path.join(tmpDir, 'tactical-aggregator.json');
    fs.writeFileSync(file, JSON.stringify(payload), 'utf-8');
    return file;
  }

  it('文件缺失时降级为空配置，不抛错', () => {
    TacticalAggregatorConfigLoader.setCustomPaths([
      path.join(tmpDir, 'absent.json'),
    ]);

    const resolved = TacticalAggregatorConfigLoader.resolve();
    expect(resolved.config).toEqual({});
    expect(resolved.source).toBeNull();
  });

  it('解析 windows 规则并保留 RISK_CUT 语义', () => {
    const file = writeConfig({
      edgePlugins: ['test.regime', 'test.setup'],
      windows: [
        {
          requiredSetupTag: 'test.regime',
          triggerTag: 'test.setup',
          windowBars: 3,
          requiredConfirmationTags: ['test.confirm'],
          optionalBoostTags: ['test.boost'],
          compositeBadgeText: '组合',
        },
        {
          triggerTag: 'test.riskcut',
          windowBars: 0,
          requiredConfirmationTags: [],
          compositeBadgeText: '逃命',
          action: 'SELL',
          kind: 'RISK_CUT',
        },
      ],
      cooldownBars: 3,
    });
    TacticalAggregatorConfigLoader.setCustomPaths([file]);

    const { config, source } = TacticalAggregatorConfigLoader.resolve();
    expect(source).toBe(file);
    expect(config.edgePlugins).toEqual(['test.regime', 'test.setup']);
    expect(config.cooldownBars).toBe(3);
    expect(config.windows).toHaveLength(2);
    expect(config.windows?.[1]).toMatchObject({
      triggerTag: 'test.riskcut',
      windowBars: 0,
      kind: 'RISK_CUT',
      action: 'SELL',
    });
  });

  it('文件存在但形状非法时显式抛错，不静默降级', () => {
    const file = writeConfig({ windows: [{ triggerTag: '' }] });
    TacticalAggregatorConfigLoader.setCustomPaths([file]);

    expect(() => TacticalAggregatorConfigLoader.load()).toThrow(
      InvalidTacticalAggregatorConfigError,
    );
  });

  it('同一路径重复调用命中缓存', () => {
    const file = writeConfig({ windows: [] });
    TacticalAggregatorConfigLoader.setCustomPaths([file]);

    const first = TacticalAggregatorConfigLoader.resolve();
    const second = TacticalAggregatorConfigLoader.resolve();
    expect(second.config).toBe(first.config);
  });
});
