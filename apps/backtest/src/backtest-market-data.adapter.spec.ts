import { DataSource, Period } from '@app/shared-data';
import type {
  ReplayDataSelection,
  StrategyReplayWindowCriteria,
} from '@app/market-data';
import { CanonicalPolicyLoader } from '@app/strategy';
import { BacktestMarketDataAdapter } from './backtest-market-data.adapter';

function makeBuilder(rows: unknown[]) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'limit',
  ]) {
    builder[method] = jest.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  }
  builder.getMany = jest.fn().mockResolvedValue(rows);
  return { builder, calls };
}

function row(timestamp: string, source: DataSource = DataSource.TDX) {
  return {
    securityId: 7,
    source,
    period: Period.ONE_MIN,
    timestamp: new Date(timestamp),
    open: '10.00',
    high: '11.00',
    low: '9.00',
    close: '10.50',
    volume: '100',
    amount: '12.345',
  };
}

const PROVIDER_TDX: ReplayDataSelection = { kind: 'provider', source: 'tdx' };
const PROVIDER_VENDOR: ReplayDataSelection = {
  kind: 'provider',
  source: 'vendor_a',
};
const CANONICAL: ReplayDataSelection = { kind: 'canonical' };

const POLICY = {
  version: 'test-v1',
  defaults: {
    '1': [
      { source: DataSource.VENDOR_A, before: '2025-07-04' },
      { source: DataSource.QMT },
    ],
  },
};

describe('BacktestMarketDataAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('legacy provider replay', () => {
    it('uses source-exact keyset criteria and only maps returned rows', async () => {
      const query = makeBuilder([row('2026-08-04T01:30:00.000Z')]);
      const repository = {
        createQueryBuilder: jest.fn().mockReturnValue(query.builder),
      };
      const adapter = new BacktestMarketDataAdapter(repository as never);

      const page = await adapter.readReplayPage({
        securityId: 7,
        selection: PROVIDER_TDX,
        period: Period.ONE_MIN,
        startAt: new Date('2026-08-04T01:30:00.000Z'),
        endAt: new Date('2026-08-04T02:30:00.000Z'),
      });

      expect(repository.createQueryBuilder).toHaveBeenCalledWith('k');
      expect(query.calls).toContainEqual({
        method: 'andWhere',
        args: ['k.source = :source', { source: 'tdx' }],
      });
      expect(query.calls).toContainEqual({
        method: 'orderBy',
        args: ['k.timestamp', 'ASC'],
      });
      expect(query.builder.limit).toHaveBeenCalledWith(1000);
      expect(page.bars).toHaveLength(1);
      expect(page.nextAfterTimestamp).toBeNull();
    });

    it('replays a vendor provider source', async () => {
      const query = makeBuilder([
        row('2026-08-04T01:30:00.000Z', DataSource.VENDOR_A),
      ]);
      const adapter = new BacktestMarketDataAdapter({
        createQueryBuilder: jest.fn().mockReturnValue(query.builder),
      } as never);

      const page = await adapter.readReplayPage({
        securityId: 7,
        selection: PROVIDER_VENDOR,
        period: Period.FIVE_MIN,
        startAt: new Date('2026-08-04T01:30:00.000Z'),
        endAt: new Date('2026-08-04T02:30:00.000Z'),
      });

      expect(query.calls).toContainEqual({
        method: 'andWhere',
        args: ['k.source = :source', { source: 'vendor_a' }],
      });
      expect(page.bars[0].source).toBe('vendor_a');
    });

    it('adds a strict timestamp cursor only on later pages', async () => {
      const afterTimestamp = new Date('2026-08-04T01:30:00.000Z');
      const query = makeBuilder([row('2026-08-04T01:31:00.000Z')]);
      const adapter = new BacktestMarketDataAdapter({
        createQueryBuilder: jest.fn().mockReturnValue(query.builder),
      } as never);

      await adapter.readReplayPage({
        securityId: 7,
        selection: PROVIDER_TDX,
        period: Period.ONE_MIN,
        startAt: new Date('2026-08-04T01:30:00.000Z'),
        endAt: new Date('2026-08-04T02:30:00.000Z'),
        afterTimestamp,
      });

      expect(query.calls).toContainEqual({
        method: 'andWhere',
        args: ['k.timestamp > :afterTimestamp', { afterTimestamp }],
      });
    });

    it('loads the last bars strictly before endAt and returns them ascending', async () => {
      const find = jest
        .fn()
        .mockResolvedValue([
          row('2026-08-04T01:31:00.000Z'),
          row('2026-08-04T01:30:00.000Z'),
        ]);
      const adapter = new BacktestMarketDataAdapter({ find } as never);

      const window = await adapter.loadReplayWindow({
        securityId: 7,
        selection: PROVIDER_TDX,
        period: Period.ONE_MIN,
        endAt: new Date('2026-08-04T01:32:00.000Z'),
        requiredBars: 5,
      });

      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ source: DataSource.TDX }),
          order: { timestamp: 'DESC' },
          take: 5,
        }),
      );
      expect(window.bars).toHaveLength(2);
      expect(window.bars[1].timestamp.toISOString()).toBe(
        '2026-08-04T01:31:00.000Z',
      );
    });

    it('returns an empty window when no bar precedes endAt', async () => {
      const adapter = new BacktestMarketDataAdapter({
        find: jest.fn().mockResolvedValue([]),
      } as never);

      const window = await adapter.loadReplayWindow({
        securityId: 7,
        selection: { kind: 'provider', source: 'qmt' },
        period: Period.ONE_MIN,
        endAt: new Date('2026-08-04T01:32:00.000Z'),
        requiredBars: 5,
      });

      expect(window.bars).toEqual([]);
    });

    it.each<[string, StrategyReplayWindowCriteria]>([
      [
        'securityId',
        {
          securityId: 0,
          selection: PROVIDER_TDX,
          period: 1,
          endAt: new Date(),
          requiredBars: 2,
        },
      ],
      [
        'source',
        {
          securityId: 1,
          selection: { kind: 'provider', source: 'ef' as never },
          period: 1,
          endAt: new Date(),
          requiredBars: 2,
        },
      ],
      [
        'endAt',
        {
          securityId: 1,
          selection: PROVIDER_TDX,
          period: 1,
          endAt: new Date('nope'),
          requiredBars: 2,
        },
      ],
      [
        'requiredBars',
        {
          securityId: 1,
          selection: PROVIDER_TDX,
          period: 1,
          endAt: new Date(),
          requiredBars: 0,
        },
      ],
    ])('rejects invalid window criteria: %s', async (_label, criteria) => {
      const adapter = new BacktestMarketDataAdapter({} as never);
      await expect(adapter.loadReplayWindow(criteria)).rejects.toThrow();
    });
  });

  describe('canonical replay', () => {
    beforeEach(() => {
      jest
        .spyOn(CanonicalPolicyLoader, 'load')
        .mockReturnValue(POLICY as never);
    });

    it('reads canonical segments without a provider selection', async () => {
      const vendorQuery = makeBuilder([
        row('2025-06-02T01:30:00.000Z', DataSource.VENDOR_A),
        row('2025-06-03T01:30:00.000Z', DataSource.VENDOR_A),
      ]);
      const qmtQuery = makeBuilder([]);
      const adapter = new BacktestMarketDataAdapter({
        createQueryBuilder: jest
          .fn()
          .mockReturnValueOnce(vendorQuery.builder)
          .mockReturnValueOnce(qmtQuery.builder),
      } as never);

      const page = await adapter.readReplayPage({
        securityId: 7,
        securityCode: '000001',
        selection: CANONICAL,
        period: Period.ONE_MIN,
        startAt: new Date('2025-06-01T00:00:00.000Z'),
        endAt: new Date('2025-07-10T00:00:00.000Z'),
      });

      expect(vendorQuery.calls).toContainEqual({
        method: 'andWhere',
        args: ['k.source = :source', { source: DataSource.VENDOR_A }],
      });
      expect(page.bars).toHaveLength(2);
      expect(page.bars[0].source).toBe('vendor_a');
    });

    it('requires a security code to resolve overrides', async () => {
      const adapter = new BacktestMarketDataAdapter({} as never);

      await expect(
        adapter.readReplayPage({
          securityId: 7,
          selection: CANONICAL,
          period: Period.ONE_MIN,
          startAt: new Date('2025-06-01T00:00:00.000Z'),
          endAt: new Date('2025-07-10T00:00:00.000Z'),
        }),
      ).rejects.toThrow(/securityCode/);
    });

    it('loads a canonical window across segment boundaries', async () => {
      const qmtQuery = makeBuilder([
        row('2025-07-04T01:30:00.000Z', DataSource.QMT),
      ]);
      const vendorQuery = makeBuilder([
        row('2025-07-03T01:30:00.000Z', DataSource.VENDOR_A),
      ]);
      const adapter = new BacktestMarketDataAdapter({
        createQueryBuilder: jest
          .fn()
          .mockReturnValueOnce(qmtQuery.builder)
          .mockReturnValueOnce(vendorQuery.builder),
      } as never);

      const window = await adapter.loadReplayWindow({
        securityId: 7,
        securityCode: '000001',
        selection: CANONICAL,
        period: Period.ONE_MIN,
        endAt: new Date('2025-07-10T00:00:00.000Z'),
        requiredBars: 2,
      });

      expect(window.bars).toHaveLength(2);
      expect(window.bars[0].timestamp.getTime()).toBeLessThan(
        window.bars[1].timestamp.getTime(),
      );
    });
  });
});
