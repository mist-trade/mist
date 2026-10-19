import {
  computeBiSlopeObservation,
  computeBiSlopeSeries,
  BiSlopeUnitInput,
} from './chan-slope';

describe('Bi Slope & Velocity Ratio Operator (chan-slope)', () => {
  describe('computeBiSlopeObservation', () => {
    it('handles single unit without prior correctly', () => {
      const current: BiSlopeUnitInput = { priceChange: 15, barCount: 5 };
      const obs = computeBiSlopeObservation(current);

      expect(obs.currentVelocity).toBeCloseTo(3.0, 6);
      expect(obs.currentSlope).toBeCloseTo(3.0, 6);
      expect(obs.velocityRatio).toBeUndefined();
      expect(obs.slopeRatio).toBeUndefined();
      expect(obs.isMomentumExhausted).toBe(false);
    });

    it('protects against division by zero when barCount <= 0', () => {
      const current: BiSlopeUnitInput = { priceChange: 10, barCount: 0 };
      const obs = computeBiSlopeObservation(current);

      expect(Number.isFinite(obs.currentVelocity)).toBe(true);
      expect(Number.isFinite(obs.currentSlope)).toBe(true);
      expect(obs.currentVelocity).toBe(10);
      expect(obs.currentSlope).toBe(10);
    });

    it('detects momentum exhaustion in same-direction upward bis when velocity drops below 0.65', () => {
      const prior: BiSlopeUnitInput = { priceChange: 20, barCount: 5 }; // v = 4.0, s = +4.0
      const current: BiSlopeUnitInput = { priceChange: 10, barCount: 5 }; // v = 2.0, s = +2.0

      const obs = computeBiSlopeObservation(current, prior);

      expect(obs.currentVelocity).toBeCloseTo(2.0, 6);
      expect(obs.currentSlope).toBeCloseTo(2.0, 6);
      expect(obs.velocityRatio).toBeCloseTo(0.5, 6);
      expect(obs.slopeRatio).toBeCloseTo(0.5, 6);
      expect(obs.isMomentumExhausted).toBe(true);
    });

    it('does not flag exhaustion when same-direction upward velocity is maintained (ratio >= 0.65)', () => {
      const prior: BiSlopeUnitInput = { priceChange: 20, barCount: 5 }; // v = 4.0
      const current: BiSlopeUnitInput = { priceChange: 16, barCount: 5 }; // v = 3.2, ratio = 0.8

      const obs = computeBiSlopeObservation(current, prior);

      expect(obs.velocityRatio).toBeCloseTo(0.8, 6);
      expect(obs.isMomentumExhausted).toBe(false);
    });

    it('detects momentum exhaustion in same-direction downward bis', () => {
      const prior: BiSlopeUnitInput = { priceChange: -30, barCount: 6 }; // v = 5.0, s = -5.0
      const current: BiSlopeUnitInput = { priceChange: -10, barCount: 5 }; // v = 2.0, s = -2.0

      const obs = computeBiSlopeObservation(current, prior);

      expect(obs.currentVelocity).toBeCloseTo(2.0, 6);
      expect(obs.currentSlope).toBeCloseTo(-2.0, 6);
      expect(obs.velocityRatio).toBeCloseTo(0.4, 6);
      expect(obs.slopeRatio).toBeCloseTo(0.4, 6);
      expect(obs.isMomentumExhausted).toBe(true);
    });

    it('safely falls back with undefined ratio when units have opposite directions', () => {
      const prior: BiSlopeUnitInput = { priceChange: 20, barCount: 5 }; // Upward
      const current: BiSlopeUnitInput = { priceChange: -10, barCount: 5 }; // Downward

      const obs = computeBiSlopeObservation(current, prior);

      expect(obs.velocityRatio).toBeUndefined();
      expect(obs.slopeRatio).toBeUndefined();
      expect(obs.isMomentumExhausted).toBe(false);
    });

    it('safely handles flat prior (velocity = 0)', () => {
      const prior: BiSlopeUnitInput = { priceChange: 0, barCount: 5 };
      const current: BiSlopeUnitInput = { priceChange: 10, barCount: 5 };

      const obs = computeBiSlopeObservation(current, prior);

      expect(obs.velocityRatio).toBeUndefined();
      expect(obs.isMomentumExhausted).toBe(false);
    });
  });

  describe('computeBiSlopeSeries', () => {
    it('returns empty result for empty input', () => {
      const result = computeBiSlopeSeries([]);
      expect(result.velocities).toHaveLength(0);
      expect(result.slopes).toHaveLength(0);
      expect(result.velocityRatios).toHaveLength(0);
      expect(result.slopeRatios).toHaveLength(0);
      expect(result.momentumExhausted).toHaveLength(0);
    });

    it('processes alternating bi series and matches prior same-direction units', () => {
      const units: BiSlopeUnitInput[] = [
        { priceChange: 20, barCount: 5 }, // 0: Up (v=4)
        { priceChange: -15, barCount: 5 }, // 1: Down (v=3)
        { priceChange: 10, barCount: 5 }, // 2: Up (v=2, compared to 0: ratio=0.5 -> exhausted)
        { priceChange: -20, barCount: 5 }, // 3: Down (v=4, compared to 1: ratio=1.33 -> not exhausted)
      ];

      const result = computeBiSlopeSeries(units);

      expect(result.velocities).toEqual([4, 3, 2, 4]);
      expect(result.slopes).toEqual([4, -3, 2, -4]);

      // Unit 0: no prior
      expect(result.velocityRatios[0]).toBeUndefined();
      expect(result.momentumExhausted[0]).toBe(false);

      // Unit 1: no prior down bi
      expect(result.velocityRatios[1]).toBeUndefined();
      expect(result.momentumExhausted[1]).toBe(false);

      // Unit 2 (Up): compares against Unit 0 (Up)
      expect(result.velocityRatios[2]).toBeCloseTo(0.5, 6);
      expect(result.slopeRatios[2]).toBeCloseTo(0.5, 6);
      expect(result.momentumExhausted[2]).toBe(true);

      // Unit 3 (Down): compares against Unit 1 (Down)
      expect(result.velocityRatios[3]).toBeCloseTo(4 / 3, 6);
      expect(result.slopeRatios[3]).toBeCloseTo(4 / 3, 6);
      expect(result.momentumExhausted[3]).toBe(false);
    });
  });
});
