import { DECISION_ACTIONS } from '../../strategy.constants';
import type {
  FactorContext,
  FactorOpinion,
  FactorPlugin,
  FactorPluginMetadata,
} from '../factor.types';
import {
  PRICE_LEVEL_RULE_KINDS,
  type VirtualExitRule,
} from '../../virtual-exit/virtual-exit.port';

const PRICE_DEFENSE_SKIP_REASON =
  '价格防守出场插件仅声明虚拟出场规则，不参与因子求值';
const PRICE_DEFENSE_DISPLAY_TAG = 'EXIT_RULE_HOST';

/**
 * 价格防守出场插件（标准插件）。
 *
 * **硬止损的信号侧落地点**（2026-11-25 拍板：引擎不出方案，全部由插件决定；
 * 引擎只负责接受信号然后撮合交易）：策略定义在 DSL 节点 params 中声明阈值，
 * 本插件把它转换为通道级虚拟出场规则绑定（VirtualExitRule），由
 * `PriceLevelExitPolicy` 按通道虚拟持仓求值并产出 exit 信号——与真实信号
 * 同构地走引擎 decide（组内先出后进）与 Next-Bar 撮合。
 *
 * 插件无状态：只声明"什么条件算出场"，不持有持仓。
 */
export class PriceDefenseExitPlugin implements FactorPlugin {
  public readonly id = 'plugin.exit.price-defense';
  public readonly name = '价格防守出场插件';
  public readonly version = '1.0.0';
  public readonly description =
    '价格型防守出场规则声明（硬止损/保本/移动止盈/持仓超时）：策略定义 params 声明阈值，插件转换为通道级虚拟出场规则';
  public readonly category = 'EXIT' as const;
  public readonly role = 'signal' as const;

  public async evaluate(
    _context: FactorContext,
    _rawParams?: Record<string, unknown>,
  ): Promise<FactorOpinion> {
    void _context;
    void _rawParams;
    // 出场插件不产生因子观点（NEUTRAL 弃权）：决策流树中不作为信号源，
    // 仅通过 virtualExitRules 声明虚拟出场规则。
    return {
      action: DECISION_ACTIONS.NEUTRAL,
      confidence: 0,
      reason: PRICE_DEFENSE_SKIP_REASON,
      displayTag: PRICE_DEFENSE_DISPLAY_TAG,
    };
  }

  public virtualExitRules(
    params?: Record<string, unknown>,
  ): readonly VirtualExitRule[] {
    if (!params) return [];
    const rules: VirtualExitRule[] = [];
    if (typeof params.stopLossRatio === 'number' && params.stopLossRatio < 0) {
      rules.push({
        kind: PRICE_LEVEL_RULE_KINDS.STOP,
        lossRatio: params.stopLossRatio,
      });
    }
    if (
      typeof params.breakevenActivationGain === 'number' &&
      params.breakevenActivationGain > 0
    ) {
      rules.push({
        kind: PRICE_LEVEL_RULE_KINDS.BREAKEVEN,
        activationGain: params.breakevenActivationGain,
      });
    }
    if (
      typeof params.trailingActivationGain === 'number' &&
      params.trailingActivationGain > 0 &&
      typeof params.trailingDrawdownRatio === 'number' &&
      params.trailingDrawdownRatio > 0
    ) {
      rules.push({
        kind: PRICE_LEVEL_RULE_KINDS.TRAILING,
        activationGain: params.trailingActivationGain,
        drawdownRatio: params.trailingDrawdownRatio,
      });
    }
    if (
      typeof params.maxHoldingBars === 'number' &&
      params.maxHoldingBars > 0
    ) {
      rules.push({
        kind: PRICE_LEVEL_RULE_KINDS.TIME_EXPIRED,
        maxHoldingBars: params.maxHoldingBars,
      });
    }
    return rules;
  }
}

/** 供编译期校验与文档引用的元数据形状（不含运行时行为）。 */
export type PriceDefenseExitMetadata = FactorPluginMetadata;
