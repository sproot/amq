import { factoryMockHelper, FactoryMock } from '../../../helpers';

import { MaxAttemptCountReachedError } from '../../../../src/jobs/errors';
import { JobRetryQueueProvider } from '../../../../src/jobs/job-queue/JobRetryQueueProvider';
import { Scheduler } from '../../../../src/jobs/job-server/Scheduler';

describe('Scheduler', () => {
  const JOB = 'fake-job';
  const DATA = { fake: 'job data' };
  const ATTEMPT = 146;
  const EXCHANGE = 'fake-waiting-exchange';
  const QUEUE = 'fake-waiting-queue';
  const CORRELATION_ID = 'fake-correlation-id';
  const RETRY_QUEUE_NAME = 'fake-retry-queue-name';

  let jobRetryQueueProviderFactory: FactoryMock<JobRetryQueueProvider>;
  let jobRetryQueueProvider: any;
  let scheduler: Scheduler;
  let discardedJobReporter: any;
  let jobHandlerManager: any;
  let jsonBufferSerializer: any;
  let amqpConnection: any;

  beforeEach(() => {
    jobRetryQueueProvider = {
      create: jest.fn(async () => RETRY_QUEUE_NAME),
    };

    jobRetryQueueProviderFactory = factoryMockHelper.create(
      jobRetryQueueProvider,
    );

    discardedJobReporter = {
      report: jest.fn(),
    };

    jobHandlerManager = {
      isExceedingMaxAttemptCount: jest.fn(),
      calculateRetryDelayMs: jest.fn(),
    };

    jsonBufferSerializer = {
      serialize: jest.fn((content) => ({
        serialized: content,
      })),
    };

    amqpConnection = {
      sendToQueue: jest.fn(async () => {}),
    };

    scheduler = new Scheduler(
      {
        job: JOB,
        data: DATA,
        attempt: ATTEMPT,
        exchange: EXCHANGE,
        queue: QUEUE,
        correlationId: CORRELATION_ID,
      },
      {
        jobRetryQueueProviderFactory,
        discardedJobReporter,
        jobHandlerManager,
        jsonBufferSerializer,
        amqpConnection,
      },
    );
  });

  describe('constructor()', () => {
    it('should create job retry queue provider', () => {
      expect(jobRetryQueueProviderFactory.create).toHaveBeenCalledTimes(1);
      expect(jobRetryQueueProviderFactory.create).toHaveBeenCalledWith(
        {
          exchange: EXCHANGE,
          queue: QUEUE,
        },
        { amqpConnection },
      );
    });
  });

  describe('retry()', () => {
    beforeEach(() => {
      jest.spyOn(scheduler, 'discard');
    });

    const calculatedRetryDelayMs = 14600;

    beforeEach(() => {
      jobHandlerManager.isExceedingMaxAttemptCount.mockReturnValue(false);
      jobHandlerManager.calculateRetryDelayMs.mockReturnValue(
        calculatedRetryDelayMs,
      );
    });

    it('should do nothing when discarded beforehand', async () => {
      scheduler.discard(new Error('Fake reason'));

      await scheduler.retry();

      expect(
        jobHandlerManager.isExceedingMaxAttemptCount,
      ).not.toHaveBeenCalled();
      expect(amqpConnection.sendToQueue).not.toHaveBeenCalled();
    });

    it('should publish job retry task to the queue', async () => {
      await scheduler.retry();

      expect(jobHandlerManager.isExceedingMaxAttemptCount).toHaveBeenCalledWith(
        JOB,
        ATTEMPT + 1,
      );
      expect(jobHandlerManager.calculateRetryDelayMs).toHaveBeenCalledWith(
        JOB,
        ATTEMPT,
      );
      expect(jobRetryQueueProvider.create).toHaveBeenCalledWith(
        calculatedRetryDelayMs,
      );

      expect(amqpConnection.sendToQueue).toHaveBeenCalledWith(
        RETRY_QUEUE_NAME,
        {
          serialized: {
            job: JOB,
            data: DATA,
            attempt: ATTEMPT + 1,
            retryContext: {},
          },
        },
        {
          correlationId: CORRELATION_ID,
          expireMs: calculatedRetryDelayMs,
          persistent: true,
        },
      );
    });

    it('should use custom timeout when provided', async () => {
      const customRetryDelayMs = 64146;

      await scheduler.retry({ retryDelayMs: customRetryDelayMs });

      expect(jobHandlerManager.calculateRetryDelayMs).not.toHaveBeenCalled();
      expect(amqpConnection.sendToQueue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          expireMs: customRetryDelayMs,
        }),
      );
    });

    it('should store retry context when provided', async () => {
      const retryContext = { fake: 'retryContext' };

      await scheduler.retry({ retryContext });

      expect(amqpConnection.sendToQueue).toHaveBeenCalledWith(
        expect.any(String),
        {
          serialized: expect.objectContaining({
            retryContext,
          }),
        },
        expect.any(Object),
      );
    });

    it('should reset attempts when specified', async () => {
      await scheduler.retry({ resetAttempts: true });

      expect(jobHandlerManager.isExceedingMaxAttemptCount).toHaveBeenCalledWith(
        JOB,
        2,
      );
      expect(amqpConnection.sendToQueue).toHaveBeenCalledWith(
        expect.any(String),
        {
          serialized: expect.objectContaining({
            attempt: 2,
          }),
        },
        expect.any(Object),
      );
    });

    it('should discard job when maximum attempt count is exceeded', async () => {
      jobHandlerManager.isExceedingMaxAttemptCount.mockReturnValue(true);

      await scheduler.retry();

      expect(scheduler.discard).toHaveBeenCalledTimes(1);
      expect(scheduler.discard).toHaveBeenCalledWith(
        new MaxAttemptCountReachedError(),
      );
      expect(amqpConnection.sendToQueue).not.toHaveBeenCalled();
    });
  });

  describe('discard()', () => {
    const reason = new Error('Fake reason');

    it('should discard the job once', () => {
      scheduler.discard(reason);
      scheduler.discard(new Error('Some other reason'));

      expect(discardedJobReporter.report).toHaveBeenCalledTimes(1);
      expect(discardedJobReporter.report).toHaveBeenCalledWith({
        job: JOB,
        data: DATA,
        attempt: ATTEMPT,
        reason,
      });
    });
  });
});
