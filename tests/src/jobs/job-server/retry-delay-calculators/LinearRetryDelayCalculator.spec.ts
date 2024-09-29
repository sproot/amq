import { LinearRetryDelayCalculator } from '../../../../../src/jobs/job-server/retry-delay-calculators/LinearRetryDelayCalculator';

describe('LinearRetryDelayCalculator', () => {
  let retryDelayCalculator: LinearRetryDelayCalculator;

  describe('[without optional params]', () => {
    const BASE = 1460;

    beforeEach(() => {
      retryDelayCalculator = new LinearRetryDelayCalculator({
        base: BASE,
      });
    });

    describe('calculate()', () => {
      it('should return the base for the first attempt', () => {
        expect(retryDelayCalculator.calculate(1)).toBe(BASE);
      });

      it('should return linearly increasing value for each attempt', () => {
        expect(
          retryDelayCalculator.calculate(2) - retryDelayCalculator.calculate(1),
        ).toBe(BASE);

        expect(
          retryDelayCalculator.calculate(99) -
            retryDelayCalculator.calculate(98),
        ).toBe(BASE);

        expect(
          retryDelayCalculator.calculate(99999) -
            retryDelayCalculator.calculate(99998),
        ).toBe(BASE);
      });

      it('should return maximum safe integer when timeout is too large', () => {
        expect(retryDelayCalculator.calculate(Number.MAX_SAFE_INTEGER)).toBe(
          Number.MAX_SAFE_INTEGER,
        );
      });
    });
  });

  describe('[with optional params]', () => {
    const BASE = 1460;
    const MIN = 5000;
    const MAX = 25000;

    beforeEach(() => {
      retryDelayCalculator = new LinearRetryDelayCalculator({
        base: BASE,
        min: MIN,
        max: MAX,
      });
    });

    describe('calculate()', () => {
      it('should return the minimum value for smaller timeouts', () => {
        expect(retryDelayCalculator.calculate(1)).toBe(MIN);
        expect(retryDelayCalculator.calculate(2)).toBe(MIN);
        expect(retryDelayCalculator.calculate(3)).toBe(MIN);
      });

      it('should return the calculated value for intermediate timeouts', () => {
        expect(retryDelayCalculator.calculate(4)).toBeGreaterThan(MIN);
        expect(retryDelayCalculator.calculate(4)).toBeLessThan(MAX);

        expect(retryDelayCalculator.calculate(10)).toBeGreaterThan(MIN);
        expect(retryDelayCalculator.calculate(10)).toBeLessThan(MAX);

        expect(retryDelayCalculator.calculate(17)).toBeGreaterThan(MIN);
        expect(retryDelayCalculator.calculate(17)).toBeLessThan(MAX);
      });

      it('should return the maximum value for larger timeouts', () => {
        expect(retryDelayCalculator.calculate(18)).toBe(MAX);
        expect(retryDelayCalculator.calculate(19)).toBe(MAX);
        expect(retryDelayCalculator.calculate(99)).toBe(MAX);
        expect(retryDelayCalculator.calculate(99999)).toBe(MAX);
      });
    });
  });
});
