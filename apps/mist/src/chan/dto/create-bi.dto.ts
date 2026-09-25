import { IsBoolean, IsNotEmpty, IsOptional } from 'class-validator';
import { KVo } from '../../indicator/vo/k.vo';

export class CreateBiDto {
  @IsNotEmpty({
    message: 'K线数据不能为空',
  })
  k!: KVo[];

  /**
   * 是否过滤顶底分型区间包含（工程防噪补丁）。
   * 默认 false（对齐缠论原典，不作分型包含过滤）。
   */
  @IsOptional()
  @IsBoolean()
  filterFenxingContainment?: boolean;
}
