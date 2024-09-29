import 'jest-extended';
import { JobQueueInitializer } from '../../../../src/jobs/job-queue/JobQueueInitializer';

describe('JobQueueInitializer', () => {
  const EXCHANGE = 'fake-exchange';
  const QUEUE = 'fake-queue';

  let jobQueueInitializer: JobQueueInitializer;
  let amqpConnection: any;

  beforeEach(() => {
    amqpConnection = {
      assertExchange: jest.fn(async () => {}),
      assertQueue: jest.fn(async () => null),
      bindQueue: jest.fn(async () => {}),
    };

    jobQueueInitializer = new JobQueueInitializer(
      {
        exchange: EXCHANGE,
        queue: QUEUE,
      },
      { amqpConnection },
    );
  });

  describe('initialize()', () => {
    it('should assert the exchange', async () => {
      await jobQueueInitializer.initialize();

      expect(amqpConnection.assertExchange).toHaveBeenCalledExactlyOnceWith({
        exchange: EXCHANGE,
        type: 'direct',
        durable: true,
        autoDelete: false,
      });
    });

    it('should assert the queue', async () => {
      await jobQueueInitializer.initialize();

      expect(amqpConnection.assertQueue).toHaveBeenCalledExactlyOnceWith({
        queue: QUEUE,
        durable: true,
        autoDelete: false,
        exclusive: false,
      });
    });

    it('should bind the queue and exchange', async () => {
      await jobQueueInitializer.initialize();

      expect(amqpConnection.assertQueue).toHaveBeenCalledBefore(
        amqpConnection.bindQueue,
      );
      expect(amqpConnection.assertExchange).toHaveBeenCalledBefore(
        amqpConnection.bindQueue,
      );

      expect(amqpConnection.bindQueue).toHaveBeenCalledExactlyOnceWith({
        exchange: EXCHANGE,
        queue: QUEUE,
        routingKey: QUEUE,
      });
    });

    it('should not initialize when already initialized', async () => {
      await Promise.all([
        jobQueueInitializer.initialize(),
        jobQueueInitializer.initialize(),
      ]);
      await jobQueueInitializer.initialize();

      expect(amqpConnection.assertExchange).toHaveBeenCalledTimes(1);
      expect(amqpConnection.assertQueue).toHaveBeenCalledTimes(1);
      expect(amqpConnection.bindQueue).toHaveBeenCalledTimes(1);
    });

    it('should re-initialize when reset', async () => {
      await jobQueueInitializer.initialize();

      jobQueueInitializer.reset();

      await jobQueueInitializer.initialize();
      expect(amqpConnection.assertExchange).toHaveBeenCalledTimes(2);
      expect(amqpConnection.assertQueue).toHaveBeenCalledTimes(2);
      expect(amqpConnection.bindQueue).toHaveBeenCalledTimes(2);
    });

    describe('[interruption]', () => {
      describe('[by dispose() call]', () => {
        it('should be interrupted immediately', async () => {
          const initializePromise = jobQueueInitializer.initialize();
          jobQueueInitializer.dispose();
          await initializePromise;

          expect(amqpConnection.assertExchange).not.toHaveBeenCalled();
          expect(amqpConnection.assertQueue).not.toHaveBeenCalled();
          expect(amqpConnection.bindQueue).not.toHaveBeenCalled();
        });

        it('should be interrupted after asserting the exchange', async () => {
          amqpConnection.assertExchange.mockImplementation(async () => {
            jobQueueInitializer.dispose();
          });

          await jobQueueInitializer.initialize();

          expect(amqpConnection.assertExchange).toHaveBeenCalledTimes(1);
          expect(amqpConnection.assertQueue).not.toHaveBeenCalled();
          expect(amqpConnection.bindQueue).not.toHaveBeenCalled();
        });

        it('should be interrupted after asserting the exchange', async () => {
          amqpConnection.assertQueue.mockImplementation(async () => {
            jobQueueInitializer.dispose();
          });

          await jobQueueInitializer.initialize();

          expect(amqpConnection.assertExchange).toHaveBeenCalledTimes(1);
          expect(amqpConnection.assertQueue).toHaveBeenCalledTimes(1);
          expect(amqpConnection.bindQueue).not.toHaveBeenCalled();
        });
      });

      describe('[by reset() call]', () => {
        it('should be interrupted immediately', async () => {
          const initializePromise = jobQueueInitializer.initialize();
          jobQueueInitializer.reset();
          await initializePromise;

          expect(amqpConnection.assertExchange).not.toHaveBeenCalled();
          expect(amqpConnection.assertQueue).not.toHaveBeenCalled();
          expect(amqpConnection.bindQueue).not.toHaveBeenCalled();
        });

        it('should be interrupted after asserting the exchange', async () => {
          amqpConnection.assertExchange.mockImplementation(async () => {
            jobQueueInitializer.reset();
          });

          await jobQueueInitializer.initialize();

          expect(amqpConnection.assertExchange).toHaveBeenCalledTimes(1);
          expect(amqpConnection.assertQueue).not.toHaveBeenCalled();
          expect(amqpConnection.bindQueue).not.toHaveBeenCalled();
        });

        it('should be interrupted after asserting the exchange', async () => {
          amqpConnection.assertQueue.mockImplementation(async () => {
            jobQueueInitializer.reset();
          });

          await jobQueueInitializer.initialize();

          expect(amqpConnection.assertExchange).toHaveBeenCalledTimes(1);
          expect(amqpConnection.assertQueue).toHaveBeenCalledTimes(1);
          expect(amqpConnection.bindQueue).not.toHaveBeenCalled();
        });
      });
    });
  });
});
