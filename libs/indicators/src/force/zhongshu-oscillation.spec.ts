import {
  classifyZhongshuZone,
  computeZhongshuOscillationObservation,
  computeZhongshuOscillationSeries,
} from './zhongshu-oscillation';

describe('Dynamic Zhongshu Oscillation Index Operator (zhongshu-oscillation)', () => {
  describe('Zone Classification', () => {
    it('accurately maps ZOI values to the five structural zones', () => {
      expect(classifyZhongshuZone(-0.05)).toBe('OUTSIDE_BELOW');
      expect(classifyZhongshuZone(0.0)).toBe('LOWER_SUPPORT');
      expect(classifyZhongshuZone(0.1)).toBe('LOWER_SUPPORT');
      expect(classifyZhongshuZone(0.2)).toBe('LOWER_SUPPORT');
      expect(classifyZhongshuZone(0.21)).toBe('NEUTRAL_CORE');
      expect(classifyZhongshuZone(0.5)).toBe('NEUTRAL_CORE');
      expect(classifyZhongshuZone(0.79)).toBe('NEUTRAL_CORE');
      expect(classifyZhongshuZone(0.8)).toBe('UPPER_RESISTANCE');
      expect(classifyZhongshuZone(0.95)).toBe('UPPER_RESISTANCE');
      expect(classifyZhongshuZone(1.0)).toBe('UPPER_RESISTANCE');
      expect(classifyZhongshuZone(1.01)).toBe('OUTSIDE_ABOVE');
    });
  });

  describe('Edge cases and fallbacks', () => {
    it('safely handles flat central (ZG == ZD) by returning 0.5 and NEUTRAL_CORE', () => {
      const obs = computeZhongshuOscillationObservation(100, 100, 100);
      expect(obs.zoi).toBe(0.5);
      expect(obs.zone).toBe('NEUTRAL_CORE');

      const series = computeZhongshuOscillationSeries([90, 100, 110], 100, 100);
      expect(series.zoi).toEqual([0.5, 0.5, 0.5]);
      expect(series.zone).toEqual([
        'NEUTRAL_CORE',
        'NEUTRAL_CORE',
        'NEUTRAL_CORE',
      ]);
    });

    it('safely handles inverted central (ZG < ZD) by returning 0.5 and NEUTRAL_CORE', () => {
      const obs = computeZhongshuOscillationObservation(100, 110, 100);
      expect(obs.zoi).toBe(0.5);
      expect(obs.zone).toBe('NEUTRAL_CORE');

      const series = computeZhongshuOscillationSeries([100], 110, 100);
      expect(series.zoi).toEqual([0.5]);
      expect(series.zone).toEqual(['NEUTRAL_CORE']);
    });

    it('handles empty series gracefully', () => {
      const series = computeZhongshuOscillationSeries([], 100, 200);
      expect(series.begIndex).toBe(0);
      expect(series.zoi).toHaveLength(0);
      expect(series.zone).toHaveLength(0);
    });
  });

  describe('Bi Central Dynamic Narrowing Scenario', () => {
    it('correctly adapts when bi central boundaries dynamically narrow', () => {
      // Step 1: Initial broad central [100, 200]
      const price = 170;
      const initialObs = computeZhongshuOscillationObservation(price, 100, 200);
      // (170 - 100) / (200 - 100) = 0.70 -> NEUTRAL_CORE
      expect(initialObs.zoi).toBeCloseTo(0.7, 6);
      expect(initialObs.zone).toBe('NEUTRAL_CORE');

      // Step 2: Next internal bi narrows the central to [120, 180]
      const narrowedObs = computeZhongshuOscillationObservation(
        price,
        120,
        180,
      );
      // (170 - 120) / (180 - 120) = 50 / 60 = 0.833333 -> UPPER_RESISTANCE
      expect(narrowedObs.zoi).toBeCloseTo(5 / 6, 6);
      expect(narrowedObs.zone).toBe('UPPER_RESISTANCE');
    });
  });

  describe('Duan Central 3-Duan Invariant Scenario', () => {
    it('maintains fixed evaluation baseline across extending duans for locked 3-duan central', () => {
      // Duan central locked by first 3 duans at [100, 200]
      const zdLocked = 100;
      const zgLocked = 200;

      const prices = [110, 150, 190, 210, 95];
      const series = computeZhongshuOscillationSeries(
        prices,
        zdLocked,
        zgLocked,
      );

      expect(series.zoi[0]).toBeCloseTo(0.1, 6); // 110 -> LOWER_SUPPORT
      expect(series.zone[0]).toBe('LOWER_SUPPORT');

      expect(series.zoi[1]).toBeCloseTo(0.5, 6); // 150 -> NEUTRAL_CORE
      expect(series.zone[1]).toBe('NEUTRAL_CORE');

      expect(series.zoi[2]).toBeCloseTo(0.9, 6); // 190 -> UPPER_RESISTANCE
      expect(series.zone[2]).toBe('UPPER_RESISTANCE');

      expect(series.zoi[3]).toBeCloseTo(1.1, 6); // 210 -> OUTSIDE_ABOVE
      expect(series.zone[3]).toBe('OUTSIDE_ABOVE');

      expect(series.zoi[4]).toBeCloseTo(-0.05, 6); // 95 -> OUTSIDE_BELOW
      expect(series.zone[4]).toBe('OUTSIDE_BELOW');
    });
  });

  describe('Observation and Series Parity', () => {
    it('observation result matches trailing element of series result', () => {
      const closes = [105, 120, 135, 180, 195];
      const zd = 100;
      const zg = 200;

      const series = computeZhongshuOscillationSeries(closes, zd, zg);
      const obs = computeZhongshuOscillationObservation(closes.at(-1)!, zd, zg);

      expect(obs.zoi).toBeCloseTo(series.zoi.at(-1)!, 10);
      expect(obs.zone).toBe(series.zone.at(-1)!);
    });
  });
});
