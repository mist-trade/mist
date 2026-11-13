import type {
  FactorContext,
  FactorOpinion,
  FactorPlugin,
} from '../factor.types';

export interface NorthboundCapitalParams {
  readonly minInflowWan?: number;
  readonly minInflowRatio?: number;
  readonly attributeKey?: string;
}

/**
 * 资金面示范插件：北向资金 / 聪明钱流向插件
 * 评估北向资金净流入额或持股增仓幅度，辅助确认机构资金偏好
 */
export class NorthboundCapitalPlugin implements FactorPlugin {
  public readonly id = 'plugin.capital.northbound';
  public readonly name = '北向外资加仓异动插件';
  public readonly category = 'CAPITAL' as const;
  public readonly version = '1.0.0';
  public readonly description =
    '跟踪北向资金与机构流动性异动，资金净流入大于指定阈值时提供加权看多支持';

  public readonly paramSchema = {
    minInflowWan: {
      type: 'number',
      default: 1000,
      description: '北向资金单日最小净买入金额（万元）',
    },
    minInflowRatio: {
      type: 'number',
      description:
        '北向资金单日净买入占当日成交额比例（如 0.05 代表 5% 无量纲比例，优先于绝对金额）',
    },
  };

  public async evaluate(
    context: FactorContext,
    rawParams?: Record<string, unknown>,
  ): Promise<FactorOpinion> {
    const minInflowWan =
      typeof rawParams?.minInflowWan === 'number'
        ? rawParams.minInflowWan
        : 1000;
    const minInflowRatio =
      typeof rawParams?.minInflowRatio === 'number'
        ? rawParams.minInflowRatio
        : undefined;
    const attrKey =
      (rawParams?.attributeKey as string) ?? 'capital.northbound_inflow_wan';

    let netInflowWan: number | undefined;

    if (context.attributes.has(attrKey)) {
      netInflowWan = Number(context.attributes.get(attrKey));
    } else if (typeof rawParams?.mockInflowWan === 'number') {
      netInflowWan = rawParams.mockInflowWan;
    } else if (context.featureProvider) {
      const feat = await context.featureProvider.getFeature(
        'northbound_inflow',
        context.securityCode,
      );
      if (typeof feat === 'number') netInflowWan = feat;
    }

    if (netInflowWan === undefined) {
      return {
        action: 'NEUTRAL',
        confidence: 0.0,
        reason: '未检测到北向资金数据，保持中立弃权',
      };
    }

    // 优先：无量纲成交额比例判定（自适应千亿与十亿盘子）
    const turnoverAmount =
      typeof context.attributes?.get('bar.amount') === 'number'
        ? Number(context.attributes.get('bar.amount'))
        : typeof rawParams?.mockTurnoverAmount === 'number'
          ? rawParams.mockTurnoverAmount
          : undefined;

    if (minInflowRatio !== undefined && turnoverAmount && turnoverAmount > 0) {
      const netInflowYuan = netInflowWan * 10000;
      const inflowRatio = netInflowYuan / turnoverAmount;
      if (inflowRatio >= minInflowRatio) {
        const excess = Math.min(
          1.0,
          (inflowRatio - minInflowRatio) / minInflowRatio,
        );
        return {
          action: 'BUY',
          confidence: Math.min(0.95, 0.75 + excess * 0.2),
          reason: `北向资金净流入占比 ${(inflowRatio * 100).toFixed(2)}% (阈值: ${(minInflowRatio * 100).toFixed(2)}%)，外资大幅加仓`,
          evidence: {
            netInflowWan,
            inflowRatio,
            minInflowRatio,
            turnoverAmount,
          },
        };
      }

      if (inflowRatio <= -minInflowRatio) {
        return {
          action: 'SELL',
          confidence: 0.85,
          reason: `北向资金大幅净流出占比 ${(Math.abs(inflowRatio) * 100).toFixed(2)}% (阈值: ${(minInflowRatio * 100).toFixed(2)}%)，存在机构减仓风险`,
          evidence: {
            netInflowWan,
            inflowRatio,
            minInflowRatio,
            turnoverAmount,
          },
        };
      }

      return {
        action: 'NEUTRAL',
        confidence: 0.0,
        reason: `北向资金流动平稳 (占比 ${(inflowRatio * 100).toFixed(2)}%)，未触发增减仓异动`,
        evidence: {
          netInflowWan,
          inflowRatio,
          minInflowRatio,
        },
      };
    }

    if (netInflowWan >= minInflowWan) {
      const excess = Math.min(
        1.0,
        (netInflowWan - minInflowWan) / minInflowWan,
      );
      const confidence = Math.min(0.95, 0.75 + excess * 0.2);

      return {
        action: 'BUY',
        confidence,
        reason: `北向资金净流入 ${netInflowWan.toFixed(1)} 万元 (阈值: ${minInflowWan} 万元)，主力加仓意愿强烈`,
        evidence: {
          netInflowWan,
          minInflowWan,
        },
      };
    }

    if (netInflowWan <= -minInflowWan) {
      return {
        action: 'SELL',
        confidence: 0.85,
        reason: `北向资金大幅净流出 ${Math.abs(netInflowWan).toFixed(1)} 万元，存在机构减仓风险`,
        evidence: {
          netInflowWan,
          minInflowWan,
        },
      };
    }

    return {
      action: 'NEUTRAL',
      confidence: 0.0,
      reason: `北向资金流动平稳 (${netInflowWan.toFixed(1)} 万元)，未触发增减仓异动`,
      evidence: {
        netInflowWan,
        minInflowWan,
      },
    };
  }
}
