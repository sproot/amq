import 'jest-extended';
import { ReplyQueueConsumer } from '../../../../../src/rpc/rpc-client/command-sender/ReplyQueueConsumer';
import { IdGenerator } from '../../../../../src/types';

describe('ReplyQueueConsumer', () => {
  const QUEUE = 'fake-queue';
  const DISUSE_EXPIRE_MS = 1640;

  const consumerTag = 'fake-consumer-tag';

  let replyQueueConsumer: ReplyQueueConsumer;
  let amqpConnection: any;
  let idGenerator: jest.Mocked<IdGenerator>;

  beforeEach(() => {
    amqpConnection = {
      assertQueue: jest.fn(async () => {}),
      consumeQueue: jest.fn(async () => consumerTag),
      cancelConsumption: jest.fn(async () => {}),
    };

    idGenerator = {
      generate: jest.fn().mockReturnValueOnce('fake-generated-id'),
    } as unknown as jest.Mocked<IdGenerator>;

    replyQueueConsumer = new ReplyQueueConsumer(
      {
        queue: QUEUE,
        disuseExpireMs: DISUSE_EXPIRE_MS,
      },
      {
        amqpConnection,
        idGenerator,
      },
    );
  });

  describe('constructor()', () => {
    it('should generate reply queue', () => {
      expect(replyQueueConsumer.replyQueue).toBe(
        'fake-queue:replies:fake-generated-id',
      );
    });
  });

  describe('consume()', () => {
    let cancelConsumptionSpy: jest.SpyInstance;

    beforeEach(() => {
      cancelConsumptionSpy = jest
        .spyOn(replyQueueConsumer, 'cancelConsumption')
        .mockResolvedValue();
    });

    it('should assert the queue', async () => {
      await replyQueueConsumer.consume();

      expect(amqpConnection.assertQueue).toHaveBeenCalledExactlyOnceWith({
        queue: replyQueueConsumer.replyQueue,
        durable: false,
        exclusive: false,
        autoDelete: false,
        disuseExpireMs: DISUSE_EXPIRE_MS,
      });

      expect(amqpConnection.assertQueue).toHaveBeenCalledBefore(
        amqpConnection.consumeQueue,
      );
    });

    it('should interrupt when disposed while asserting the queue', async () => {
      amqpConnection.assertQueue.mockImplementation(async () => {
        /** no await */ replyQueueConsumer.dispose();
      });

      await replyQueueConsumer.consume();

      expect(amqpConnection.consumeQueue).not.toHaveBeenCalled();
    });

    it('should consume the queue', async () => {
      await replyQueueConsumer.consume();

      expect(cancelConsumptionSpy).not.toHaveBeenCalled();
      expect(amqpConnection.consumeQueue).toHaveBeenCalledExactlyOnceWith(
        replyQueueConsumer.replyQueue,
        expect.any(Function),
        { requiresAcknowledgement: true },
      );
    });

    it('should cancel consumption when disposed while consuming the queue', async () => {
      amqpConnection.consumeQueue.mockImplementation(async () => {
        /** no await */ replyQueueConsumer.dispose();
        cancelConsumptionSpy.mockClear();
      });

      await replyQueueConsumer.consume();

      expect(cancelConsumptionSpy).toHaveBeenCalledExactlyOnceWith();
    });
  });

  describe('dispose()', () => {
    let cancelConsumptionSpy: jest.SpyInstance;

    beforeEach(() => {
      cancelConsumptionSpy = jest
        .spyOn(replyQueueConsumer, 'cancelConsumption')
        .mockResolvedValue();
    });

    it('should cancel the queue consumption', async () => {
      await replyQueueConsumer.dispose();

      expect(cancelConsumptionSpy).toHaveBeenCalledExactlyOnceWith();
    });
  });

  describe('cancelConsumption()', () => {
    it('should not throw an error when consumerTag is null', async () => {
      await replyQueueConsumer.cancelConsumption();
      expect(amqpConnection.cancelConsumption).not.toHaveBeenCalled();
    });

    it('should call cancelConsumption on amqpConnection when consumerTag is not null', async () => {
      replyQueueConsumer['consumerTag'] = 'testTag';
      await replyQueueConsumer.cancelConsumption();
      expect(amqpConnection.cancelConsumption).toHaveBeenCalledWith('testTag');
      expect(replyQueueConsumer['consumerTag']).toBeNull();
    });

    it('should catch and ignore an error during cancelConsumption call', async () => {
      replyQueueConsumer['consumerTag'] = 'testTag';
      const error = new Error('Test error');
      amqpConnection.cancelConsumption.mockRejectedValue(error);
      await expect(
        replyQueueConsumer.cancelConsumption(),
      ).resolves.not.toThrow();
    });

    it('should not throw an error when consumerTag is null', async () => {
      await replyQueueConsumer.cancelConsumption();
      expect(amqpConnection.cancelConsumption).not.toHaveBeenCalled();
    });

    it('should call cancelConsumption on amqpConnection when consumerTag is not null', async () => {
      replyQueueConsumer['consumerTag'] = 'testTag';
      await replyQueueConsumer.cancelConsumption();
      expect(amqpConnection.cancelConsumption).toHaveBeenCalledWith('testTag');
      expect(replyQueueConsumer['consumerTag']).toBeNull();
    });

    it('should catch and ignore an error during cancelConsumption call', async () => {
      replyQueueConsumer['consumerTag'] = 'testTag';
      const error = new Error('Test error');
      amqpConnection.cancelConsumption.mockRejectedValue(error);
      await expect(
        replyQueueConsumer.cancelConsumption(),
      ).resolves.not.toThrow();
    });

    describe('[consuming]', () => {
      beforeEach(async () => {
        await replyQueueConsumer.consume();
      });

      it('should cancel consumption once', async () => {
        await Promise.all([
          replyQueueConsumer.cancelConsumption(),
          replyQueueConsumer.cancelConsumption(),
        ]);

        expect(
          amqpConnection.cancelConsumption,
        ).toHaveBeenCalledExactlyOnceWith(consumerTag);
      });
    });
  });

  describe('[handle reply queue message]', () => {
    let messageHandler: (message: any) => Promise<void>;

    beforeEach(async () => {
      await replyQueueConsumer.consume();
      messageHandler = amqpConnection.consumeQueue.mock.calls.pop()[1];
    });

    describe('["message" event]', () => {
      const message = { fake: 'message' };
      let messageEventSpy: jest.Mock;

      beforeEach(() => {
        messageEventSpy = jest.fn();
        replyQueueConsumer.on('message', messageEventSpy);
      });

      it('should emit "message" event', async () => {
        await messageHandler(message);

        expect(messageEventSpy).toHaveBeenCalledExactlyOnceWith(message);
      });

      it('should not emit "message" event when unsubscribed', async () => {
        replyQueueConsumer.removeListener('message', messageEventSpy);

        await messageHandler(message);

        expect(messageEventSpy).not.toHaveBeenCalled();
      });

      it('should do nothing when disposed', async () => {
        /** no await */ replyQueueConsumer.dispose();

        await messageHandler(message);

        expect(messageEventSpy).not.toHaveBeenCalled();
      });

      it('should re-consume when message is null', async () => {
        jest.spyOn(replyQueueConsumer, 'consume').mockResolvedValue();

        await messageHandler(null);

        expect(messageEventSpy).not.toHaveBeenCalled();
        expect(replyQueueConsumer.consume).toHaveBeenCalledExactlyOnceWith();
      });
    });
  });
});
