import { PredefinedRetryDelayCalculator } from '../../../../../src/jobs/job-server/retry-delay-calculators/PredefinedRetryDelayCalculator';

describe('PredefinedRetryDelayCalculator', () => {
  let retryDelayCalculator: PredefinedRetryDelayCalculator;

  beforeEach(() => {
    retryDelayCalculator = new PredefinedRetryDelayCalculator([
      1, 999, 146, 641, 1460, 6410,
    ]);
  });

  describe('calculate()', () => {
    it('should return corresponding timeout for the specified attempt', () => {
      expect(retryDelayCalculator.calculate(1)).toBe(1);
      expect(retryDelayCalculator.calculate(2)).toBe(999);
      expect(retryDelayCalculator.calculate(3)).toBe(146);
      expect(retryDelayCalculator.calculate(4)).toBe(641);
      expect(retryDelayCalculator.calculate(5)).toBe(1460);
      expect(retryDelayCalculator.calculate(6)).toBe(6410);
    });

    it('should return the last configured timeout for out-of-bound attempts', () => {
      expect(retryDelayCalculator.calculate(7)).toBe(6410);
      expect(retryDelayCalculator.calculate(99)).toBe(6410);
    });
  });
});
