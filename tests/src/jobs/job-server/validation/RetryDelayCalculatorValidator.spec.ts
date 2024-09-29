import { RetryDelayCalculatorValidator } from '../../../../../src/jobs/job-server/validation/RetryDelayCalculatorValidator';

describe('RetryDelayCalculatorValidator', () => {
  let retryDelayCalculatorValidator: RetryDelayCalculatorValidator;

  beforeEach(() => {
    retryDelayCalculatorValidator = new RetryDelayCalculatorValidator();
  });

  describe('validate()', () => {
    it("should validate retry delay calculator's truthiness", () => {
      expect(() =>
        retryDelayCalculatorValidator.validate(undefined, 'fake-context'),
      ).toThrow(
        new Error(
          'Retry delay calculator is invalid: undefined (fake-context)',
        ),
      );

      expect(() =>
        retryDelayCalculatorValidator.validate(null, 'fake-context'),
      ).toThrow(
        new Error('Retry delay calculator is invalid: null (fake-context)'),
      );
    });

    it("should validate retry delay calculator's #calculate method", () => {
      const expectedError = new Error(
        'Retry delay calculator is invalid: must have a #calculate method (fake-context)',
      );

      class InvalidRetryDelayCalculator {
        get calculate() {
          return true;
        }
      }

      expect(() =>
        retryDelayCalculatorValidator.validate(
          new InvalidRetryDelayCalculator(),
          'fake-context',
        ),
      ).toThrow(expectedError);
      expect(() =>
        // @ts-ignore: ignore for test
        retryDelayCalculatorValidator.validate('hello world', 'fake-context'),
      ).toThrow(expectedError);
      expect(() =>
        // @ts-ignore: ignore for test
        retryDelayCalculatorValidator.validate(12345, 'fake-context'),
      ).toThrow(expectedError);
      expect(() =>
        // @ts-ignore: ignore for test
        retryDelayCalculatorValidator.validate({}, 'fake-context'),
      ).toThrow(expectedError);
    });

    it('should not throw errors for valid retry delay calculators', () => {
      class ValidRetryDelayCalculator {
        calculate() {
          return 146;
        }
      }

      const validRetryDelayCalculators = [
        new ValidRetryDelayCalculator(),
        { calculate: () => 146 },
        {
          calculate() {
            return 146;
          },
        },
      ];

      for (const retryDelayCalculator of validRetryDelayCalculators) {
        expect(() =>
          retryDelayCalculatorValidator.validate(
            retryDelayCalculator,
            'fake-context',
          ),
        ).not.toThrow();
      }
    });
  });
});
