import { KBoundaryCalculator } from './k-boundary-calculator';
import { Period } from '@app/shared-data';

describe('KBoundaryCalculator', () => {
  let calculator: KBoundaryCalculator;

  beforeEach(() => {
    calculator = new KBoundaryCalculator();
  });

  describe('calculateMinuteCandle', () => {
    it('should return 9:31-9:32 for 1min at 9:32', () => {
      const triggerTime = new Date('2026-03-30T09:32:00+08:00');
      const result = calculator.calculateMinuteCandle(
        Period.ONE_MIN,
        triggerTime,
      );
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T09:31:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T09:32:00+08:00'));
    });

    it('should return 9:30-9:35 for 5min at 9:36', () => {
      const triggerTime = new Date('2026-03-30T09:36:00+08:00');
      const result = calculator.calculateMinuteCandle(
        Period.FIVE_MIN,
        triggerTime,
      );
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T09:30:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T09:35:00+08:00'));
    });

    it('should return 9:30-9:33 for 3min at 9:34', () => {
      const triggerTime = new Date('2026-03-30T09:34:00+08:00');
      const result = calculator.calculateMinuteCandle(
        Period.THREE_MIN,
        triggerTime,
      );
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T09:30:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T09:33:00+08:00'));
    });

    it('should return 9:30-9:45 for 15min at 9:46', () => {
      const triggerTime = new Date('2026-03-30T09:46:00+08:00');
      const result = calculator.calculateMinuteCandle(
        Period.FIFTEEN_MIN,
        triggerTime,
      );
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T09:30:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T09:45:00+08:00'));
    });

    it('should return 9:30-10:00 for 30min at 10:01', () => {
      const triggerTime = new Date('2026-03-30T10:01:00+08:00');
      const result = calculator.calculateMinuteCandle(
        Period.THIRTY_MIN,
        triggerTime,
      );
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T09:30:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T10:00:00+08:00'));
    });

    it('should return 9:30-10:30 for 60min at 10:31', () => {
      const triggerTime = new Date('2026-03-30T10:31:00+08:00');
      const result = calculator.calculateMinuteCandle(
        Period.SIXTY_MIN,
        triggerTime,
      );
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T09:30:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T10:30:00+08:00'));
    });

    it('should return 13:00-14:00 for 60min at 14:01 (afternoon session)', () => {
      const triggerTime = new Date('2026-03-30T14:01:00+08:00');
      const result = calculator.calculateMinuteCandle(
        Period.SIXTY_MIN,
        triggerTime,
      );
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T13:00:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T14:00:00+08:00'));
    });

    it('should return null for trigger time during lunch break (12:31)', () => {
      const triggerTime = new Date('2026-03-30T12:31:00+08:00');
      const result = calculator.calculateMinuteCandle(
        Period.FIVE_MIN,
        triggerTime,
      );
      expect(result).toBeNull();
    });

    it('should return null for trigger time at night (23:31)', () => {
      const triggerTime = new Date('2026-03-30T23:31:00+08:00');
      const result = calculator.calculateMinuteCandle(
        Period.SIXTY_MIN,
        triggerTime,
      );
      expect(result).toBeNull();
    });

    it('should return null for trigger time at early morning (8:00)', () => {
      const triggerTime = new Date('2026-03-30T08:00:00+08:00');
      const result = calculator.calculateMinuteCandle(
        Period.ONE_MIN,
        triggerTime,
      );
      expect(result).toBeNull();
    });

    it('should return 13:00-13:05 for 5min at 13:06 (afternoon session start)', () => {
      const triggerTime = new Date('2026-03-30T13:06:00+08:00');
      const result = calculator.calculateMinuteCandle(
        Period.FIVE_MIN,
        triggerTime,
      );
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T13:00:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T13:05:00+08:00'));
    });

    it('should return 11:00-11:30 for 30min at 11:31 (near morning session end)', () => {
      const triggerTime = new Date('2026-03-30T11:31:00+08:00');
      const result = calculator.calculateMinuteCandle(
        Period.THIRTY_MIN,
        triggerTime,
      );
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T11:00:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T11:30:00+08:00'));
    });
  });

  describe('calculateDailyPlusCandle', () => {
    it('should return today 00:00 - next day 00:00 for daily', () => {
      const triggerTime = new Date('2026-03-30T18:00:00+08:00');
      const result = calculator.calculateDailyPlusCandle(
        Period.DAY,
        triggerTime,
      );
      expect(result.startTime).toEqual(new Date('2026-03-30T00:00:00+08:00'));
      expect(result.endTime).toEqual(new Date('2026-03-31T00:00:00+08:00'));
    });

    it('should return Monday - next Monday for weekly (triggered on Friday)', () => {
      // 2026-03-27 is a Friday
      const triggerTime = new Date('2026-03-27T18:00:00+08:00');
      const result = calculator.calculateDailyPlusCandle(
        Period.WEEK,
        triggerTime,
      );
      expect(result.startTime).toEqual(new Date('2026-03-23T00:00:00+08:00'));
      expect(result.endTime).toEqual(new Date('2026-03-30T00:00:00+08:00'));
      expect(result.endTime.getTime() - result.startTime.getTime()).toBe(
        7 * 24 * 60 * 60 * 1000,
      );
    });

    it('should return March 1 - April 1 for monthly (triggered in March)', () => {
      const triggerTime = new Date('2026-03-30T18:00:00+08:00');
      const result = calculator.calculateDailyPlusCandle(
        Period.MONTH,
        triggerTime,
      );
      expect(result.startTime).toEqual(new Date('2026-03-01T00:00:00+08:00'));
      expect(result.endTime).toEqual(new Date('2026-04-01T00:00:00+08:00'));
    });

    it('should return quarter start - next quarter start for quarterly', () => {
      // February is in Q1 (Jan-Mar)
      const triggerTime = new Date('2026-02-28T18:00:00+08:00');
      const result = calculator.calculateDailyPlusCandle(
        Period.QUARTER,
        triggerTime,
      );
      expect(result.startTime).toEqual(new Date('2026-01-01T00:00:00+08:00'));
      expect(result.endTime).toEqual(new Date('2026-04-01T00:00:00+08:00'));
    });

    it('should return Jan 1 - next Jan 1 for yearly', () => {
      const triggerTime = new Date('2026-03-30T18:00:00+08:00');
      const result = calculator.calculateDailyPlusCandle(
        Period.YEAR,
        triggerTime,
      );
      expect(result.startTime).toEqual(new Date('2026-01-01T00:00:00+08:00'));
      expect(result.endTime).toEqual(new Date('2027-01-01T00:00:00+08:00'));
    });

    it('should return Jan 1 - Jul 1 for first-half yearly candles', () => {
      const triggerTime = new Date('2026-03-30T18:00:00+08:00');
      const result = calculator.calculateDailyPlusCandle(
        Period.HALF_YEAR,
        triggerTime,
      );
      expect(result.startTime).toEqual(new Date('2026-01-01T00:00:00+08:00'));
      expect(result.endTime).toEqual(new Date('2026-07-01T00:00:00+08:00'));
    });

    it('should return Jul 1 - next Jan 1 for second-half yearly candles', () => {
      const triggerTime = new Date('2026-09-30T18:00:00+08:00');
      const result = calculator.calculateDailyPlusCandle(
        Period.HALF_YEAR,
        triggerTime,
      );
      expect(result.startTime).toEqual(new Date('2026-07-01T00:00:00+08:00'));
      expect(result.endTime).toEqual(new Date('2027-01-01T00:00:00+08:00'));
    });
  });

  describe('calculate (dispatcher)', () => {
    it('should delegate to calculateMinuteCandle for minute periods', () => {
      const triggerTime = new Date('2026-03-30T09:36:00+08:00');
      const result = calculator.calculate(Period.FIVE_MIN, triggerTime);
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T09:30:00+08:00'));
      expect(result!.endTime).toEqual(new Date('2026-03-30T09:35:00+08:00'));
    });

    it('should delegate to calculateDailyPlusCandle for daily+ periods', () => {
      const triggerTime = new Date('2026-03-30T18:00:00+08:00');
      const result = calculator.calculate(Period.DAY, triggerTime);
      expect(result).not.toBeNull();
      expect(result!.startTime).toEqual(new Date('2026-03-30T00:00:00+08:00'));
    });

    it('should return null for minute period outside trading hours', () => {
      const triggerTime = new Date('2026-03-30T23:00:00+08:00');
      const result = calculator.calculate(Period.FIVE_MIN, triggerTime);
      expect(result).toBeNull();
    });
  });
});
