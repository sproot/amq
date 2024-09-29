import 'jest-extended';
import { CommandQueueConsumer } from '../../../../../src/rpc/rpc-server/command-receiver/CommandQueueConsumer';

describe('CommandQueueConsumer', () => {
  const QUEUE = 'fake-queue';

  let commandQueueConsumer: CommandQueueConsumer;
  let amqpConnection: any;

  beforeEach(() => {
    amqpConnection = {
      consumeQueue: jest.fn(async () => 'fake-consumer-tag'),
      cancelConsumption: jest.fn(async () => {}),
    };

    commandQueueConsumer = new CommandQueueConsumer(
      {
        queue: QUEUE,
      },
      {
        amqpConnection,
      },
    );
  });

  describe('consume()', () => {
    it('should consume the queue', async () => {
      await commandQueueConsumer.consume();

      expect(amqpConnection.consumeQueue).toHaveBeenCalledWith(
        QUEUE,
        expect.any(Function),
        { requiresAcknowledgement: true },
      );
    });

    describe('[interruption]', () => {
      it('should cancel consumption when disposed prematurely', async () => {
        amqpConnection.consumeQueue.mockImplementation(async () => {
          /* no await */ commandQueueConsumer.dispose();
          return 'fake-consumer-tag';
        });

        await commandQueueConsumer.consume();

        expect(amqpConnection.consumeQueue).toHaveBeenCalledBefore(
          amqpConnection.cancelConsumption,
        );
        expect(
          amqpConnection.cancelConsumption,
        ).toHaveBeenCalledExactlyOnceWith('fake-consumer-tag');
      });

      it('should catch consumption cancellation errors', async () => {
        amqpConnection.consumeQueue.mockImplementation(async () => {
          /* no await */ commandQueueConsumer.dispose();
          return 'fake-consumer-tag';
        });

        const error = new Error('Fake error');

        amqpConnection.cancelConsumption.mockImplementation(() =>
          Promise.reject(error),
        );

        await expect(commandQueueConsumer.consume()).toResolve();
      });

      it('should not cancel consumption when disposed', async () => {
        await commandQueueConsumer.consume();

        expect(amqpConnection.cancelConsumption).not.toHaveBeenCalled();
      });
    });
  });

  describe('dispose()', () => {
    it('should do nothing when not consuming', async () => {
      await expect(commandQueueConsumer.dispose()).toResolve();

      expect(amqpConnection.cancelConsumption).not.toHaveBeenCalled();
    });

    it('should do nothing when consumption was already interrupted by disposing', async () => {
      amqpConnection.consumeQueue.mockImplementation(async () => {
        /** no await */ commandQueueConsumer.dispose();
        return 'fake-consumer-tag';
      });

      await commandQueueConsumer.consume();

      amqpConnection.cancelConsumption.mockClear();

      await commandQueueConsumer.dispose();

      expect(amqpConnection.cancelConsumption).not.toHaveBeenCalled();
    });

    describe('[consuming]', () => {
      beforeEach(async () => {
        await commandQueueConsumer.consume();
      });

      it('should cancel queue consumption', async () => {
        await commandQueueConsumer.dispose();

        expect(amqpConnection.cancelConsumption).toHaveBeenCalledWith(
          'fake-consumer-tag',
        );
      });

      it('should cancel queue consumption once', async () => {
        await Promise.all([
          commandQueueConsumer.dispose(),
          commandQueueConsumer.dispose(),
        ]);

        expect(amqpConnection.cancelConsumption).toHaveBeenCalledTimes(1);
      });

      it('should ignore queue consumption cancellation errors', async () => {
        const error = new Error('Fake error');
        amqpConnection.cancelConsumption.mockImplementation(() =>
          Promise.reject(error),
        );

        await expect(commandQueueConsumer.dispose()).toResolve();
      });
    });
  });

  describe('[handle consumed amqp message]', () => {
    let messageHandler: (message: any) => Promise<void>;

    beforeEach(async () => {
      await commandQueueConsumer.consume();
      messageHandler = amqpConnection.consumeQueue.mock.calls.pop()[1];
    });

    describe('["message" event]', () => {
      const message = { fake: 'message' };
      let messageEventSpy: jest.Mock;

      beforeEach(() => {
        messageEventSpy = jest.fn();
        commandQueueConsumer.on('message', messageEventSpy);
      });

      it('should emit "message" event', async () => {
        await messageHandler(message);

        expect(messageEventSpy).toHaveBeenCalledExactlyOnceWith(message);
      });

      it('should not emit "message" event when unsubscribed', async () => {
        commandQueueConsumer.removeListener('message', messageEventSpy);

        await messageHandler(message);

        expect(messageEventSpy).not.toHaveBeenCalled();
      });

      it('should do nothing when disposed', async () => {
        /** no await */ commandQueueConsumer.dispose();

        await messageHandler(message);

        expect(messageEventSpy).not.toHaveBeenCalled();
      });

      it('should re-consume when message is null', async () => {
        jest.spyOn(commandQueueConsumer, 'consume').mockResolvedValue();

        await messageHandler(null);

        expect(messageEventSpy).not.toHaveBeenCalled();
        expect(commandQueueConsumer.consume).toHaveBeenCalledExactlyOnceWith();
      });
    });
  });
});
