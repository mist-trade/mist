import { ApiProperty } from '@nestjs/swagger';
import { DuanVo } from './duan.vo';
import { TrendDirection } from '../enums/trend-direction.enum';
import {
  ChannelLevel,
  ChannelStatus,
  ChannelType,
} from '../enums/channel.enum';
import type {
  ChanDuanChannel,
  ChanDuanChannelTwoPhaseResult,
} from '../types/chan-analysis.types';

export class DuanChannelVo implements ChanDuanChannel {
  @ApiProperty({ type: () => [DuanVo] })
  duans!: DuanVo[]; // 构成中枢的内部段

  @ApiProperty({ type: () => DuanVo })
  entryDuan!: DuanVo; // 进入段

  @ApiProperty({ type: () => DuanVo, required: false })
  leaveDuan?: DuanVo; // 离开段

  @ApiProperty()
  zg!: number; // 中枢上沿

  @ApiProperty()
  zd!: number; // 中枢下沿

  @ApiProperty()
  gg!: number; // 中枢最高

  @ApiProperty()
  dd!: number; // 中枢最低

  @ApiProperty({ enum: ChannelLevel })
  level!: ChannelLevel; // 中枢级别（段级 = Duan）

  @ApiProperty({ enum: ChannelType })
  type!: ChannelType;

  @ApiProperty({ enum: ChannelStatus })
  status!: ChannelStatus;

  @ApiProperty({ enum: TrendDirection })
  trend!: TrendDirection; // 趋势

  @ApiProperty({ required: false })
  extended?: boolean; // 中枢延伸融合产物标志

  @ApiProperty()
  expanded!: boolean; // 中枢扩展外层大框标志

  @ApiProperty({ enum: ChannelLevel, required: false })
  upgradedLevel?: ChannelLevel; // 升级目标级别

  @ApiProperty()
  startId!: number;

  @ApiProperty()
  endId!: number;
}

export class DuanChannelTwoPhaseVo implements ChanDuanChannelTwoPhaseResult {
  @ApiProperty({ type: () => [DuanChannelVo] })
  phaseA!: DuanChannelVo[];

  @ApiProperty({ type: () => [DuanChannelVo] })
  phaseB!: DuanChannelVo[];
}
