import {
  createIdempotentMetricRegistration,
  resetMetricRegistrationsForTest,
} from './metric-utils';

describe('metric-utils', () => {
  beforeEach(() => {
    resetMetricRegistrationsForTest();
  });

  describe('createIdempotentMetricRegistration', () => {
    it('executes the registration callback once for a given key', () => {
      const callback = jest.fn();
      const first = createIdempotentMetricRegistration('test_metric', callback);
      const second = createIdempotentMetricRegistration(
        'test_metric',
        callback,
      );

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('allows different keys to execute independently', () => {
      const callbackA = jest.fn();
      const callbackB = jest.fn();

      expect(createIdempotentMetricRegistration('metric_a', callbackA)).toBe(
        true,
      );
      expect(createIdempotentMetricRegistration('metric_b', callbackB)).toBe(
        true,
      );
      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).toHaveBeenCalledTimes(1);
    });
  });
});
