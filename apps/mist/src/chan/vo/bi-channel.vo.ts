import { ApiProperty } from '@nestjs/swagger';
import { BiVo } from './bi.vo';
import { TrendDirection } from '../enums/trend-direction.enum';
import {
  ChannelLevel,
  ChannelStatus,
  ChannelType,
} from '../enums/channel.enum';
import type {
  ChanBiChannel,
  ChanBiChannelTwoPhaseResult,
} from '../types/chan-analysis.types';

export class BiChannelVo implements ChanBiChannel {
  @ApiProperty({ type: () => [BiVo] })
  bis!: BiVo[];

  @ApiProperty({ type: () => BiVo })
  entryBi!: BiVo;

  @ApiProperty({ type: () => BiVo, required: false })
  leaveBi?: BiVo;

  @ApiProperty()
  zg!: number; // 中枢上沿

  @ApiProperty()
  zd!: number; // 中枢下沿

  @ApiProperty()
  gg!: number; // 中枢最高

  @ApiProperty()
  dd!: number; // 中枢最低

  @ApiProperty({ enum: ChannelLevel })
  level!: ChannelLevel; // 中枢级别

  @ApiProperty({ enum: ChannelType })
  type!: ChannelType; // 中枢类型

  @ApiProperty({ enum: ChannelStatus })
  status!: ChannelStatus; // 中枢状态（Valid/Invalid，Phase B 用）

  @ApiProperty()
  startId!: number; // 起始的k线索引

  @ApiProperty()
  endId!: number; // 结束的k线索引

  @ApiProperty({ enum: TrendDirection })
  trend!: TrendDirection; // 趋势

  @ApiProperty({ required: false })
  extended?: boolean; // 中枢延伸融合产物标志

  @ApiProperty()
  expanded!: boolean; // 中枢扩展外层大框标志

  @ApiProperty({ enum: ChannelLevel, required: false })
  upgradedLevel?: ChannelLevel; // 升级目标级别
}

export class BiChannelTwoPhaseVo implements ChanBiChannelTwoPhaseResult {
  @ApiProperty({ type: () => [BiChannelVo] })
  phaseA!: BiChannelVo[];

  @ApiProperty({ type: () => [BiChannelVo] })
  phaseB!: BiChannelVo[];
}
