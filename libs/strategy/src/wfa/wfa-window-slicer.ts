import { StrategyInputError } from '../strategy.errors';
import type { WfaFoldDefinition, WfaSliceOptions } from './wfa.types';

/**
 * 在 UTC 时间线上为指定日期累加自然月份。
 * 针对月末溢出（如 1月31日 + 1个月）进行月末自适应对齐（2月28/29日）。
 */
export function addMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const year = result.getUTCFullYear();
  const month = result.getUTCMonth();
  const day = result.getUTCDate();

  const targetMonth = month + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;

  // 获取目标月份的最大天数（下个月的第 0 天即当前月的最后一天）
  const lastDayOfMonth = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfMonth);

  result.setUTCFullYear(targetYear, normalizedMonth, clampedDay);
  return result;
}

/**
 * 切分 WFA (Walk-Forward Analysis) 滚动步进或起点锚定时间窗口。
 *
 * 严格确保：
 * 1. 时序严格单调递增：trainStartDate < trainEndDate === testStartDate < testEndDate <= endDate；
 * 2. 绝对因果律：测试集数据严格位于训练集之后，杜绝任何重叠与未来窥探；
 * 3. Rolling 模式：训练集滑窗固定平移；Anchored 模式：训练集起点锚定扩张。
 */
export function sliceWfaWindows(options: WfaSliceOptions): WfaFoldDefinition[] {
  const start = new Date(options.startDate);
  const end = new Date(options.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new StrategyInputError(
      'Invalid startDate or endDate provided to WFA slicer',
    );
  }

  if (start.getTime() >= end.getTime()) {
    throw new StrategyInputError(
      `startDate (${start.toISOString()}) must be before endDate (${end.toISOString()})`,
    );
  }

  const trainMonths = options.trainDurationMonths ?? 12;
  const testMonths = options.testDurationMonths ?? 3;
  const stepMonths = options.stepDurationMonths ?? testMonths;

  if (trainMonths <= 0 || testMonths <= 0 || stepMonths <= 0) {
    throw new StrategyInputError(
      'trainDurationMonths, testDurationMonths and stepDurationMonths must all be > 0',
    );
  }

  const folds: WfaFoldDefinition[] = [];
  let foldIndex = 0;

  // 起始训练与测试边界
  let currentTrainStart = new Date(start.getTime());

  while (true) {
    let trainStart: Date;
    let trainEnd: Date;

    if (options.windowType === 'anchored') {
      // Anchored: 训练起点永远固定在全局 start，终点每次随 stepMonths 扩张
      trainStart = new Date(start.getTime());
      trainEnd = addMonthsUtc(start, trainMonths + foldIndex * stepMonths);
    } else {
      // Rolling: 训练起点与终点同步平移
      trainStart = new Date(currentTrainStart.getTime());
      trainEnd = addMonthsUtc(trainStart, trainMonths);
    }

    const testStart = new Date(trainEnd.getTime());
    const testEnd = addMonthsUtc(testStart, testMonths);

    // 如果测试集截止时间超过全局 end，停止切分以防超出范围
    if (testEnd.getTime() > end.getTime()) {
      break;
    }

    folds.push({
      foldIndex,
      trainStartDate: trainStart.toISOString(),
      trainEndDate: trainEnd.toISOString(),
      testStartDate: testStart.toISOString(),
      testEndDate: testEnd.toISOString(),
    });

    foldIndex++;

    if (options.windowType === 'rolling') {
      currentTrainStart = addMonthsUtc(currentTrainStart, stepMonths);
    }
  }

  return folds;
}
