import { Period, Security, SecurityStatus } from '@app/shared-data';
import { KlineVerificationValidator } from './kline-verification.validator';

describe('KlineVerificationValidator', () => {
  let validator: KlineVerificationValidator;

  beforeEach(() => {
    validator = new KlineVerificationValidator();
  });

  describe('Level 1: Geometry', () => {
    it('passes for compliant bars', () => {
      const result = validator.verifyGeometry([
        {
          timestamp: 1700000000,
          open: 10,
          high: 12,
          low: 9,
          close: 11,
          volume: 1000,
        },
      ]);
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects high < open, low > close, negative prices or negative volume', () => {
      const result = validator.verifyGeometry([
        {
          timestamp: 1700000000,
          open: 10,
          high: 9, // high < open
          low: 8,
          close: 8.5,
          volume: -10, // negative volume
        },
      ]);
      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Level 2: Monotonicity and Count', () => {
    it('passes for strictly increasing timestamps and matched count', () => {
      const result = validator.verifyMonotonicityAndCount(
        [
          { timestamp: 100, open: 1, high: 2, low: 1, close: 1.5, volume: 10 },
          {
            timestamp: 200,
            open: 1.5,
            high: 2.2,
            low: 1.4,
            close: 2.0,
            volume: 20,
          },
        ],
        Period.FIVE_MIN,
        2,
      );
      expect(result.passed).toBe(true);
    });

    it('rejects inverted timestamps or count mismatch', () => {
      const result = validator.verifyMonotonicityAndCount(
        [
          { timestamp: 200, open: 1, high: 2, low: 1, close: 1.5, volume: 10 },
          {
            timestamp: 100,
            open: 1.5,
            high: 2.2,
            low: 1.4,
            close: 2.0,
            volume: 20,
          },
        ],
        Period.FIVE_MIN,
        1,
      );
      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Level 3: Cross-Period 3D Consistency', () => {
    const fiveMinBars = [
      {
        timestamp: 100,
        open: 10.0,
        high: 11.0,
        low: 9.8,
        close: 10.5,
        volume: 500,
      },
      {
        timestamp: 200,
        open: 10.5,
        high: 12.0,
        low: 10.2,
        close: 11.2,
        volume: 300,
      },
      {
        timestamp: 300,
        open: 11.2,
        high: 11.8,
        low: 9.5,
        close: 10.8,
        volume: 200,
      },
    ];

    it('passes when dayBar exactly matches 5m aggregates', () => {
      const dayBar = {
        timestamp: 100,
        open: 10.0,
        high: 12.0,
        low: 9.5,
        close: 10.8,
        volume: 1000,
      };
      const result = validator.verifyCrossPeriodConsistency(
        dayBar,
        fiveMinBars,
      );
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects when open, close, high, low or volume mismatch', () => {
      const dayBar = {
        timestamp: 100,
        open: 10.2, // mismatch first 5m open
        high: 12.0,
        low: 9.5,
        close: 10.8,
        volume: 1000,
      };
      const result = validator.verifyCrossPeriodConsistency(
        dayBar,
        fiveMinBars,
      );
      expect(result.passed).toBe(false);
      expect(result.errors[0]).toContain('Cross-period open mismatch');
    });
  });

  describe('Level 4: Suspension Exemption', () => {
    it('exempts zero bars when security is suspended', () => {
      const sec = { status: SecurityStatus.SUSPENDED } as Security;
      expect(validator.isSuspendedExempt(sec, 0)).toBe(true);
    });

    it('does not exempt when bars exist or security is active', () => {
      const secActive = { status: 1 } as Security;
      expect(validator.isSuspendedExempt(secActive, 0)).toBe(false);
    });
  });
});
