import { JobHandlerValidator } from '../../../../../src/jobs/job-server/validation/JobHandlerValidator';

describe('JobHandlerValidator', () => {
  let jobHandlerValidator: JobHandlerValidator;
  let retryDelayCalculatorValidator: any;
  let positiveNumberValidator: any;

  beforeEach(() => {
    retryDelayCalculatorValidator = {
      validate: jest.fn(),
    };

    positiveNumberValidator = {
      validate: jest.fn(),
    };

    jobHandlerValidator = new JobHandlerValidator({
      retryDelayCalculatorValidator,
      positiveNumberValidator,
    });
  });

  describe('validate()', () => {
    const context = 'fake-context';

    it('should validate job handler truthiness', () => {
      expect(() => jobHandlerValidator.validate(undefined, context)).toThrow(
        new Error('Job handler is invalid: undefined (fake-context)'),
      );

      expect(() => jobHandlerValidator.validate(null, context)).toThrow(
        new Error('Job handler is invalid: null (fake-context)'),
      );
    });

    it("should validate job handler's type", () => {
      expect(() => jobHandlerValidator.validate(undefined, context)).toThrow(
        new Error('Job handler is invalid: undefined (fake-context)'),
      );

      expect(() => jobHandlerValidator.validate(null, context)).toThrow(
        new Error('Job handler is invalid: null (fake-context)'),
      );
    });

    it("should validate job handler's #handle method", () => {
      const expectedError = new Error(
        'Job handler is invalid: must have #handle method (fake-context)',
      );

      class InvalidHandler {
        get handle() {
          return true;
        }
        someMethod() {}
      }

      expect(() =>
        jobHandlerValidator.validate(new InvalidHandler(), context),
      ).toThrow(expectedError);
      expect(() => jobHandlerValidator.validate({}, context)).toThrow(
        expectedError,
      );
      expect(() =>
        jobHandlerValidator.validate({ handle: null }, context),
      ).toThrow(expectedError);
    });

    it("should validate job handler's #handleError method when present", () => {
      const expectedError = new Error(
        'Job handler is invalid: #handleError must be a method (fake-context)',
      );

      class InvalidHandler {
        async handle() {}
        get handleError() {
          return true;
        }
      }

      expect(() =>
        jobHandlerValidator.validate(new InvalidHandler(), context),
      ).toThrow(expectedError);
      expect(() =>
        jobHandlerValidator.validate(
          { async handle() {}, handleError: 'hello world' },
          context,
        ),
      ).toThrow(expectedError);
      expect(() =>
        jobHandlerValidator.validate(
          { async handle() {}, handleError: null },
          context,
        ),
      ).toThrow(expectedError);
    });

    it('should validate timeout calculator when present', () => {
      const retryDelayCalculator = { dummy: 'timeoutCalculator' };

      jobHandlerValidator.validate(
        { async handle() {}, retryDelayCalculator },
        context,
      );

      expect(retryDelayCalculatorValidator.validate).toHaveBeenCalledWith(
        retryDelayCalculator,
        context,
      );
    });

    it('should not validate timeout calculator when not present', () => {
      jobHandlerValidator.validate({ async handle() {} }, context);

      expect(retryDelayCalculatorValidator.validate).not.toHaveBeenCalled();
    });

    it('should validate max attempt count when present', () => {
      const maxAttemptCount = 146;

      jobHandlerValidator.validate(
        { async handle() {}, maxAttemptCount },
        context,
      );

      expect(positiveNumberValidator.validate).toHaveBeenCalledWith(
        maxAttemptCount,
        'fake-context.maxAttemptCount',
      );
    });

    it('should not validate max attempt count when not present', () => {
      jobHandlerValidator.validate({ async handle() {} }, context);

      expect(positiveNumberValidator.validate).not.toHaveBeenCalled();
    });

    it('should validate timeoutMs when present', () => {
      const timeoutMs = 146;

      jobHandlerValidator.validate({ async handle() {}, timeoutMs }, context);

      expect(positiveNumberValidator.validate).toHaveBeenCalledWith(
        timeoutMs,
        'fake-context.timeoutMs',
      );
    });

    it('should not validate timeoutMs when not present', () => {
      jobHandlerValidator.validate({ async handle() {} }, context);

      expect(positiveNumberValidator.validate).not.toHaveBeenCalled();
    });

    it('should throw error for invalid values', () => {
      const invalidValues = [Symbol('test'), 'hello world', true, 123];

      for (const value of invalidValues) {
        expect(() => jobHandlerValidator.validate(value, context)).toThrowError(
          'Job handler is invalid: must be an object or a function (fake-context)',
        );
      }
    });

    it('should not throw error for valid job handlers', () => {
      class ValidHandler1 {
        async handle() {}
      }

      class ValidTimeoutCalculator {
        calculate() {}
      }

      class ValidHandler2 {
        async handle() {}

        handleError() {}

        get timeoutCalculator() {
          return new ValidTimeoutCalculator();
        }

        get maxAttemptCount() {
          return 12345;
        }
      }

      const validHandlers = [
        async () => true,
        async function test({ data: { test } }: { data: any }) {
          console.log('hello world:', test);
        },
        new ValidHandler1(),
        new ValidHandler2(),
        { handle: async () => {} },
        { async handle() {}, timeoutCalculator: new ValidTimeoutCalculator() },
        { async handle() {}, maxAttemptCount: 1 },
        { async handle() {}, maxAttemptCount: 10 },
      ];

      for (const handler of validHandlers) {
        expect(() =>
          jobHandlerValidator.validate(handler, context),
        ).not.toThrow();
      }
    });

    it('should throw error for synchronous job handler methods', () => {
      class InvalidHandler {
        handle() {}
      }

      const invalidHandlerMethods = [
        new InvalidHandler(),
        { handle: () => {} },
        { handle() {} },
      ];

      for (const handler of invalidHandlerMethods) {
        expect(() =>
          jobHandlerValidator.validate(handler, context),
        ).toThrowError(
          'Job handler is invalid: #handle method must be async (fake-context)',
        );
      }
    });

    it('should throw error for synchronous job handler functions', () => {
      const invalidHandlerMethods = [
        () => true,
        function test({ data: { test } }: { data: any }) {
          console.log('hello world:', test);
        },
      ];

      for (const handler of invalidHandlerMethods) {
        expect(() =>
          jobHandlerValidator.validate(handler, context),
        ).toThrowError(
          'Job handler is invalid: must be an async function (fake-context)',
        );
      }
    });
  });
});
