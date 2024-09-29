import 'jest-extended';
import {
  factoryMockHelper,
  FactoryMock,
  eventEmitterHelper,
  promiseHelper,
} from '../../../helpers';
import { AsyncEventEmitter } from '../../../helpers/AsyncEventEmitter';

import { JobServer } from '../../../../src/jobs/job-server/JobServer';
import {
  JobTimedOutError,
  MaxAttemptCountReachedError,
} from '../../../../src/jobs/errors';
import { JobHandlerManager } from '../../../../src/jobs/job-server/JobHandlerManager';
import { JobHandlerValidator } from '../../../../src/jobs/job-server/validation/JobHandlerValidator';
import { Scheduler } from '../../../../src/jobs/job-server/Scheduler';
import { DiscardedJobReporter } from '../../../../src/jobs/job-server/DiscardedJobReporter';
import { JobQueueConsumer } from '../../../../src/jobs/job-queue/JobQueueConsumer';
import { JobQueueInitializer } from '../../../../src/jobs/job-queue/JobQueueInitializer';
import { MessageRelevancyChecker } from '../../../../src/MessageRelevancyChecker';
import { JobRetryQueueProvider } from '../../../../src/jobs/job-queue/JobRetryQueueProvider';

describe('JobServer', () => {
  const EXCHANGE = 'fake-exchange';
  const QUEUE = 'fake-queue';
  const DEFAULT_MAX_ATTEMPT_COUNT = 146;
  const STALE_JOB_DURATION_MS = 1047;

  let jobServer: JobServer;
  let messageRelevancyChecker: any;
  let messageRelevancyCheckerFactory: FactoryMock<MessageRelevancyChecker>;
  let defaultRetryDelayCalculator: any;
  let schedulerFactory: FactoryMock<Scheduler>;
  let scheduler: any;
  let jobRetryQueueProviderFactory: FactoryMock<JobRetryQueueProvider>;
  let jobRetryQueueProvider: any;
  let discardedJobReporterFactory: FactoryMock<DiscardedJobReporter>;
  let discardedJobReporterEmitter: AsyncEventEmitter;
  let discardedJobReporter: any;
  let jobHandlerManagerFactory: FactoryMock<JobHandlerManager>;
  let jobHandlerManager: any;
  let jobHandlerValidatorFactory: FactoryMock<JobHandlerValidator>;
  let jobHandlerValidator: any;
  let retryDelayCalculatorValidator: any;
  let positiveNumberValidator: any;
  let jobQueueConsumerFactory: FactoryMock<JobQueueConsumer>;
  let jobQueueConsumer: any;
  let jobQueueConsumerEmitter: AsyncEventEmitter;
  let jobQueueInitializerFactory: FactoryMock<JobQueueInitializer>;
  let jobQueueInitializer: any;
  let amqpConnection: any;
  let amqpConnectionEmitter: AsyncEventEmitter;
  let jsonBufferSerializer: any;

  beforeEach(() => {
    jest.useFakeTimers();

    messageRelevancyChecker = {
      lock: jest.fn(() => false),
      unlock: jest.fn(),
      unlockAll: jest.fn(),
      getDeliveryTag: jest.fn(() => null),
    };

    messageRelevancyCheckerFactory = factoryMockHelper.create(
      messageRelevancyChecker,
    );

    defaultRetryDelayCalculator = { dummy: 'defaultRetryDelayCalculator' };

    scheduler = {
      retry: jest.fn(async () => {}),
      discard: jest.fn(),
    };

    schedulerFactory = factoryMockHelper.create(scheduler);

    jobRetryQueueProvider = { dummy: 'jobRetryQueueProvider' };
    jobRetryQueueProviderFactory = factoryMockHelper.create(
      jobRetryQueueProvider,
    );

    discardedJobReporter = {
      on: jest.fn(),
      removeListener: jest.fn(),
    };

    discardedJobReporterEmitter =
      eventEmitterHelper.install(discardedJobReporter);
    discardedJobReporterFactory =
      factoryMockHelper.create(discardedJobReporter);

    jobHandlerManager = {
      set: jest.fn(),
      handle: jest.fn(async () => {}),
      handleError: jest.fn(async () => {}),
      isExceedingMaxAttemptCount: jest.fn(() => false),
      deleteAll: jest.fn(),
      getTimeoutMs: jest.fn(() => null),
    };

    jobHandlerManagerFactory = factoryMockHelper.create(jobHandlerManager);

    jobHandlerValidator = { dummy: 'jobHandlerValidator' };
    jobHandlerValidatorFactory = factoryMockHelper.create(jobHandlerValidator);
    retryDelayCalculatorValidator = {
      validate: jest.fn(),
    };

    positiveNumberValidator = {
      validate: jest.fn(),
    };

    jobQueueConsumer = {
      on: jest.fn(),
      removeListener: jest.fn(),
      consume: jest.fn(async () => {}),
      dispose: jest.fn(async () => {}),
    };

    jobQueueConsumerEmitter = eventEmitterHelper.install(jobQueueConsumer);
    jobQueueConsumerFactory = factoryMockHelper.create(jobQueueConsumer);

    jobQueueInitializer = {
      initialize: jest.fn(async () => {}),
      reset: jest.fn(),
      dispose: jest.fn(),
    };

    jobQueueInitializerFactory = factoryMockHelper.create(jobQueueInitializer);

    amqpConnection = {
      on: jest.fn(),
      removeListener: jest.fn(),
      publishToExchange: jest.fn(async () => {}),
      acknowledge: jest.fn(async () => {}),
    };

    amqpConnectionEmitter = eventEmitterHelper.install(amqpConnection);

    jsonBufferSerializer = {
      serialize: jest.fn((content) => ({
        serialized: content,
      })),
      deserialize: jest.fn(() => null),
    };

    jobServer = new JobServer(
      {
        exchange: EXCHANGE,
        queue: QUEUE,
        staleJobDurationMs: STALE_JOB_DURATION_MS,
        defaultMaxAttemptCount: DEFAULT_MAX_ATTEMPT_COUNT,
        defaultRetryDelayCalculator,
      },
      {
        schedulerFactory,
        jobRetryQueueProviderFactory,
        discardedJobReporterFactory,
        jobHandlerManagerFactory,
        jobHandlerValidatorFactory,
        retryDelayCalculatorValidator,
        positiveNumberValidator,
        jobQueueConsumerFactory,
        jobQueueInitializerFactory,
        messageRelevancyCheckerFactory,
        amqpConnection,
        jsonBufferSerializer,
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor()', () => {
    it('should validate necessary options and dependencies', () => {
      // @ts-ignore: ignore options and dependencies for test
      expect(() => new JobServer({}, {})).toThrowError(
        '"options.exchange" is required',
      );

      expect(
        () =>
          new JobServer(
            // @ts-ignore: ignore for test
            {
              exchange: EXCHANGE,
            },
            {},
          ),
      ).toThrowError('"options.queue" is required');

      expect(
        () =>
          new JobServer(
            {
              exchange: EXCHANGE,
              queue: QUEUE,
              defaultMaxAttemptCount: DEFAULT_MAX_ATTEMPT_COUNT,
              defaultRetryDelayCalculator,
            },
            // @ts-ignore: ignore dependencies for test
            {},
          ),
      ).toThrowError('"dependencies.amqpConnection" is required');
    });

    it('should validate default timeout calculator', () => {
      expect(retryDelayCalculatorValidator.validate).toHaveBeenCalledWith(
        defaultRetryDelayCalculator,
        'options.defaultRetryDelayCalculator,',
      );
    });

    it('should validate default max attempt count', () => {
      expect(positiveNumberValidator.validate).toHaveBeenCalledWith(
        DEFAULT_MAX_ATTEMPT_COUNT,
        'options.defaultMaxAttemptCount',
      );
    });

    it('should validate staleJobDurationMs', () => {
      expect(positiveNumberValidator.validate).toHaveBeenCalledWith(
        STALE_JOB_DURATION_MS,
        'options.staleJobDurationMs',
      );
    });

    it('should create JobHandlerManager', () => {
      expect(jobHandlerManagerFactory.create).toHaveBeenCalledExactlyOnceWith({
        defaultRetryDelayCalculator,
        defaultMaxAttemptCount: DEFAULT_MAX_ATTEMPT_COUNT,
        jobHandlerValidator,
      });

      expect(jobHandlerValidatorFactory.create).toHaveBeenCalledWith({
        retryDelayCalculatorValidator,
        positiveNumberValidator,
      });
    });

    it('should create JobQueueConsumer', () => {
      expect(jobQueueConsumerFactory.create).toHaveBeenCalledExactlyOnceWith(
        {
          queue: QUEUE,
        },
        {
          amqpConnection,
        },
      );
    });

    it('should create JobQueueInitializer', () => {
      expect(jobQueueInitializerFactory.create).toHaveBeenCalledExactlyOnceWith(
        {
          exchange: EXCHANGE,
          queue: QUEUE,
        },
        { amqpConnection },
      );
    });
  });

  describe('listen()', () => {
    it('should initialize default job queue', async () => {
      await jobServer.listen();

      expect(jobQueueInitializer.initialize).toHaveBeenCalledExactlyOnceWith();
    });

    it('should consume job queue', async () => {
      await jobServer.listen();

      expect(jobQueueConsumer.consume).toHaveBeenCalledExactlyOnceWith();
    });

    it('should throw an error when already listening', async () => {
      /** no await */ jobServer.listen();

      await expect(jobServer.listen()).rejects.toThrow(
        'Job server is already listening',
      );
    });

    it('should throw an error when disposed', async () => {
      /** no await */ jobServer.listen();
      /** no await */ jobServer.dispose();

      await expect(jobServer.listen()).rejects.toThrow(
        'Cannot reuse disposed job server',
      );
    });

    describe('[interruption]', () => {
      it('should be interrupted when disposed while initializing default job queue', async () => {
        jobQueueInitializer.initialize.mockImplementation(async () => {
          /** no await */ jobServer.dispose();
        });

        await jobServer.listen();

        expect(jobQueueConsumer.consume).not.toHaveBeenCalled();
      });
    });
  });

  describe('dispose()', () => {
    executeWhenListening(() => {
      it('should delete all job handlers', async () => {
        await jobServer.dispose();

        expect(jobHandlerManager.deleteAll).toHaveBeenCalledExactlyOnceWith();
      });

      it('should dispose default job queue', async () => {
        await jobServer.dispose();

        expect(jobQueueInitializer.dispose).toHaveBeenCalledExactlyOnceWith();
      });

      it('should dispose job queue consumer', async () => {
        await jobServer.dispose();

        expect(jobQueueConsumer.dispose).toHaveBeenCalledExactlyOnceWith();
      });
    });

    it('should do nothing when not listening', async () => {
      await jobServer.dispose();

      expect(jobQueueInitializer.dispose).not.toHaveBeenCalled();
      expect(jobQueueConsumer.dispose).not.toHaveBeenCalled();
    });

    it('should do nothing when already disposed', async () => {
      /** no await */ jobServer.listen();
      /** no await */ jobServer.dispose();

      await jobServer.dispose();

      expect(jobQueueInitializer.dispose).toHaveBeenCalledExactlyOnceWith();
      expect(jobQueueConsumer.dispose).toHaveBeenCalledExactlyOnceWith();
    });
  });

  describe('setJobHandler', () => {
    it('should store job handler', () => {
      const jobHandler = { fake: 'jobHandler' };

      jobServer.setJobHandler('fake-job', jobHandler);

      expect(jobHandlerManager.set).toHaveBeenCalledWith(
        'fake-job',
        jobHandler,
      );
    });
  });

  describe('[handle jobQueueConsumer\'s "message" event]', () => {
    const content = { fake: 'message' };
    const correlationId = 'fake-correlation-id';
    const deliveryTag = 'fake-delivery-tag';
    const message = { content, deliveryTag, correlationId };

    const job = 'fake-job';
    const data = { fake: 'jobData' };
    const retryContext = { fake: 'retryContext' };
    const attempt = 146;

    const actualDeliveryTag = 'fake-actual-delivery-tag';

    let handleJobSpy: jest.SpyInstance;

    beforeEach(() => {
      jobHandlerManager.isExceedingMaxAttemptCount.mockReturnValue(false);

      messageRelevancyChecker.lock.mockReturnValue(true);
      messageRelevancyChecker.getDeliveryTag.mockReturnValue(actualDeliveryTag);

      jsonBufferSerializer.deserialize.mockReturnValue({
        job,
        data,
        retryContext,
        attempt,
      });

      handleJobSpy = jest.spyOn(jobServer, 'handleJob');
    });

    executeWhenListening(() => {
      it('should do nothing when message is locked due to relevancy check', async () => {
        messageRelevancyChecker.lock.mockReturnValue(false);

        await jobQueueConsumerEmitter.emitAsync('message', message);

        expect(messageRelevancyChecker.lock).toHaveBeenCalledExactlyOnceWith(
          correlationId,
          deliveryTag,
        );
        expect(jsonBufferSerializer.deserialize).not.toHaveBeenCalled();
        expect(handleJobSpy).not.toHaveBeenCalled();
        expect(amqpConnection.acknowledge).not.toHaveBeenCalled();
      });

      it('should execute corresponding job handler', async () => {
        await jobQueueConsumerEmitter.emitAsync('message', message);

        expect(handleJobSpy).toHaveBeenCalledExactlyOnceWith(
          job,
          { data, retryContext, attempt },
          scheduler,
        );
      });

      it('should discard the job when max attempt count is exceeded', async () => {
        jobHandlerManager.isExceedingMaxAttemptCount.mockReturnValue(true);
        await jobQueueConsumerEmitter.emitAsync('message', message);

        expect(
          jobHandlerManager.isExceedingMaxAttemptCount,
        ).toHaveBeenCalledExactlyOnceWith(job, attempt);
        expect(scheduler.discard).toHaveBeenCalledExactlyOnceWith(
          new MaxAttemptCountReachedError(),
        );
        expect(handleJobSpy).not.toHaveBeenCalled();
      });

      it('should acknowledge the message', async () => {
        await jobQueueConsumerEmitter.emitAsync('message', message);
        expect(amqpConnection.acknowledge).toHaveBeenCalledExactlyOnceWith(
          actualDeliveryTag,
        );
      });

      describe('[acknowledge error]', () => {
        let acknowledgeErrorEventSpy: jest.Mock;
        const acknowledgeError = new Error('Acknowledge error');

        beforeEach(() => {
          acknowledgeErrorEventSpy = jest.fn();
          jobServer.on('acknowledgeError', acknowledgeErrorEventSpy);
          amqpConnection.acknowledge.mockImplementation(() => {
            throw acknowledgeError;
          });
        });

        it('should ignore acknowledge errors', async () => {
          await expect(
            jobQueueConsumerEmitter.emitAsync('message', message),
          ).toResolve();
        });

        it('should emit "acknowledgeError" event', async () => {
          await jobQueueConsumerEmitter.emitAsync('message', message);

          expect(acknowledgeErrorEventSpy).toHaveBeenCalledExactlyOnceWith({
            error: acknowledgeError,
            job,
            data,
            retryContext,
            attempt,
          });
        });

        it('should not emit "acknowledgeError" event when unsubscribed', async () => {
          jobServer.removeListener(
            'acknowledgeError',
            acknowledgeErrorEventSpy,
          );

          await jobQueueConsumerEmitter.emitAsync('message', message);

          expect(acknowledgeErrorEventSpy).not.toHaveBeenCalled();
        });
      });

      it('should ignore acknowledge errors', async () => {
        amqpConnection.acknowledge.mockImplementation(() => {
          throw new Error('Fake error');
        });

        await expect(
          jobQueueConsumerEmitter.emitAsync('message', message),
        ).toResolve();
      });

      it('should not acknowledge the message when actual delivery tag is unknown', async () => {
        messageRelevancyChecker.getDeliveryTag.mockReturnValue(null);
        await jobQueueConsumerEmitter.emitAsync('message', message);

        expect(
          messageRelevancyChecker.getDeliveryTag,
        ).toHaveBeenCalledExactlyOnceWith(correlationId);
        expect(amqpConnection.acknowledge).not.toHaveBeenCalled();
      });

      it('should unlock relevancy checker lock', async () => {
        await jobQueueConsumerEmitter.emitAsync('message', message);
        expect(messageRelevancyChecker.unlock).toHaveBeenCalledExactlyOnceWith(
          correlationId,
        );
        expect(amqpConnection.acknowledge).toHaveBeenCalledBefore(
          messageRelevancyChecker.unlock,
        );
      });

      describe('[deserialization error]', () => {
        let deserializationErrorEventSpy: jest.Mock;

        const error = new Error('Fake error');

        beforeEach(() => {
          deserializationErrorEventSpy = jest.fn();
          jobServer.on('deserializationError', deserializationErrorEventSpy);
          jsonBufferSerializer.deserialize.mockImplementation(() => {
            throw error;
          });
        });

        it('should emit "deserializationError" event', async () => {
          await jobQueueConsumerEmitter.emitAsync('message', message);

          expect(
            jsonBufferSerializer.deserialize,
          ).toHaveBeenCalledExactlyOnceWith(content);
          expect(deserializationErrorEventSpy).toHaveBeenCalledWith(
            error,
            content,
          );
          expect(handleJobSpy).not.toHaveBeenCalled();
        });

        it('should not emit "deserializationError" event when unsubscribed', async () => {
          jobServer.removeListener(
            'deserializationError',
            deserializationErrorEventSpy,
          );

          await jobQueueConsumerEmitter.emitAsync('message', message);

          expect(deserializationErrorEventSpy).not.toHaveBeenCalled();
          expect(handleJobSpy).not.toHaveBeenCalled();
        });
      });

      describe('[handle() failed]', () => {
        let handleError: Error;

        beforeEach(() => {
          handleError = new Error('Fake #handle error');
          handleJobSpy.mockImplementation(() => Promise.reject(handleError));
        });

        it('should create scheduler', async () => {
          await jobQueueConsumerEmitter.emitAsync('message', message);

          expect(schedulerFactory.create).toHaveBeenCalledWith(
            {
              exchange: EXCHANGE,
              queue: QUEUE,
              job,
              data,
              attempt,
              correlationId,
            },
            {
              jobRetryQueueProviderFactory,
              discardedJobReporter,
              jobHandlerManager,
              amqpConnection,
              jsonBufferSerializer,
            },
          );
        });

        it('should handle error using the job handler manager', async () => {
          await jobQueueConsumerEmitter.emitAsync('message', message);

          expect(scheduler.retry).not.toHaveBeenCalled();
          expect(jobHandlerManager.handleError).toHaveBeenCalledWith(
            job,
            {
              data,
              retryContext,
              attempt,
            },
            handleError,
            scheduler,
          );
        });

        it('should retry with default options when error handling failed', async () => {
          const error = new Error('Fake error');
          jobHandlerManager.handleError.mockImplementation(() =>
            Promise.reject(error),
          );

          await jobQueueConsumerEmitter.emitAsync('message', message);

          expect(scheduler.retry).toHaveBeenCalledWith();
        });

        it('should acknowledge the message', async () => {
          await jobQueueConsumerEmitter.emitAsync('message', message);

          expect(amqpConnection.acknowledge).toHaveBeenCalledExactlyOnceWith(
            actualDeliveryTag,
          );
        });

        describe('[#handleError failed]', () => {
          let handleErrorError: Error;
          let jobErrorEventSpy: jest.Mock;

          beforeEach(() => {
            handleErrorError = new Error('Fake #handleError error');
            jobHandlerManager.handleError.mockImplementation(() =>
              Promise.reject(handleErrorError),
            );
            jobErrorEventSpy = jest.fn();
            jobServer.on('jobError', jobErrorEventSpy);
          });

          it('should emit "jobError" event', async () => {
            await jobQueueConsumerEmitter.emitAsync('message', message);
            expect(jobErrorEventSpy).toHaveBeenCalledWith(handleErrorError, {
              job,
              data,
              retryContext,
              attempt,
            });
          });

          it('should not emit "jobError" event when unsubscribed', async () => {
            jobServer.removeListener('jobError', jobErrorEventSpy);
            await jobQueueConsumerEmitter.emitAsync('message', message);
            expect(jobErrorEventSpy).not.toHaveBeenCalled();
          });

          describe('[interruption]', () => {
            it('should be interrupted when disposed while handling the error', async () => {
              jobHandlerManager.handleError.mockImplementation(async () => {
                /** no await */ jobServer.dispose();
                throw handleErrorError;
              });

              await jobQueueConsumerEmitter.emitAsync('message', message);

              expect(jobErrorEventSpy).not.toHaveBeenCalled();
              expect(scheduler.retry).not.toHaveBeenCalled();
              expect(amqpConnection.acknowledge).not.toHaveBeenCalled();
            });

            it('should be interrupted when disposed while retrying the job using default options', async () => {
              scheduler.retry.mockImplementation(async () => {
                /** no await */ jobServer.dispose();
              });

              await jobQueueConsumerEmitter.emitAsync('message', message);

              expect(amqpConnection.acknowledge).not.toHaveBeenCalled();
            });
          });
        });

        describe('[interruption]', () => {
          it('should be interrupted when disposed while handling the job', async () => {
            handleJobSpy.mockImplementation(async () => {
              /** no await */ jobServer.dispose();
              throw handleError;
            });

            await jobQueueConsumerEmitter.emitAsync('message', message);

            expect(jobHandlerManager.handleError).not.toHaveBeenCalled();
            expect(amqpConnection.acknowledge).not.toHaveBeenCalled();
          });

          it('should be interrupted when disposed while handling error with #handleError', async () => {
            jobHandlerManager.handleError.mockImplementation(async () => {
              /** no await */ jobServer.dispose();
            });

            await jobQueueConsumerEmitter.emitAsync('message', message);

            expect(amqpConnection.acknowledge).not.toHaveBeenCalled();
          });
        });
      });

      describe('[interruption]', () => {
        it('should be interrupted when disposed while handling the job', async () => {
          handleJobSpy.mockImplementation(async () => {
            /** no await */ jobServer.dispose();
          });

          await jobQueueConsumerEmitter.emitAsync('message', message);

          expect(amqpConnection.acknowledge).not.toHaveBeenCalled();
        });
      });
    });

    executeWhenNotListening(() => {
      beforeEach(() => {
        jobQueueConsumer.consume.mockClear();
      });

      it('should do nothing', async () => {
        await jobQueueConsumerEmitter.emitAsync('message', message);
        expect(handleJobSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('handleJob()', () => {
    const job = 'fake-job';
    const data = { fake: 'data' };
    const retryContext = { fake: 'retryContext' };
    const attempt = 146;
    const context = { data, retryContext, attempt };

    it('should execute the handler', async () => {
      await jobServer.handleJob(job, context, scheduler);

      expect(jobHandlerManager.handle).toHaveBeenCalledExactlyOnceWith(
        job,
        context,
        scheduler,
      );
    });

    it('should re-throw errors', async () => {
      const error = new Error('Fake error');

      jobHandlerManager.handle.mockImplementation(() => {
        throw error;
      });

      await expect(
        jobServer.handleJob(job, context, scheduler),
      ).rejects.toThrow(error);
    });

    it('should time out when timeoutMs is specified', async () => {
      jobHandlerManager.handle.mockReturnValue(new Promise(() => {}));

      const timeoutMs = 1560;
      jobHandlerManager.getTimeoutMs.mockReturnValue(timeoutMs);

      const promise = jobServer.handleJob(job, context, scheduler);

      expect(jobHandlerManager.getTimeoutMs).toHaveBeenCalledWith(job);

      await jest.advanceTimersByTimeAsync(timeoutMs - 1);
      await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

      await jest.advanceTimersByTimeAsync(1);
      await expect(promise).rejects.toThrow(new JobTimedOutError());
    });

    it('should not time out when timeoutMs is not specified', async () => {
      jobHandlerManager.handle.mockReturnValue(new Promise(() => {}));
      jobHandlerManager.getTimeoutMs.mockReturnValue(null);

      const promise = jobServer.handleJob(job, context, scheduler);

      expect(jobHandlerManager.getTimeoutMs).toHaveBeenCalledWith(job);

      await jest.advanceTimersByTimeAsync(9999);
      await expect(promiseHelper.isPending(promise)).resolves.toBe(true);
    });

    describe('["staleJob" event]', () => {
      let staleJobEventSpy: jest.Mock;

      beforeEach(() => {
        staleJobEventSpy = jest.fn();
        jobServer.on('staleJob', staleJobEventSpy);
      });

      it('should emit "staleJob" event when job handler runs for too long', async () => {
        jobHandlerManager.handle.mockImplementation(async () => {
          await jest.advanceTimersByTimeAsync(STALE_JOB_DURATION_MS);
        });

        await jobServer.handleJob(job, context, scheduler);

        expect(staleJobEventSpy).toHaveBeenCalledExactlyOnceWith({
          durationMs: STALE_JOB_DURATION_MS,
          hasTimedOut: false,
          job,
          data,
          retryContext,
          attempt,
        });
      });

      it('should emit "staleJob" event when job handler times out', async () => {
        const timeoutMs = 1560;
        jobHandlerManager.getTimeoutMs.mockReturnValue(timeoutMs);
        jobHandlerManager.handle.mockImplementation(async () => {
          await jest.advanceTimersByTimeAsync(timeoutMs);
        });

        await jobServer.handleJob(job, context, scheduler).catch(() => {});

        expect(staleJobEventSpy).toHaveBeenCalledExactlyOnceWith({
          durationMs: timeoutMs,
          hasTimedOut: true,
          job,
          data,
          retryContext,
          attempt,
        });
      });

      it('should not emit "staleJob" event when job handler runs quickly', async () => {
        jobHandlerManager.handle.mockImplementation(async () => {
          await jest.advanceTimersByTimeAsync(STALE_JOB_DURATION_MS - 1);
        });

        await jobServer.handleJob(job, context, scheduler);

        expect(staleJobEventSpy).not.toHaveBeenCalled();
      });

      it('should not emit "staleJob" event when unsubscribed', async () => {
        jobServer.removeListener('staleJob', staleJobEventSpy);

        jobHandlerManager.handle.mockImplementation(async () => {
          await jest.advanceTimersByTimeAsync(STALE_JOB_DURATION_MS);
        });

        await jobServer.handleJob(job, context, scheduler);

        expect(staleJobEventSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle amqpConnection\'s "reconnected" event]', () => {
    executeWhenListening(() => {
      beforeEach(() => {
        jobQueueInitializer.initialize.mockClear();
        jobQueueConsumer.consume.mockClear();
      });

      it('should immediately reset job queue initializers and unlock message relevancy checks', () => {
        amqpConnectionEmitter.emitAsync('reconnected');

        expect(jobQueueInitializer.reset).toHaveBeenCalledExactlyOnceWith();
        expect(
          messageRelevancyChecker.unlockAll,
        ).toHaveBeenCalledExactlyOnceWith();
      });

      it('should re-initialize the default job queue', async () => {
        await amqpConnectionEmitter.emitAsync('reconnected');

        expect(
          jobQueueInitializer.initialize,
        ).toHaveBeenCalledExactlyOnceWith();
      });

      it('should re-consume the job queue', async () => {
        await amqpConnectionEmitter.emitAsync('reconnected');
        expect(jobQueueConsumer.consume).toHaveBeenCalledExactlyOnceWith();
      });

      describe('[interruption]', () => {
        it('should be interrupted when disposed while initializing default job queue', async () => {
          jobQueueInitializer.initialize.mockImplementation(async () => {
            /** no await */ jobServer.dispose();
          });

          await amqpConnectionEmitter.emitAsync('reconnected');

          expect(jobQueueConsumer.consume).not.toHaveBeenCalled();
        });
      });
    });

    executeWhenNotListening(() => {
      beforeEach(() => {
        jobQueueInitializer.initialize.mockClear();
        jobQueueConsumer.consume.mockClear();
      });

      it('should do nothing', async () => {
        await amqpConnectionEmitter.emitAsync('reconnected');

        expect(jobQueueInitializer.initialize).not.toHaveBeenCalled();
        expect(jobQueueConsumer.consume).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle amqpConnection\'s "channelRecreated" event]', () => {
    executeWhenListening(() => {
      beforeEach(() => {
        jobQueueConsumer.consume.mockClear();
      });

      it('should re-consume the job queue', async () => {
        await amqpConnectionEmitter.emitAsync('channelRecreated');

        expect(jobQueueConsumer.consume).toHaveBeenCalledExactlyOnceWith();
      });
    });

    executeWhenNotListening(() => {
      beforeEach(() => {
        jobQueueConsumer.consume.mockClear();
      });

      it('should do nothing', async () => {
        await amqpConnectionEmitter.emitAsync('channelRecreated');

        expect(jobQueueConsumer.consume).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle discardedJobReporter\'s "jobDiscarded" event]', () => {
    let discardedJobEventSpy: jest.Mock;

    const data = { fake: 'jobDiscardedData' };

    beforeEach(() => {
      discardedJobEventSpy = jest.fn();
      jobServer.on('jobDiscarded', discardedJobEventSpy);
    });

    executeWhenListening(() => {
      it('should emit "jobDiscarded" event', async () => {
        discardedJobReporterEmitter.emit('jobDiscarded', data);

        expect(discardedJobEventSpy).toHaveBeenCalledWith(data);
      });

      it('should not emit "jobDiscarded" event when unsubscribed', async () => {
        jobServer.removeListener('jobDiscarded', discardedJobEventSpy);

        discardedJobReporterEmitter.emit('jobDiscarded', data);

        expect(discardedJobEventSpy).not.toHaveBeenCalled();
      });
    });

    executeWhenNotListening(() => {
      it('should do nothing', async () => {
        discardedJobReporterEmitter.emit('jobDiscarded', data);

        expect(discardedJobEventSpy).not.toHaveBeenCalled();
      });
    });
  });

  // --- helpers

  function executeWhenListening(tests: () => void) {
    describe('[listening]', () => {
      beforeEach(async () => {
        await jobServer.listen();
      });

      tests();
    });
  }

  function executeWhenNotListening(tests: () => void) {
    describe('[ready]', () => {
      tests();
    });

    describe('[disposed]', () => {
      beforeEach(async () => {
        await jobServer.listen();
        await jobServer.dispose();
      });

      tests();
    });
  }
});
