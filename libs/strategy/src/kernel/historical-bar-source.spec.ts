import type {
  StrategyBar,
  StrategyReplayMarketDataPort,
  StrategyReplayPageCriteria,
  StrategyReplayWindowCriteria,
} from '@app/market-data';
import { HistoricalBarSource, StrategyEvaluationKernel } from './index';
import type { VirtualExitPolicyPort } from '../virtual-exit';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import type { FactorPlugin } from '../factor/factor.types';
import type { DecisionFlowNode } from '../decision-flow/decision-flow.types';

function makeBar(
  securityId: number,
  securityCode: string,
  period: number,
  timestampIso: string,
  close: number,
  low = close,
): StrategyBar {
  return {
    securityId,
    securityCode,
    source: 'tdx',
    period,
    timestamp: new Date(timestampIso),
    open: close,
    high: close + 0.1,
    low,
    close,
    volume: '100',
    amount: String(Math.round(close * 100)),
    type: 'complete',
  };
}

describe('HistoricalBarSource (surveillancePeriods & externalContextRequirements)', () => {
  it('merges external bars before main bars by availability and forwards 5m surveillance exits to onSignal', async () => {
    const MAIN_ID = 1;
    const EXT_ID = 99;
    const seenExternalCloses: number[] = [];

    const mainEntryPlugin: FactorPlugin = {
      id: 'plugin.test.hbs-entry',
      name: 'hbs entry',
      category: 'TECHNICAL',
      version: '1.0.0',
      description: 'test',
      resolveExternalContextRequirements: () => [
        {
          securityCode: '000300',
          securityId: EXT_ID,
          period: 1440,
          minBars: 1,
        },
      ],
      evaluate: async (ctx) => {
        const extSeries = ctx.attributes.get('series.000300.1440') as
          | readonly { rawBar: StrategyBar }[]
          | undefined;
        if (extSeries?.length) {
          seenExternalCloses.push(
            extSeries[extSeries.length - 1]!.rawBar.close,
          );
        }
        return ctx.timestamp.toISOString() === '2026-01-05T00:00:00.000Z'
          ? { action: 'BUY', reason: 'd0 entry' }
          : { action: 'NEUTRAL', reason: 'hold' };
      },
    };

    const registry = new InMemoryFactorPluginRegistry();
    registry.register(mainEntryPlugin);
    const flow: DecisionFlowNode = {
      id: 'g',
      type: 'GUARD',
      name: 'g',
      pluginId: mainEntryPlugin.id,
      requiredAction: 'BUY',
      onPass: {
        id: 't',
        type: 'TERMINAL',
        action: 'BUY',
        signalTag: 'HBS_BUY',
        reason: 'ok',
      },
    };

    const exitPolicy: VirtualExitPolicyPort = {
      configure: jest.fn(),
      onSignal: jest.fn(),
      onBar: (bar, period) => {
        if (period === 5 && bar.low < 9.5) {
          return [
            {
              channel: { definitionId: 7, versionId: 1, period: 1440 },
              ownerPluginId: mainEntryPlugin.id,
              ruleId: 'surv-5m',
              exitKind: 'INTRADAY_DEFENSE_BREAKDOWN',
              reason: '5m breach',
              badgeText: '次级破线逃命',
            },
          ];
        }
        return [];
      },
    };

    const extPre = makeBar(
      EXT_ID,
      '000300',
      1440,
      '2026-01-02T00:00:00.000Z',
      3000,
    );
    const extPub = makeBar(
      EXT_ID,
      '000300',
      1440,
      '2026-01-05T00:00:00.000Z',
      3100,
    );
    const mainD0 = makeBar(
      MAIN_ID,
      '000001',
      1440,
      '2026-01-05T00:00:00.000Z',
      10.0,
    );
    const surv5m = makeBar(
      MAIN_ID,
      '000001',
      5,
      '2026-01-06T02:00:00.000Z',
      9.6,
      9.4,
    );
    const mainD1 = makeBar(
      MAIN_ID,
      '000001',
      1440,
      '2026-01-06T00:00:00.000Z',
      9.8,
    );

    const allBars = [extPre, extPub, mainD0, surv5m, mainD1];
    const port: StrategyReplayMarketDataPort = {
      loadReplayWindow: async (criteria: StrategyReplayWindowCriteria) => ({
        bars: allBars.filter(
          (b) =>
            b.securityId === criteria.securityId &&
            b.period === criteria.period &&
            b.timestamp < criteria.endAt,
        ),
      }),
      readReplayPage: async (criteria: StrategyReplayPageCriteria) => ({
        bars: allBars.filter(
          (b) =>
            b.securityId === criteria.securityId &&
            b.period === criteria.period &&
            b.timestamp >= criteria.startAt &&
            b.timestamp <= criteria.endAt,
        ),
        nextAfterTimestamp: null,
      }),
    };

    const publicFrom = new Date('2026-01-04T00:00:00.000Z');
    const kernel = new StrategyEvaluationKernel({
      securityId: MAIN_ID,
      securityCode: '000001',
      publicFrom,
      registry,
      virtualExitPolicy: exitPolicy,
      surveillancePeriods: [5],
      plans: [
        {
          definitionId: 7,
          versionId: 1,
          flow,
          ruleSnapshot: Object.freeze({}),
          period: 1440,
          requiredBarCount: 1,
          contextRequirements: {},
          externalContextRequirements: [
            {
              securityCode: '000300',
              securityId: EXT_ID,
              period: 1440,
              minBars: 1,
            },
          ],
          surveillancePeriods: [5],
        },
      ],
    });

    const source = new HistoricalBarSource(port, {
      securityId: MAIN_ID,
      securityCode: '000001',
      selection: { kind: 'canonical' },
      evaluationPeriod: 1440,
      contextPeriods: {},
      surveillancePeriods: [5],
      externalContextRequirements: [
        {
          securityCode: '000300',
          securityId: EXT_ID,
          period: 1440,
          minBars: 1,
        },
      ],
      preWarmEndAt: publicFrom,
      publicFrom,
      endAt: new Date('2026-01-07T00:00:00.000Z'),
      requiredBars: 1,
    });

    const emittedSignals: Array<{
      signalType: string;
      triggerPeriod?: number;
    }> = [];
    const pushedOnBarPeriods: number[] = [];
    const summary = await source.drive(
      kernel,
      (sig) => {
        emittedSignals.push({
          signalType: sig.signalType,
          triggerPeriod: sig.triggerPeriod,
        });
      },
      (bar) => {
        pushedOnBarPeriods.push(bar.period);
      },
    );

    expect(summary.publicBarCount).toBe(2);
    expect(pushedOnBarPeriods).toEqual([1440, 1440]);
    expect(seenExternalCloses[0]).toBe(3100);
    expect(emittedSignals).toEqual([
      { signalType: 'HBS_BUY', triggerPeriod: 1440 },
      { signalType: 'VIRTUAL_EXIT', triggerPeriod: 5 },
    ]);
  });
});
