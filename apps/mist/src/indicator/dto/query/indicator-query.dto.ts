import { DataSource, Period } from '@app/shared-data';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  Matches,
} from 'class-validator';
import { BEIJING_DATE_REGEX } from '@app/timezone';

/**
 * Unified query DTO for all indicator endpoints
 * Supports optional data source selection
 */
export class IndicatorQueryDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  code!: string;

  @IsOptional()
  @IsEnum(DataSource, {
    message: `数据源必须是以下值之一: ${Object.values(DataSource).join(', ')}`,
  })
  source?: DataSource;

  @IsEnum(Period, {
    message: `周期必须是以下数值之一: ${Object.values(Period).join(', ')}`,
  })
  period!: Period;

  @IsNotEmpty({
    message: '开始日期不能为空',
  })
  @Matches(BEIJING_DATE_REGEX, {
    message: '开始日期格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS',
  })
  startDate!: string;

  @IsNotEmpty({
    message: '结束日期不能为空',
  })
  @Matches(BEIJING_DATE_REGEX, {
    message: '结束日期格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS',
  })
  endDate!: string;

  /**
   * 是否过滤顶底分型区间包含（工程防噪补丁）。
   * 默认 false（对齐缠论原典，不作分型包含过滤）。
   */
  @IsOptional()
  @IsBoolean()
  filterFenxingContainment?: boolean;
}
