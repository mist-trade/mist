import {
  loadLegacyPresetFlow,
  loadLegacyPresetMetas,
  resetLegacyPresetCache,
} from '../../../tools/strategy-dev/preset-loader';

describe('preset-loader (策略预设加载器与动态发现)', () => {
  beforeEach(() => {
    resetLegacyPresetCache();
  });

  afterEach(() => {
    resetLegacyPresetCache();
  });

  it('1. 能够读取公共预设 pure-chan-bsp (ID 1)', () => {
    const flow = loadLegacyPresetFlow(1);
    expect(flow).toBeDefined();
    expect(flow?.id).toBe('guard_chan_bsp_primary');
    expect(flow?.type).toBe('GUARD');
  });

  it('2. loadLegacyPresetMetas 能够导出预设元信息列表且包含 ID 1', () => {
    const metas = loadLegacyPresetMetas();
    expect(Array.isArray(metas)).toBe(true);
    expect(metas.length).toBeGreaterThanOrEqual(1);

    const preset1 = metas.find((m) => m.id === 1);
    expect(preset1).toBeDefined();
    expect(preset1?.name).toBe('纯原典缠论买卖点策略树');
    expect(preset1?.kind).toBe('decision_flow');
    expect(preset1?.status).toBe('active');
    expect(preset1?.periods).toContain(1440);
  });

  it('3. 若存在私有仓预设 (ID 2/3)，应能正确载入且按 ID 升序排列', () => {
    const metas = loadLegacyPresetMetas();
    const ids = metas.map((m) => m.id);
    const sortedIds = [...ids].sort((a, b) => a - b);
    expect(ids).toEqual(sortedIds);

    const preset2 = metas.find((m) => m.id === 2);
    if (preset2) {
      expect(preset2.name).toContain('上证大盘宏观+纯缠论');
      const flow2 = loadLegacyPresetFlow(2);
      expect(flow2).toBeDefined();
      expect(flow2?.id).toBe('guard_regime_shanghai');
    }
  });

  it('4. 未命中不存在的预设 ID 时返回 null', () => {
    const notFound = loadLegacyPresetFlow(99999);
    expect(notFound).toBeNull();
  });
});
