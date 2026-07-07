import { Injectable } from '@nestjs/common';
import { K } from '@app/shared-data';

export type StrategyEvaluationContext = {
  k: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: bigint;
    amount: number;
    timestamp: Date;
  };
  security: {
    code: string;
    type?: string;
  };
};

@Injectable()
export class StrategyEvaluationContextBuilder {
  buildFromK(k: K): StrategyEvaluationContext {
    return {
      k: {
        open: Number(k.open),
        high: Number(k.high),
        low: Number(k.low),
        close: Number(k.close),
        volume: k.volume,
        amount: Number(k.amount),
        timestamp: k.timestamp,
      },
      security: {
        code: k.security.code,
        type: String(k.security.type),
      },
    };
  }
}
