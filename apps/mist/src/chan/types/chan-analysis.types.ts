import type { KVo } from '../../indicator/vo/k.vo';
import type { BiStatus, BiType } from '../enums/bi.enum';
import type {
  ChannelLevel,
  ChannelStatus,
  ChannelType,
} from '../enums/channel.enum';
import type { DuanStatus, DuanType } from '../enums/duan.enum';
import type { FenxingType } from '../enums/fenxing.enum';
import type { TrendDirection } from '../enums/trend-direction.enum';

export interface ChanMergedK {
  startTime: Date;
  endTime: Date;
  high: number;
  low: number;
  trend: TrendDirection;
  mergedCount: number;
  mergedIds: number[];
  mergedData: KVo[];
}

export interface ChanFenxing {
  leftIds: number[];
  middleIds: number[];
  rightIds: number[];
  middleIndex: number;
  middleOriginId: number;
  type: FenxingType;
  high: number;
  low: number;
}

export interface ChanBi {
  startTime: Date;
  endTime: Date;
  high: number;
  low: number;
  trend: TrendDirection;
  type: BiType;
  status: BiStatus;
  independentCount: number;
  originIds: number[];
  originData: KVo[];
  startFenxing: ChanFenxing | null;
  endFenxing: ChanFenxing | null;
}

export interface ChanBiTwoPhaseResult {
  phaseA: ChanBi[];
  phaseB: ChanBi[];
}

export interface ChanDuan {
  startTime: Date;
  endTime: Date;
  high: number;
  low: number;
  trend: TrendDirection;
  type: DuanType;
  status: DuanStatus;
  independentCount: number;
  originIds: number[];
  originBis: ChanBi[];
  startBi: ChanBi | null;
  endBi: ChanBi | null;
}

export interface ChanBiChannel {
  bis: ChanBi[];
  entryBi: ChanBi;
  leaveBi?: ChanBi;
  zg: number;
  zd: number;
  gg: number;
  dd: number;
  level: ChannelLevel;
  type: ChannelType;
  status: ChannelStatus;
  trend: TrendDirection;
  extended?: boolean;
  expanded: boolean;
  upgradedLevel?: ChannelLevel;
  startId: number;
  endId: number;
}

export interface ChanBiChannelTwoPhaseResult {
  phaseA: ChanBiChannel[];
  phaseB: ChanBiChannel[];
}

export interface ChanDuanChannel {
  duans: ChanDuan[];
  entryDuan: ChanDuan;
  leaveDuan?: ChanDuan;
  zg: number;
  zd: number;
  gg: number;
  dd: number;
  level: ChannelLevel;
  type: ChannelType;
  status: ChannelStatus;
  trend: TrendDirection;
  extended?: boolean;
  expanded: boolean; // 中枢扩展外层大框标志
  upgradedLevel?: ChannelLevel;
  startId: number;
  endId: number;
}

export interface ChanDuanChannelTwoPhaseResult {
  phaseA: ChanDuanChannel[];
  phaseB: ChanDuanChannel[];
}
