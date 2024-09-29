import { ConstantRetryDelayCalculator } from '../../../../../src/jobs/job-server/retry-delay-calculators/ConstantRetryDelayCalculator';

describe('ConstantRetryDelayCalculator', () => {
  let retryDelayCalculator: ConstantRetryDelayCalculator;

  beforeEach(() => {
    retryDelayCalculator = new ConstantRetryDelayCalculator(1460);
  });

  describe('calculate()', () => {
    it('should return the specified timeout for each attempt', () => {
      expect(retryDelayCalculator.calculate(1)).toBe(1460);
      expect(retryDelayCalculator.calculate(2)).toBe(1460);
      expect(retryDelayCalculator.calculate(99)).toBe(1460);
      expect(retryDelayCalculator.calculate(99999)).toBe(1460);
    });
  });
});
