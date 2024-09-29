import { ExponentialRetryDelayCalculator } from '../../../../../src/jobs/job-server/retry-delay-calculators/ExponentialRetryDelayCalculator';

describe('ExponentialRetryDelayCalculator', () => {
  let retryDelayCalculator: ExponentialRetryDelayCalculator;

  describe('[without optional params]', () => {
    const BASE = 1.5;
    const MULTIPLIER = 6410;

    beforeEach(() => {
      retryDelayCalculator = new ExponentialRetryDelayCalculator({
        base: BASE,
        multiplier: MULTIPLIER,
      });
    });

    describe('calculate()', () => {
      it('should return the base for the first attempt', () => {
        expect(retryDelayCalculator.calculate(1)).toBe(MULTIPLIER);
      });

      it('should return exponentially increasing value for each attempt', () => {
        expect(
          retryDelayCalculator.calculate(2) / retryDelayCalculator.calculate(1),
        ).toBeCloseTo(BASE);

        expect(
          retryDelayCalculator.calculate(5) / retryDelayCalculator.calculate(4),
        ).toBeCloseTo(BASE);

        expect(
          retryDelayCalculator.calculate(9) / retryDelayCalculator.calculate(8),
        ).toBeCloseTo(BASE);
      });

      it('should return maximum safe integer when timeout is too large', () => {
        expect(retryDelayCalculator.calculate(Number.MAX_SAFE_INTEGER)).toBe(
          Number.MAX_SAFE_INTEGER,
        );
      });
    });
  });

  describe('[with optional params]', () => {
    const BASE = 1.5;
    const MULTIPLIER = 1000;
    const MIN = 5000;
    const MAX = 25000;

    beforeEach(() => {
      retryDelayCalculator = new ExponentialRetryDelayCalculator({
        base: BASE,
        multiplier: MULTIPLIER,
        min: MIN,
        max: MAX,
      });
    });

    describe('calculate()', () => {
      it('should return the minimum value for smaller timeouts', () => {
        expect(retryDelayCalculator.calculate(1)).toBe(MIN);
        expect(retryDelayCalculator.calculate(2)).toBe(MIN);
        expect(retryDelayCalculator.calculate(3)).toBe(MIN);
        expect(retryDelayCalculator.calculate(4)).toBe(MIN);
      });

      it('should return the calculated value for intermediate timeouts', () => {
        expect(retryDelayCalculator.calculate(5)).toBeGreaterThan(MIN);
        expect(retryDelayCalculator.calculate(5)).toBeLessThan(MAX);

        expect(retryDelayCalculator.calculate(8)).toBeGreaterThan(MIN);
        expect(retryDelayCalculator.calculate(8)).toBeLessThan(MAX);
      });

      it('should return the maximum value for larger timeouts', () => {
        expect(retryDelayCalculator.calculate(9)).toBe(MAX);
        expect(retryDelayCalculator.calculate(10)).toBe(MAX);
        expect(retryDelayCalculator.calculate(99)).toBe(MAX);
        expect(retryDelayCalculator.calculate(99999)).toBe(MAX);
      });
    });
  });
});
