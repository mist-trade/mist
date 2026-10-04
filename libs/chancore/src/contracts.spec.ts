import {
  BiStatus,
  BiType,
  ChanDivergenceType,
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  DuanStatus,
  DuanType,
  TrendDirection,
} from './contracts';
import type {
  BaseChanChannel,
  ChanBi,
  ChanBiChannel,
  ChanBiChannelTwoPhaseResult,
  ChanBuySellPoint,
  ChanDivergence,
  ChanDuan,
  ChanDuanChannel,
  ChanDuanChannelTwoPhaseResult,
} from './contracts';

describe('Contracts TDD Specification (Batch 1)', () => {
  it('should define ChannelLevel with Bi, Duan, and Macro (Option B)', () => {
    expect(ChannelLevel.Bi).toBe('bi');
    expect(ChannelLevel.Duan).toBe('duan');
    expect(ChannelLevel.Macro).toBe('macro');
  });

  it('should construct a valid ChanBiChannel conforming to BaseChanChannel without displayStartId/displayEndId', () => {
    const dummyBi: ChanBi = {
      startTime: new Date('2026-01-01T09:30:00Z'),
      endTime: new Date('2026-01-01T09:35:00Z'),
      high: 100,
      low: 90,
      trend: TrendDirection.Up,
      type: BiType.Complete,
      status: BiStatus.Valid,
      independentCount: 5,
      originIds: [1, 2, 3, 4, 5],
      originData: [],
      startFenxing: null,
      endFenxing: null,
    };

    const biChannel: ChanBiChannel = {
      zg: 98,
      zd: 92,
      gg: 100,
      dd: 90,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      status: ChannelStatus.Valid,
      expanded: false,
      startId: 1,
      endId: 15,
      bis: [dummyBi, dummyBi, dummyBi],
      entryBi: dummyBi,
      leaveBi: dummyBi,
      trend: TrendDirection.Up,
    };

    const baseChannel: BaseChanChannel = biChannel;
    expect(baseChannel.zg).toBe(98);
    expect(biChannel.zg).toBe(98);
    expect(biChannel.zd).toBe(92);
    expect(biChannel.level).toBe(ChannelLevel.Bi);
    expect(biChannel.upgradedLevel).toBeUndefined();
    expect(biChannel.bis).toHaveLength(3);
    expect(biChannel.entryBi).toBeDefined();
    expect(biChannel.leaveBi).toBeDefined();

    // Assert strictly no legacy displayStartId / displayEndId
    expect('displayStartId' in biChannel).toBe(false);
    expect('displayEndId' in biChannel).toBe(false);
  });

  it('should construct a valid ChanDuanChannel with upgradedLevel: Macro on expansion without displayStartId/displayEndId', () => {
    const dummyDuan: ChanDuan = {
      startTime: new Date('2026-01-01T09:30:00Z'),
      endTime: new Date('2026-01-01T10:00:00Z'),
      high: 120,
      low: 80,
      trend: TrendDirection.Down,
      type: DuanType.Complete,
      status: DuanStatus.Valid,
      independentCount: 3,
      originIds: [1, 2, 3],
      originBis: [],
      startBi: null,
      endBi: null,
    };

    const duanChannel: ChanDuanChannel = {
      zg: 110,
      zd: 85,
      gg: 120,
      dd: 80,
      level: ChannelLevel.Duan,
      type: ChannelType.Complete,
      status: ChannelStatus.Valid,
      expanded: true,
      upgradedLevel: ChannelLevel.Macro,
      startId: 1,
      endId: 30,
      duans: [dummyDuan],
      entryDuan: dummyDuan,
      leaveDuan: dummyDuan,
      trend: TrendDirection.Down,
    };

    expect(duanChannel.level).toBe(ChannelLevel.Duan); // Native bloodline unchanged
    expect(duanChannel.expanded).toBe(true);
    expect(duanChannel.upgradedLevel).toBe(ChannelLevel.Macro);
    expect(duanChannel.duans).toHaveLength(1);
    expect(duanChannel.entryDuan).toBeDefined();

    // Assert strictly no legacy displayStartId / displayEndId
    expect('displayStartId' in duanChannel).toBe(false);
    expect('displayEndId' in duanChannel).toBe(false);
  });

  it('should require level: ChannelLevel on ChanBuySellPoint and ChanDivergence', () => {
    const bsp: ChanBuySellPoint = {
      type: 'first_buy' as any,
      level: ChannelLevel.Duan,
      zhongshuIndex: 0,
      unitIndex: 2,
      price: 95.5,
      firstTypeIndex: null,
    };

    const divergence: ChanDivergence = {
      type: ChanDivergenceType.Trend,
      level: ChannelLevel.Bi,
      zhongshuIndex: 0,
      enterIndex: 0,
      leaveIndex: 2,
      enterForce: { area: 100, peak: 2.5 },
      leaveForce: { area: 60, peak: 1.8 },
    };

    expect(bsp.level).toBe(ChannelLevel.Duan);
    expect(divergence.level).toBe(ChannelLevel.Bi);
  });

  it('should support TwoPhaseResult types for both Bi and Duan', () => {
    const biPhases: ChanBiChannelTwoPhaseResult = {
      phaseA: [],
      phaseB: [],
    };
    const duanPhases: ChanDuanChannelTwoPhaseResult = {
      phaseA: [],
      phaseB: [],
    };
    expect(biPhases.phaseA).toEqual([]);
    expect(duanPhases.phaseB).toEqual([]);
  });
});
