import {
  ChanCore,
  ChanBspType,
  ChannelType,
  type ChanBi,
  type ChanBspUnit,
  type ChanChannel,
  type ChanDivergenceZhongshu,
  type ChanDuan,
  type ChanDuanChannel,
  type ChanK,
} from '@app/chancore';
import { computeChanUnitForces } from '@app/indicators';
import type { ChanBspEvent, ChanBspEventType } from './chan-bsp.types';
import type { ChanBspUnitLevel } from '../chan-bsp-plan';

export interface ChanBspPipelineInput {
  readonly klines: readonly ChanK[];
  readonly units: ChanBspUnitLevel;
}

/**
 * Run the full Chan buy/sell point pipeline over one ordered K series:
 * merge → fenxing → bi → (duan + duan channels | bi channels) → momentum
 * forces (MACD directional histogram area + DIF extremes) →
 * ChanCore.detectBuySellPoints → ChanBspEvent mapping.
 *
 * Stateless and deterministic: the same input always yields the same output.
 * An empty or structurally insufficient series yields `[]` (not an error).
 */
export function runChanBspPipeline(
  input: ChanBspPipelineInput,
): readonly ChanBspEvent[] {
  if (input.klines.length === 0) return Object.freeze([]);
  const bis = ChanCore.createBi(input.klines);
  const phaseB = bis.phaseB;

  let units: readonly ChanBspUnit[];
  let zhongshus: readonly ChanDivergenceZhongshu[];
  if (input.units === 'duan') {
    const duans = ChanCore.createDuan(phaseB);
    const duanChannels = ChanCore.createDuanChannels(duans);
    units = duans.map(toBspUnit);
    zhongshus = duanChannels.phaseB.map(toZhongshu);
  } else {
    const channels = ChanCore.createChannels(input.klines);
    units = phaseB.map(toBspUnit);
    zhongshus = channels.phaseB.map(toZhongshu);
  }

  const forces = computeChanUnitForces(input.klines, units);
  const points = ChanCore.detectBuySellPoints({ units, zhongshus, forces });
  return Object.freeze(
    points.map((point) =>
      toEvent(point.type, point.unitIndex, point.price, {
        units: input.units,
        pointZhongshuIndex: point.zhongshuIndex,
        zhongshus,
        unitsByIndex: units,
      }),
    ),
  );
}

function toEvent(
  type: ChanBspType,
  unitIndex: number,
  price: number,
  context: {
    units: ChanBspUnitLevel;
    pointZhongshuIndex: number | null;
    zhongshus: readonly ChanDivergenceZhongshu[];
    unitsByIndex: readonly ChanBspUnit[];
  },
): ChanBspEvent {
  const unit = context.unitsByIndex[unitIndex];
  const zhongshu =
    context.pointZhongshuIndex === null
      ? null
      : (context.zhongshus[context.pointZhongshuIndex] ?? null);
  return Object.freeze({
    type: type as ChanBspEventType,
    units: context.units,
    time: unit.endTime,
    price,
    zhongshuIndex: context.pointZhongshuIndex,
    zg: zhongshu?.zg ?? null,
    zd: zhongshu?.zd ?? null,
    unitIndex,
  });
}

function toBspUnit(
  unit: Pick<
    ChanBi | ChanDuan,
    'startTime' | 'endTime' | 'high' | 'low' | 'trend'
  >,
): ChanBspUnit {
  return Object.freeze({
    startTime: unit.startTime,
    endTime: unit.endTime,
    high: unit.high,
    low: unit.low,
    trend: unit.trend,
  });
}

export function toZhongshu(
  channel: ChanChannel | ChanDuanChannel,
): ChanDivergenceZhongshu {
  const units = 'bis' in channel ? channel.bis : channel.duans;
  const first = units[0];
  if (!first) {
    throw new RangeError('chan channel must contain at least one unit');
  }

  let last = units[units.length - 1];
  // 针对已封存且含离开段的中枢（ChanChannel 长度为奇数且 >= 5，且非 9 笔扩展）：
  // 在缠论定义中，离开段是离开中枢的次级别走势，中枢本体在离开段起点（即倒数第 2 单元末端）结束。
  // 若中枢为未完成状态 (type === ChannelType.UnComplete)，units 本身即为中枢核心构件，无离开段，last 取末单元。
  if (channel.type === ChannelType.Complete && !channel.expanded) {
    if (
      'bis' in channel &&
      channel.bis.length >= 5 &&
      channel.bis.length % 2 === 1
    ) {
      last = channel.bis[channel.bis.length - 2];
    } else if (
      'duans' in channel &&
      channel.duans.length >= 4 &&
      channel.duans.length % 2 === 0
    ) {
      last = channel.duans[channel.duans.length - 2];
    }
  }

  return Object.freeze({
    firstUnitTime: first.startTime,
    lastUnitTime: last.endTime,
    zg: channel.zg,
    zd: channel.zd,
    gg: channel.gg,
    dd: channel.dd,
  });
}
