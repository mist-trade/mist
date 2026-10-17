import { sleep, withTimeout } from './async.util';

describe('async.util', () => {
  describe('sleep', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('resolves after specified milliseconds', async () => {
      const promise = sleep(100);
      jest.advanceTimersByTime(99);
      let resolved = false;
      promise.then(() => {
        resolved = true;
      });
      expect(resolved).toBe(false);
      jest.advanceTimersByTime(1);
      await promise;
      expect(resolved).toBe(true);
    });
  });

  describe('withTimeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('resolves with the value if promise fulfills before timeout', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const innerPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('success'), 50);
      });

      const timedPromise = withTimeout(innerPromise, 100);
      jest.advanceTimersByTime(50);
      await expect(timedPromise).resolves.toBe('success');
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('rejects with default timeout error if promise takes too long', async () => {
      const innerPromise = new Promise<string>(() => {}); // never resolves
      const timedPromise = withTimeout(innerPromise, 100);

      jest.advanceTimersByTime(100);
      await expect(timedPromise).rejects.toThrow(
        'Operation timed out after 100ms',
      );
    });

    it('rejects with custom errorFactory if provided upon timeout', async () => {
      const innerPromise = new Promise<string>(() => {}); // never resolves
      const customError = new Error('CUSTOM_DEADLINE_EXCEEDED');
      const timedPromise = withTimeout(innerPromise, 100, () => customError);

      jest.advanceTimersByTime(100);
      await expect(timedPromise).rejects.toBe(customError);
    });

    it('rejects and clears timer if promise rejects before timeout', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const innerPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('inner failure')), 50);
      });

      const timedPromise = withTimeout(innerPromise, 100);
      jest.advanceTimersByTime(50);
      await expect(timedPromise).rejects.toThrow('inner failure');
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });
});
