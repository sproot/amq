import 'jest-extended';
import { JobQueueConsumer } from '../../../../src/jobs/job-queue/JobQueueConsumer';

describe('JobQueueConsumer', () => {
  const QUEUE = 'fake-queue';

  let jobQueueConsumer: JobQueueConsumer;
  let amqpConnection: any;

  const consumerTag = 'fake-consumer-tag';

  beforeEach(() => {
    amqpConnection = {
      consumeQueue: jest.fn(async () => consumerTag),
      cancelConsumption: jest.fn(async () => {}),
    };

    jobQueueConsumer = new JobQueueConsumer(
      {
        queue: QUEUE,
      },
      {
        amqpConnection,
      },
    );
  });

  describe('consume()', () => {
    let cancelConsumptionSpy: jest.SpyInstance;

    beforeEach(() => {
      cancelConsumptionSpy = jest
        .spyOn(jobQueueConsumer, 'cancelConsumption')
        .mockResolvedValue(undefined);
    });

    it('should consume the queue', async () => {
      await jobQueueConsumer.consume();

      expect(cancelConsumptionSpy).not.toHaveBeenCalled();
      expect(amqpConnection.consumeQueue).toHaveBeenCalledExactlyOnceWith(
        QUEUE,
        expect.any(Function),
        { requiresAcknowledgement: true },
      );
    });

    it('should cancel consumption when disposed while starting consuming', async () => {
      amqpConnection.consumeQueue.mockImplementation(async () => {
        await jobQueueConsumer.dispose();
        cancelConsumptionSpy.mockClear();
      });

      await jobQueueConsumer.consume();

      expect(cancelConsumptionSpy).toHaveBeenCalledExactlyOnceWith();
    });
  });

  describe('dispose()', () => {
    let cancelConsumptionSpy: jest.SpyInstance;

    beforeEach(() => {
      cancelConsumptionSpy = jest
        .spyOn(jobQueueConsumer, 'cancelConsumption')
        .mockResolvedValue(undefined);
    });

    it('should cancel queue consumption', async () => {
      await jobQueueConsumer.dispose();

      expect(cancelConsumptionSpy).toHaveBeenCalledExactlyOnceWith();
    });
  });

  describe('[handle consumed queue message]', () => {
    let messageHandler: (message: any) => void;

    beforeEach(async () => {
      await jobQueueConsumer.consume();
      messageHandler = amqpConnection.consumeQueue.mock.calls.pop()[1];

      jest.spyOn(jobQueueConsumer, 'consume').mockResolvedValue(undefined);
    });

    let messageEventSpy: jest.Mock;

    const message = { fake: 'message' };

    beforeEach(() => {
      messageEventSpy = jest.fn();
      jobQueueConsumer.on('message', messageEventSpy);
    });

    it('should do nothing when disposed', async () => {
      await jobQueueConsumer.dispose();

      messageHandler(message);

      expect(jobQueueConsumer.consume).not.toHaveBeenCalled();
      expect(messageEventSpy).not.toHaveBeenCalled();
    });

    it('should re-consume when message is null', () => {
      messageHandler(null);

      expect(jobQueueConsumer.consume).toHaveBeenCalledExactlyOnceWith();
      expect(messageEventSpy).not.toHaveBeenCalled();
    });

    it('should emit "message" event', () => {
      messageHandler(message);

      expect(jobQueueConsumer.consume).not.toHaveBeenCalled();
      expect(messageEventSpy).toHaveBeenCalledExactlyOnceWith(message);
    });

    it('should not emit "message" event when unsubscribed', () => {
      jobQueueConsumer.removeListener('message', messageEventSpy);

      messageHandler(message);

      expect(jobQueueConsumer.consume).not.toHaveBeenCalled();
      expect(messageEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('cancelConsumption()', () => {
    it('should do nothing when not consumed', async () => {
      await expect(jobQueueConsumer.cancelConsumption()).toResolve();

      expect(amqpConnection.cancelConsumption).not.toHaveBeenCalled();
    });

    describe('[consumed]', () => {
      beforeEach(async () => {
        await jobQueueConsumer.consume();
      });

      it('should cancel queue consumption once', async () => {
        await Promise.all([
          jobQueueConsumer.cancelConsumption(),
          jobQueueConsumer.cancelConsumption(),
        ]);

        expect(
          amqpConnection.cancelConsumption,
        ).toHaveBeenCalledExactlyOnceWith(consumerTag);
      });

      it('should ignore cancelConsumption() errors', async () => {
        amqpConnection.cancelConsumption.mockImplementation(() => {
          throw new Error('Fake error');
        });

        await expect(jobQueueConsumer.cancelConsumption()).toResolve();
      });
    });
  });
});
