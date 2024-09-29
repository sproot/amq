import 'jest-extended';
import {
  factoryMockHelper,
  eventEmitterHelper,
  FactoryMock,
} from '../../../helpers';
import { JobClient } from '../../../../src/jobs/job-client/JobClient';
import { AsyncEventEmitter } from '../../../helpers/AsyncEventEmitter';
import { IdGenerator } from '../../../../src/types';
import { JsonBufferSerializer, AmqpConnection } from '../../../../src/core';
import { JobQueueInitializer } from '../../../../src/jobs/job-queue/JobQueueInitializer';

describe('JobClient', () => {
  const EXCHANGE = 'fake-job-exchange';

  let jobClient: JobClient;
  let jobQueueInitializerFactory: FactoryMock<JobQueueInitializer>;
  let jobQueueInitializer: jest.Mocked<JobQueueInitializer>;
  let jsonBufferSerializer: jest.Mocked<JsonBufferSerializer>;
  let amqpConnection: jest.Mocked<AmqpConnection>;
  let amqpConnectionEmitter: AsyncEventEmitter;
  let idGenerator: jest.Mocked<IdGenerator>;

  beforeEach(() => {
    jobQueueInitializer = createJobQueueInitializerMock();
    jobQueueInitializerFactory = factoryMockHelper.create(jobQueueInitializer);

    jsonBufferSerializer = {
      serialize: jest.fn((content) => ({
        serialized: content,
      })),
      deserialize: jest.fn(() => null),
    } as unknown as jest.Mocked<JsonBufferSerializer>;

    amqpConnection = {
      on: jest.fn(),
      removeListener: jest.fn(),
      publishToExchange: jest.fn(async () => {}),
    } as unknown as jest.Mocked<AmqpConnection>;

    amqpConnectionEmitter = eventEmitterHelper.install(amqpConnection);

    idGenerator = {
      generate: jest.fn(() => 'fake-id'),
    };

    jobClient = new JobClient(
      {
        exchange: EXCHANGE,
      },
      {
        jobQueueInitializerFactory,
        jsonBufferSerializer,
        amqpConnection,
        idGenerator,
      },
    );
  });

  describe('constructor()', () => {
    it('should validate necessary options and dependencies', () => {
      // @ts-ignore: ignore missed options and dependencies
      expect(() => new JobClient({}, {})).toThrowError(
        '"options.exchange" is required',
      );

      expect(
        () =>
          new JobClient(
            {
              exchange: EXCHANGE,
            },
            // @ts-ignore: ignore missed dependencies
            {},
          ),
      ).toThrowError('"dependencies.amqpConnection" is required');
    });
  });

  describe('performInBackground()', () => {
    const generatedId = 'fake-generated-id';

    beforeEach(() => {
      idGenerator.generate.mockReturnValueOnce(generatedId);
    });

    it('should throw an error when disposed', async () => {
      jobClient.dispose();

      await expect(
        jobClient.performInBackground('fake-job-queue', {
          job: 'fake-job',
          data: { fake: 'job data' },
        }),
      ).rejects.toThrow('Cannot use disposed JobClient');
    });

    it('should validate "queue"', async () => {
      const invalidQueues = [
        '',
        null,
        undefined,
        false,
        true,
        -123,
        0,
        123,
        Symbol('hello world'),
        [1, 2, 3],
        { hello: 'world' },
        new Error('Fake error'),
      ];

      for (const invalidQueue of invalidQueues) {
        await expect(
          // @ts-ignore: ignore invalid queue
          jobClient.performInBackground(invalidQueue, { job: 'fake-job' }),
        ).rejects.toThrow(
          `"queue" must be a non-empty string (provided: "${String(
            invalidQueue,
          )}")`,
        );
      }
    });

    it('should validate "context.job"', async () => {
      const invalidJobs = [
        '',
        null,
        undefined,
        false,
        true,
        -123,
        0,
        123,
        Symbol('hello world'),
        [1, 2, 3],
        { hello: 'world' },
        new Error('Fake error'),
      ];

      for (const invalidJob of invalidJobs) {
        await expect(
          // @ts-ignore: ignore invalid job
          jobClient.performInBackground('fake-queue', { job: invalidJob }),
        ).rejects.toThrow(
          `"context.job" must be a non-empty string (provided: "${String(
            invalidJob,
          )}")`,
        );
      }
    });

    it('should validate "context.data"', async () => {
      class SomeClass {
        hello: string;

        constructor() {
          this.hello = 'world';
        }
      }

      const invalidDataValues = [
        null,
        false,
        true,
        -123,
        0,
        123,
        '',
        'hello world',
        Symbol('hello world'),
        [1, 2, 3],
        new Error('Fake error'),
        SomeClass,
        new SomeClass(),
      ];

      for (const invalidData of invalidDataValues) {
        await expect(
          jobClient.performInBackground('fake-queue', {
            job: 'fake-job',
            data: invalidData,
          }),
        ).rejects.toThrow(
          `"context.data" must be a plain object (provided: "${String(
            invalidData,
          )}")`,
        );
      }
    });

    it('should validate "context.expireMs"', async () => {
      const invalidExpireMsValues = [
        null,
        false,
        true,
        -123,
        -123.45,
        0,
        0.5,
        0.99,
        1.5,
        123.45,
        '',
        'hello world',
        Symbol('hello world'),
        [1, 2, 3],
        { hello: 'world' },
        new Error('Fake error'),
      ];

      for (const invalidExpireMs of invalidExpireMsValues) {
        await expect(
          jobClient.performInBackground('fake-queue', {
            job: 'fake-job',
            // @ts-ignore: ignore invalid expireMs
            expireMs: invalidExpireMs,
          }),
        ).rejects.toThrow(
          `"context.expireMs" must be a positive integer (provided: "${String(
            invalidExpireMs,
          )}")`,
        );
      }
    });

    it('should initialize job queue when not initialized already', async () => {
      const queue1 = 'fake-job-queue-1';
      const queue2 = 'fake-job-queue-2';
      const queue3 = 'fake-job-queue-3';

      await Promise.all([
        jobClient.performInBackground(queue1, {
          job: 'fake-job-1',
          data: { fake: 'job data 1' },
        }),
        jobClient.performInBackground(queue2, {
          job: 'fake-job-2',
          data: { fake: 'job data 2' },
        }),
      ]);

      await jobClient.performInBackground(queue3, {
        job: 'fake-job-3',
        data: { fake: 'job data 3' },
      });

      expect(jobQueueInitializerFactory.create).toHaveBeenCalledTimes(3);
      expect(jobQueueInitializerFactory.create).toHaveBeenCalledWith(
        { exchange: EXCHANGE, queue: queue1 },
        { amqpConnection },
      );
      expect(jobQueueInitializerFactory.create).toHaveBeenCalledWith(
        { exchange: EXCHANGE, queue: queue2 },
        { amqpConnection },
      );
      expect(jobQueueInitializerFactory.create).toHaveBeenCalledWith(
        { exchange: EXCHANGE, queue: queue3 },
        { amqpConnection },
      );

      expect(jobQueueInitializer.initialize).toHaveBeenCalledTimes(3);
    });

    it('should not create new job queue initializer when already exists', async () => {
      const queue = 'fake-job-queue';

      await Promise.all([
        jobClient.performInBackground(queue, {
          job: 'fake-job-1',
          data: { fake: 'job data 1' },
        }),
        jobClient.performInBackground(queue, {
          job: 'fake-job-2',
          data: { fake: 'job data 2' },
        }),
      ]);

      await jobClient.performInBackground(queue, {
        job: 'fake-job-3',
        data: { fake: 'job data 3' },
      });

      expect(jobQueueInitializerFactory.create).toHaveBeenCalledExactlyOnceWith(
        { exchange: EXCHANGE, queue },
        { amqpConnection },
      );
      expect(jobQueueInitializer.initialize).toHaveBeenCalledTimes(3);
    });

    it('should re-initialize job queue when amqp connection has been reconnected', async () => {
      const queue = 'fake-job-queue';

      await jobClient.performInBackground(queue, {
        job: 'fake-job',
        data: { fake: 'job data' },
      });

      amqpConnectionEmitter.emit('reconnected');

      await jobClient.performInBackground(queue, {
        job: 'fake-job',
        data: { fake: 'job data' },
      });

      expect(jobQueueInitializerFactory.create).toHaveBeenCalledTimes(2);
      expect(jobQueueInitializerFactory.create).toHaveBeenCalledWith(
        { exchange: EXCHANGE, queue },
        { amqpConnection },
      );
      expect(jobQueueInitializer.initialize).toHaveBeenCalledTimes(2);
    });

    it('should publish the job to the exchange', async () => {
      const queue = 'fake-job-queue';

      await jobClient.performInBackground(queue, {
        job: 'fake-job',
        data: { fake: 'job data' },
      });

      expect(amqpConnection.publishToExchange).toHaveBeenCalledExactlyOnceWith(
        EXCHANGE,
        {
          serialized: {
            job: 'fake-job',
            data: { fake: 'job data' },
            retryContext: {},
            attempt: 1,
          },
        },
        {
          correlationId: generatedId,
          routingKey: queue,
          persistent: true,
        },
      );
    });

    it('should set expiration duration for the job when specified', async () => {
      const queue = 'fake-job-queue';
      const expireMs = 14600;

      await jobClient.performInBackground(queue, {
        job: 'fake-job',
        data: { fake: 'job data' },
        expireMs,
      });

      expect(amqpConnection.publishToExchange).toHaveBeenCalledExactlyOnceWith(
        EXCHANGE,
        {
          serialized: {
            job: 'fake-job',
            data: { fake: 'job data' },
            retryContext: {},
            attempt: 1,
          },
        },
        {
          correlationId: generatedId,
          routingKey: queue,
          persistent: true,
          expireMs,
        },
      );
    });

    it('should make the message transient (non-persistent) when "transient" option is enabled', async () => {
      const queue = 'fake-job-queue';

      await jobClient.performInBackground(queue, {
        job: 'fake-job',
        data: { fake: 'job data' },
        transient: true,
      });

      expect(amqpConnection.publishToExchange).toHaveBeenCalledExactlyOnceWith(
        EXCHANGE,
        {
          serialized: {
            job: 'fake-job',
            data: { fake: 'job data' },
            retryContext: {},
            attempt: 1,
          },
        },
        {
          correlationId: generatedId,
          routingKey: queue,
          persistent: false,
        },
      );
    });

    describe('[interruption]', () => {
      it('should interrupt while initializing the queue when disposed', async () => {
        jobQueueInitializer.initialize.mockImplementation(async () => {
          jobClient.dispose();
        });

        await jobClient.performInBackground('fake-queue', {
          job: 'fake-job',
          data: { fake: 'job data' },
        });

        expect(amqpConnection.publishToExchange).not.toHaveBeenCalled();
      });
    });
  });

  describe('[with initialized job queues]', () => {
    let jobQueueInitializer1: jest.Mocked<JobQueueInitializer>;
    let jobQueueInitializer2: jest.Mocked<JobQueueInitializer>;

    beforeEach(async () => {
      jobQueueInitializer1 = createJobQueueInitializerMock();
      jobQueueInitializer2 = createJobQueueInitializerMock();

      jobQueueInitializerFactory.create
        .mockReturnValueOnce(jobQueueInitializer1)
        .mockReturnValueOnce(jobQueueInitializer2);

      await jobClient.performInBackground('fake-queue-1', {
        job: 'fake-job-1',
        data: { fake: 'job data 1' },
      });
      await jobClient.performInBackground('fake-queue-2', {
        job: 'fake-job-2',
        data: { fake: 'job data 2' },
      });
    });

    describe('dispose()', () => {
      it('should dispose all initialized job queues', () => {
        jobClient.dispose();

        expect(jobQueueInitializer1.dispose).toHaveBeenCalledExactlyOnceWith();
        expect(jobQueueInitializer2.dispose).toHaveBeenCalledExactlyOnceWith();
      });
    });

    describe('[handle AmqpConnection\'s "reconnected" event]', () => {
      it('should dispose all initialized job queues', () => {
        amqpConnectionEmitter.emit('reconnected');

        expect(jobQueueInitializer1.dispose).toHaveBeenCalledExactlyOnceWith();
        expect(jobQueueInitializer2.dispose).toHaveBeenCalledExactlyOnceWith();
      });
    });
  });
});

function createJobQueueInitializerMock() {
  const jobQueueInitializer = {
    initialize: jest.fn(async () => {}),
    dispose: jest.fn(),
  } as unknown as jest.Mocked<JobQueueInitializer>;

  return jobQueueInitializer;
}
