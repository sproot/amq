import { JobRetryQueueProvider } from '../../../../src/jobs/job-queue/JobRetryQueueProvider';

describe('JobRetryQueueProvider', () => {
  const exchange = 'fake-exchange';
  const queue = 'fake-queue';
  const disuseExpireMs = 10000;

  let jobRetryQueueProvider: JobRetryQueueProvider;
  let amqpConnection: any;

  beforeEach(() => {
    amqpConnection = {
      assertExchange: jest.fn(async () => {}),
      assertQueue: jest.fn(async () => null),
      bindQueue: jest.fn(async () => {}),
    };

    jobRetryQueueProvider = new JobRetryQueueProvider(
      {
        exchange,
        queue,
        disuseExpireMs,
      },
      { amqpConnection },
    );
  });

  describe('create()', () => {
    const expireMs = 12345;

    it('should assert the queue', async () => {
      await jobRetryQueueProvider.create(expireMs);

      expect(amqpConnection.assertQueue).toHaveBeenCalledTimes(1);
      expect(amqpConnection.assertQueue).toHaveBeenCalledWith({
        queue: `${queue}:retry:${expireMs}`,
        durable: true,
        autoDelete: false,
        exclusive: false,
        disuseExpireMs: disuseExpireMs + expireMs,
        deadLetterExchange: exchange,
        deadLetterRoutingKey: queue,
      });
    });

    it('should return created queue name', async () => {
      const createdQueueName = 'fake-created-queue-name';
      amqpConnection.assertQueue.mockResolvedValueOnce(createdQueueName);

      const result = await jobRetryQueueProvider.create(expireMs);

      expect(result).toBe(createdQueueName);
    });
  });
});
