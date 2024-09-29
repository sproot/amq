import 'jest-extended';
import { JobHandlerManager } from '../../../../src/jobs/job-server/JobHandlerManager';
import { Scheduler } from '../../../../src/jobs/job-server/Scheduler';

describe('JobHandlerManager', () => {
  const DEFAULT_TIMEOUT_MS = 14660;
  const DEFAULT_MAX_ATTEMPT_COUNT = 146;

  const scheduler = {
    dummy: 'scheduler',
  } as unknown as jest.Mocked<Scheduler>;

  let jobHandlerManager: JobHandlerManager;
  let defaultRetryDelayCalculator: any;
  let jobHandlerValidator: any;

  beforeEach(() => {
    defaultRetryDelayCalculator =
      createRetryDelayCalculatorMock(DEFAULT_TIMEOUT_MS);

    jobHandlerValidator = {
      validate: jest.fn(),
    };

    jobHandlerManager = new JobHandlerManager({
      defaultRetryDelayCalculator,
      defaultMaxAttemptCount: DEFAULT_MAX_ATTEMPT_COUNT,
      jobHandlerValidator,
    });
  });

  describe('set()', () => {
    it('should throw an error when job handler already exists', () => {
      const expectedError = new Error(
        'Job handler already exists for "fake-job"',
      );

      expect(() =>
        jobHandlerManager.set('fake-job', createJobHandlerMock()),
      ).not.toThrow();

      expect(() =>
        jobHandlerManager.set('fake-job', createJobHandlerMock()),
      ).toThrow(expectedError);

      jobHandlerManager.deleteAll();

      expect(() =>
        jobHandlerManager.set('fake-job', createJobHandlerMock()),
      ).not.toThrow();

      expect(() =>
        jobHandlerManager.set('fake-job', createJobHandlerMock()),
      ).toThrow(expectedError);
    });

    it('should validate handler', () => {
      const job = 'fake-job';
      const handler = createJobHandlerMock();

      jobHandlerManager.set(job, handler);

      expect(jobHandlerValidator.validate).toHaveBeenCalledWith(handler, job);
    });
  });

  describe('handle()', () => {
    const data = { fake: 'data' };
    const retryContext = { fake: 'retryContext' };
    const attempt = 146;

    it('should throw an error for non-existing job handlers', async () => {
      await expect(
        jobHandlerManager.handle(
          'non-existing-job',
          {
            data,
            retryContext,
            attempt,
          },
          scheduler,
        ),
      ).rejects.toThrow(
        new Error('Job handler not found for "non-existing-job"'),
      );
    });

    it('should execute corresponding job handler (object)', async () => {
      const jobHandler = createJobHandlerMock();
      jobHandlerManager.set('fake-job', jobHandler);

      await jobHandlerManager.handle(
        'fake-job',
        { data, retryContext, attempt },
        scheduler,
      );

      expect(jobHandler.handle).toHaveBeenCalledWith(
        { data, retryContext, attempt },
        scheduler,
      );
    });

    it('should execute corresponding job handler (function)', async () => {
      const jobHandler = jest.fn();
      jobHandlerManager.set('fake-job', jobHandler);

      await jobHandlerManager.handle(
        'fake-job',
        { data, retryContext, attempt },
        scheduler,
      );

      expect(jobHandler).toHaveBeenCalledWith(
        { data, retryContext, attempt },
        scheduler,
      );
    });
  });

  describe('handleError()', () => {
    const data = { fake: 'data' };
    const retryContext = { fake: 'retryContext' };
    const attempt = 146;
    const error = new Error('Fake error');

    it('should re-throw the error for non-existing job handlers', async () => {
      await expect(
        jobHandlerManager.handleError(
          'non-existing-job',
          {
            data,
            retryContext,
            attempt,
          },
          error,
          scheduler,
        ),
      ).rejects.toThrow(error);
    });

    it('should re-throw the error for job handlers without custom error-handling logic', async () => {
      jobHandlerManager.set('fake-job', createJobHandlerMock());

      await expect(
        jobHandlerManager.handleError(
          'fake-job',
          {
            data,
            retryContext,
            attempt,
          },
          error,
          scheduler,
        ),
      ).rejects.toThrow(error);
    });

    it('should use custom error-handling logic when provided', async () => {
      const handler = createJobHandlerMock({
        handleError: jest.fn(async () => true),
      });
      jobHandlerManager.set('fake-job', handler);

      await expect(
        jobHandlerManager.handleError(
          'fake-job',
          { data, retryContext, attempt },
          error,
          scheduler,
        ),
      ).toResolve();

      expect(handler.handleError).toHaveBeenCalledWith(
        { data, retryContext, attempt },
        error,
        scheduler,
      );
    });

    it('should re-throw the error when handler is a function', async () => {
      jobHandlerManager.set('fake-job', () => {});

      const error = new Error('Fake error');

      await expect(
        jobHandlerManager.handleError(
          'fake-job',
          {
            data: { fake: 'data' },
            retryContext: { fake: 'retryContext' },
            attempt: 146,
          },
          error,
          scheduler,
        ),
      ).rejects.toThrow(error);
    });
  });

  describe('calculateAttemptTimeoutMs()', () => {
    it('should use default timeout calculator for non-existing job handlers', () => {
      expect(
        jobHandlerManager.calculateRetryDelayMs('non-existing-job', 146),
      ).toBe(DEFAULT_TIMEOUT_MS);

      expect(defaultRetryDelayCalculator.calculate).toHaveBeenCalledWith(146);
    });

    it('should use default timeout calculator for job handlers without custom timeout calculators', () => {
      jobHandlerManager.set('fake-job', createJobHandlerMock());

      expect(jobHandlerManager.calculateRetryDelayMs('fake-job', 146)).toBe(
        DEFAULT_TIMEOUT_MS,
      );

      expect(defaultRetryDelayCalculator.calculate).toHaveBeenCalledWith(146);
    });

    it("should use job handler's custom timeout calculator when available", () => {
      const timeoutMs = 1464644;
      const retryDelayCalculator = createRetryDelayCalculatorMock(timeoutMs);

      jobHandlerManager.set(
        'fake-job',
        createJobHandlerMock({ retryDelayCalculator }),
      );

      expect(jobHandlerManager.calculateRetryDelayMs('fake-job', 146)).toBe(
        timeoutMs,
      );

      expect(retryDelayCalculator.calculate).toHaveBeenCalledWith(146);
      expect(defaultRetryDelayCalculator.calculate).not.toHaveBeenCalled();
    });

    it('should use default timeout calculator when job handler is a function', () => {
      jobHandlerManager.set('fake-job', () => {});

      expect(jobHandlerManager.calculateRetryDelayMs('fake-job', 146)).toBe(
        DEFAULT_TIMEOUT_MS,
      );

      expect(defaultRetryDelayCalculator.calculate).toHaveBeenCalledWith(146);
    });

    const invalidTimeouts = [
      null,
      undefined,
      'hello world',
      { hey: 'there' },
      [1, 2, 3],
      NaN,
      -Infinity,
      Infinity,
      123.456,
      0.46,
      -456.4,
      -1,
      0,
    ];

    it('should throw an error when calculated retry delay is invalid (default)', () => {
      for (const invalidTimeout of invalidTimeouts) {
        defaultRetryDelayCalculator.calculate.mockReturnValue(invalidTimeout);

        expect(() =>
          jobHandlerManager.calculateRetryDelayMs('fake-job', 123),
        ).toThrowError(
          `Invalid calculated attempt retry delay: ${String(
            invalidTimeout,
          )} (must be a positive integer)`,
        );
      }

      // not throws with "1"
      defaultRetryDelayCalculator.calculate.mockReturnValue(1);
      expect(jobHandlerManager.calculateRetryDelayMs('fake-job', 123)).toBe(1);
    });

    it('should throw an error when calculated retry delay is invalid (custom)', () => {
      const job = 'fake-job';

      const customRetryDelayCalculator = createRetryDelayCalculatorMock();
      jobHandlerManager.set(job, {
        retryDelayCalculator: customRetryDelayCalculator,
      });

      for (const invalidTimeout of invalidTimeouts) {
        customRetryDelayCalculator.calculate.mockReturnValue(invalidTimeout);

        expect(() =>
          jobHandlerManager.calculateRetryDelayMs(job, 123),
        ).toThrowError(
          `Invalid calculated attempt retry delay: ${String(
            invalidTimeout,
          )} (must be a positive integer)`,
        );
      }

      // not throws with "1"
      customRetryDelayCalculator.calculate.mockReturnValue(1);
      expect(jobHandlerManager.calculateRetryDelayMs(job, 123)).toBe(1);
    });
  });

  describe('isExceedingMaxAttemptCount()', () => {
    let getMaxAttemptCountSpy: jest.SpyInstance;

    beforeEach(() => {
      getMaxAttemptCountSpy = jest.spyOn(
        jobHandlerManager,
        'getMaxAttemptCount',
      );
    });

    it('should return true when attempt count is greater than max attempt count for the job', () => {
      const fakeJob = 'fake-job';
      getMaxAttemptCountSpy.mockImplementation((job) =>
        job === fakeJob ? 10 : NaN,
      );

      expect(jobHandlerManager.isExceedingMaxAttemptCount(fakeJob, 1)).toBe(
        false,
      );

      expect(jobHandlerManager.isExceedingMaxAttemptCount(fakeJob, 10)).toBe(
        false,
      );

      expect(jobHandlerManager.isExceedingMaxAttemptCount(fakeJob, 11)).toBe(
        true,
      );

      expect(jobHandlerManager.isExceedingMaxAttemptCount(fakeJob, 99)).toBe(
        true,
      );
    });
  });

  describe('getMaxAttemptCount()', () => {
    it('should use default max attempt count for non-existing job handlers', () => {
      expect(jobHandlerManager.getMaxAttemptCount('non-existing-job')).toBe(
        DEFAULT_MAX_ATTEMPT_COUNT,
      );
    });

    it('should use default max attempt count for job handlers without custom max attempt counts', () => {
      jobHandlerManager.set('fake-job', createJobHandlerMock());

      expect(jobHandlerManager.getMaxAttemptCount('fake-job')).toBe(
        DEFAULT_MAX_ATTEMPT_COUNT,
      );
    });

    it("should use job handler's custom max attempt count when available", () => {
      const maxAttemptCount = 6641;

      jobHandlerManager.set(
        'fake-job',
        createJobHandlerMock({ maxAttemptCount }),
      );

      expect(jobHandlerManager.getMaxAttemptCount('fake-job')).toBe(
        maxAttemptCount,
      );
    });
  });

  describe('getTimeoutMs()', () => {
    it('should return timeoutMs when specified', () => {
      const job = 'fake-job';
      const timeoutMs = 14545;

      jobHandlerManager.set(job, createJobHandlerMock({ timeoutMs }));

      expect(jobHandlerManager.getTimeoutMs(job)).toBe(timeoutMs);
    });

    it('should return null when not specified', () => {
      const job = 'fake-job';

      jobHandlerManager.set(job, createJobHandlerMock());

      expect(jobHandlerManager.getTimeoutMs(job)).toBeNull();
    });

    it('should return null when job does not exist', () => {
      expect(jobHandlerManager.getTimeoutMs('fake-job')).toBeNull();
    });
  });
});

function createJobHandlerMock({
  retryDelayCalculator,
  maxAttemptCount,
  timeoutMs,
  handleError,
}: {
  retryDelayCalculator?: any;
  maxAttemptCount?: number;
  timeoutMs?: number;
  handleError?: any;
} = {}) {
  const jobHandler = {
    handle: jest.fn().mockReturnValue(Promise.resolve()),
    handleError,
    retryDelayCalculator,
    maxAttemptCount,
    timeoutMs,
  };

  return jobHandler;
}

function createRetryDelayCalculatorMock(value?: number) {
  return {
    calculate: jest.fn().mockReturnValue(value),
  };
}
