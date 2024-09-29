import { PositiveNumberValidator } from '../../../../../src/jobs/job-server/validation/PositiveNumberValidator';

describe('PositiveNumberValidator', () => {
  let positiveNumberValidator: PositiveNumberValidator;

  beforeEach(() => {
    positiveNumberValidator = new PositiveNumberValidator();
  });

  describe('validate()', () => {
    it('should validate value (must be a number)', () => {
      const expectedError = new Error('"fake-context" must be a number');

      expect(() =>
        // @ts-ignore: ignoring invalid input for testing purposes
        positiveNumberValidator.validate(null, 'fake-context'),
      ).toThrow(expectedError);
      expect(() =>
        // @ts-ignore: ignoring invalid input for testing purposes
        positiveNumberValidator.validate('hello world', 'fake-context'),
      ).toThrow(expectedError);
      expect(() =>
        // @ts-ignore: ignoring invalid input for testing purposes
        positiveNumberValidator.validate({ jon: 'snow' }, 'fake-context'),
      ).toThrow(expectedError);
    });

    it('should validate value (must be positive)', () => {
      const expectedError = new Error(
        '"fake-context" must be a positive number',
      );

      expect(() =>
        positiveNumberValidator.validate(-999, 'fake-context'),
      ).toThrow(expectedError);
      expect(() =>
        positiveNumberValidator.validate(-1, 'fake-context'),
      ).toThrow(expectedError);
      expect(() => positiveNumberValidator.validate(0, 'fake-context')).toThrow(
        expectedError,
      );
    });

    it('should not throw errors for valid values', () => {
      const validValues = [
        1,
        10,
        999,
        Number.MAX_SAFE_INTEGER,
        Number.POSITIVE_INFINITY,
        Infinity,
      ];

      for (const maxAttemptCount of validValues) {
        expect(() =>
          // @ts-ignore: ignoring invalid input for testing purposes
          positiveNumberValidator.validate(maxAttemptCount),
        ).not.toThrow();
      }
    });
  });
});
