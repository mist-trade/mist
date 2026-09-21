import {
  ChanFourQuadrantTactics,
  ChanTacticsContext,
  TacticalAction,
  TacticalQuadrant,
  TacticalQuadrantDecision,
} from '../contracts/chan-four-quadrant-tactics.interface';

/**
 * 标准公开兜底缠论战术实现
 * 当本地或生产环境未挂载私有法宝时，自动使用此公开基线实现，确保全流程平滑运行。
 */
export class StandardChanTactics implements ChanFourQuadrantTactics {
  readonly id = 'standard-chan-tactics';
  readonly name = 'Standard Chan Baseline Tactics';
  readonly version = '1.0.0';
  readonly author = 'Mist Open Core';

  evaluateLeftBuy(ctx: ChanTacticsContext): TacticalQuadrantDecision {
    return {
      triggered: false,
      quadrant: TacticalQuadrant.LeftBuy,
      price: ctx.lastPrice ?? 0,
      time: ctx.timestamp,
      confidence: 0,
      action: TacticalAction.None,
      reason: 'Standard baseline: no private left-buy tactics activated',
    };
  }

  evaluateRightBuy(ctx: ChanTacticsContext): TacticalQuadrantDecision {
    return {
      triggered: false,
      quadrant: TacticalQuadrant.RightBuy,
      price: ctx.lastPrice ?? 0,
      time: ctx.timestamp,
      confidence: 0,
      action: TacticalAction.None,
      reason: 'Standard baseline: no private right-buy tactics activated',
    };
  }

  evaluateLeftSell(ctx: ChanTacticsContext): TacticalQuadrantDecision {
    return {
      triggered: false,
      quadrant: TacticalQuadrant.LeftSell,
      price: ctx.lastPrice ?? 0,
      time: ctx.timestamp,
      confidence: 0,
      action: TacticalAction.None,
      reason: 'Standard baseline: no private left-sell tactics activated',
    };
  }

  evaluateRightSell(ctx: ChanTacticsContext): TacticalQuadrantDecision {
    return {
      triggered: false,
      quadrant: TacticalQuadrant.RightSell,
      price: ctx.lastPrice ?? 0,
      time: ctx.timestamp,
      confidence: 0,
      action: TacticalAction.None,
      reason: 'Standard baseline: no private right-sell tactics activated',
    };
  }
}
