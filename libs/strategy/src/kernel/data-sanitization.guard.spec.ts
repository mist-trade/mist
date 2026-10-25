import type {
  StrategyReplayMarketDataPort,
  StrategyReplayPage,
  StrategyReplayWindow,
} from '@app/market-data';
import {
  A_SHARE_DATA_MIN_BOUNDARY,
  InvalidHistoricalDataBoundaryException,
} from '../strategy.errors';
import {
  HistoricalBarSource,
  type HistoricalReplayCriteria,
} from './historical-bar-source';
import type { StrategyEvaluationKernel } from './strategy-evaluation-kernel';

describe('DataSanitizationGuard (A股历史数据防毒清洗门禁)', () => {
  const createMockPort = (): {
    port: StrategyReplayMarketDataPort;
    loadReplayWindowCalled: boolean;
    readReplayPageCalled: boolean;
  } => {
    let loadReplayWindowCalled = false;
    let readReplayPageCalled = false;
    const port: StrategyReplayMarketDataPort = {
      loadReplayWindow: async (): Promise<StrategyReplayWindow> => {
        loadReplayWindowCalled = true;
        return { bars: [] };
      },
      readReplayPage: async (): Promise<StrategyReplayPage> => {
        readReplayPageCalled = true;
        return { bars: [], nextAfterTimestamp: null };
      },
    };
    return {
      port,
      get loadReplayWindowCalled() {
        return loadReplayWindowCalled;
      },
      get readReplayPageCalled() {
        return readReplayPageCalled;
      },
    };
  };

  const createMockKernel = (): StrategyEvaluationKernel => {
    return {
      push: jest.fn().mockResolvedValue([]),
      diagnostics: jest.fn().mockReturnValue({
        prewarmStatus: 'empty',
        prewarmActual: 0,
        publicBarCount: 0,
      }),
    } as unknown as StrategyEvaluationKernel;
  };

  describe('1. 静态边界校验 (HistoricalBarSource.validateBoundary)', () => {
    it('1996-12-16 之前的历史时间戳必须 100% 阻断并抛出 InvalidHistoricalDataBoundaryException', () => {
      const toxicDates = [
        new Date('1990-12-19T00:00:00.000Z'), // 上交所开市
        new Date('1992-05-21T00:00:00.000Z'), // 早期全面放开涨跌幅
        new Date('1995-05-18T00:00:00.000Z'), // 国债期货327事件
        new Date('1996-12-15T23:59:59.999Z'), // 涨跌停板与T+1实施前1毫秒
      ];

      for (const toxicDate of toxicDates) {
        expect(() =>
          HistoricalBarSource.validateBoundary({ publicFrom: toxicDate }),
        ).toThrow(InvalidHistoricalDataBoundaryException);

        expect(() =>
          HistoricalBarSource.validateBoundary({ startDate: toxicDate }),
        ).toThrow(InvalidHistoricalDataBoundaryException);

        expect(() =>
          HistoricalBarSource.validateBoundary({ preWarmEndAt: toxicDate }),
        ).toThrow(InvalidHistoricalDataBoundaryException);
      }
    });

    it('抛出的异常必须包含明确的防毒警示信息（无涨跌停/T+0 有毒数据）', () => {
      const toxicDate = new Date('1995-01-01T00:00:00.000Z');
      try {
        HistoricalBarSource.validateBoundary({ publicFrom: toxicDate });
        fail('Should have thrown InvalidHistoricalDataBoundaryException');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidHistoricalDataBoundaryException);
        const ex = err as InvalidHistoricalDataBoundaryException;
        expect(ex.message).toContain('1996-12-16T00:00:00.000Z');
        expect(ex.message).toContain('toxic');
      }
    });

    it('恰好等于 1996-12-16T00:00:00.000Z 及以后的合法时间正常放行', () => {
      const validDates = [
        A_SHARE_DATA_MIN_BOUNDARY,
        new Date('1996-12-16T00:00:00.000Z'), // 涨跌停10%与T+1法定实施首日
        new Date('2005-05-01T00:00:00.000Z'), // 股权分置改革全流通基准
        new Date('2015-06-15T00:00:00.000Z'), // 2015 股灾
        new Date('2024-01-01T00:00:00.000Z'), // 现代微盘基准
      ];

      for (const validDate of validDates) {
        expect(() =>
          HistoricalBarSource.validateBoundary({ publicFrom: validDate }),
        ).not.toThrow();

        expect(() =>
          HistoricalBarSource.validateBoundary({ startDate: validDate }),
        ).not.toThrow();
      }
    });
  });

  describe('2. drive() 执行加载入口守门', () => {
    it('当 criteria 包含 1996-12-16 前有毒数据时，drive() 立即 reject 且绝不触发底层 I/O', async () => {
      const mock = createMockPort();
      const mockKernel = createMockKernel();

      const toxicCriteria: HistoricalReplayCriteria = {
        securityId: 1,
        selection: { kind: 'provider', source: 'tdx' },
        period: 1440,
        preWarmEndAt: new Date('1995-10-01T00:00:00.000Z'),
        publicFrom: new Date('1995-10-01T00:00:00.000Z'),
        endAt: new Date('1996-01-01T00:00:00.000Z'),
        requiredBars: 50,
      };

      const source = new HistoricalBarSource(mock.port, toxicCriteria);

      await expect(source.drive(mockKernel)).rejects.toThrow(
        InvalidHistoricalDataBoundaryException,
      );

      // 刚性断言：在底层 I/O 发生前立即被拦截，0 端口调用
      expect(mock.loadReplayWindowCalled).toBe(false);
      expect(mock.readReplayPageCalled).toBe(false);
      expect(mockKernel.push).not.toHaveBeenCalled();
    });

    it('当 criteria 包含显式 startDate 违规时，同样强力拦截', async () => {
      const mock = createMockPort();
      const mockKernel = createMockKernel();

      const toxicCriteria: HistoricalReplayCriteria = {
        securityId: 1,
        selection: { kind: 'provider', source: 'tdx' },
        period: 1440,
        startDate: new Date('1996-05-01T00:00:00.000Z'),
        preWarmEndAt: new Date('2000-01-01T00:00:00.000Z'),
        publicFrom: new Date('2000-01-01T00:00:00.000Z'),
        endAt: new Date('2000-05-01T00:00:00.000Z'),
        requiredBars: 50,
      };

      const source = new HistoricalBarSource(mock.port, toxicCriteria);

      await expect(source.drive(mockKernel)).rejects.toThrow(
        InvalidHistoricalDataBoundaryException,
      );
      expect(mock.loadReplayWindowCalled).toBe(false);
    });

    it('合法时间正常放行并调用底层端口加载数据', async () => {
      const mock = createMockPort();
      const mockKernel = createMockKernel();

      const validCriteria: HistoricalReplayCriteria = {
        securityId: 1,
        selection: { kind: 'provider', source: 'tdx' },
        period: 1440,
        preWarmEndAt: new Date('2005-05-01T00:00:00.000Z'),
        publicFrom: new Date('2005-05-01T00:00:00.000Z'),
        endAt: new Date('2005-06-01T00:00:00.000Z'),
        requiredBars: 50,
      };

      const source = new HistoricalBarSource(mock.port, validCriteria);
      const summary = await source.drive(mockKernel);

      expect(mock.loadReplayWindowCalled).toBe(true);
      expect(summary.barCount).toBe(0);
    });
  });
});
