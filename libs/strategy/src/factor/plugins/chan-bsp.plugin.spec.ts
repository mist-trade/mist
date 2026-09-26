import { ChanBspFactorPlugin } from './chan-bsp.plugin';

describe('ChanBspFactorPlugin 增量与分型扳机测试', () => {
  let plugin: ChanBspFactorPlugin;

  beforeEach(() => {
    plugin = new ChanBspFactorPlugin();
    plugin.resetCursors();
  });

  it('默认 deduplicate 为 true，在 params 为空或未传 deduplicate 时自动生效', () => {
    const resolved = (plugin as any).resolveParams({});
    expect(resolved.deduplicate).toBe(true);
  });

  it('显式传入 deduplicate: false 时，允许关闭去重', () => {
    const resolved = (plugin as any).resolveParams({ deduplicate: false });
    expect(resolved.deduplicate).toBe(false);
  });

  it('requireConfirmedFenxing 默认关闭，显式开启后生效', () => {
    const resolvedDefault = (plugin as any).resolveParams({});
    expect(resolvedDefault.requireConfirmedFenxing).toBe(false);

    const resolvedActive = (plugin as any).resolveParams({
      requireConfirmedFenxing: true,
    });
    expect(resolvedActive.requireConfirmedFenxing).toBe(true);
  });
});
