import { AmqpConnection } from '../../../../../src/core/AmqpConnection';
import { ExchangeType } from '../../../../../src/core/types';
import { CommandQueueInitializer } from '../../../../../src/rpc/rpc-server/command-receiver/CommandQueueInitializer';

describe('CommandQueueInitializer', () => {
  const EXCHANGE = 'fake-exchange';
  const QUEUE = 'fake-queue';

  let commandQueueInitializer: CommandQueueInitializer;
  let amqpConnection: jest.Mocked<AmqpConnection>;

  beforeEach(() => {
    amqpConnection = {
      assertExchange: jest.fn(async () => {}),
      assertQueue: jest.fn(async () => {}),
      bindQueue: jest.fn(async () => {}),
    } as unknown as jest.Mocked<AmqpConnection>;

    commandQueueInitializer = new CommandQueueInitializer(
      {
        exchange: EXCHANGE,
        queue: QUEUE,
      },
      {
        amqpConnection,
      },
    );
  });

  describe('["isExclusive" accessors]', () => {
    it('should work properly when the queue is not initialized yet', () => {
      expect(commandQueueInitializer.isExclusive).toBe(false);

      expect(commandQueueInitializer.setIsExclusive(true)).toBe(
        commandQueueInitializer,
      );
      expect(commandQueueInitializer.isExclusive).toBe(true);

      expect(commandQueueInitializer.setIsExclusive(false)).toBe(
        commandQueueInitializer,
      );
      expect(commandQueueInitializer.isExclusive).toBe(false);
    });

    it('should throw an error when queue is initialized', () => {
      /** no await */ commandQueueInitializer.initialize();

      expect(() => commandQueueInitializer.setIsExclusive(true)).toThrowError(
        "Cannot change initialized queue's exclusivity",
      );
      expect(commandQueueInitializer.isExclusive).toBe(false);

      expect(() => commandQueueInitializer.setIsExclusive(false)).toThrowError(
        "Cannot change initialized queue's exclusivity",
      );
      expect(commandQueueInitializer.isExclusive).toBe(false);
    });
  });

  it('should have "isExclusive" accessors', () => {
    expect(commandQueueInitializer.isExclusive).toBe(false);

    expect(commandQueueInitializer.setIsExclusive(true)).toBe(
      commandQueueInitializer,
    );
    expect(commandQueueInitializer.isExclusive).toBe(true);

    expect(commandQueueInitializer.setIsExclusive(false)).toBe(
      commandQueueInitializer,
    );
    expect(commandQueueInitializer.isExclusive).toBe(false);
  });

  describe('initialize()', () => {
    it('should assert the exchange', async () => {
      await commandQueueInitializer.initialize();

      expect(amqpConnection.assertExchange).toHaveBeenCalledWith({
        exchange: EXCHANGE,
        type: ExchangeType.DIRECT,
        durable: true,
        autoDelete: false,
      });
    });

    it('should assert the queue', async () => {
      await commandQueueInitializer.initialize();

      expect(amqpConnection.assertQueue).toHaveBeenCalledWith({
        queue: QUEUE,
        durable: true,
        autoDelete: false,
        exclusive: false,
      });
    });

    describe('[exclusive]', () => {
      beforeEach(() => {
        commandQueueInitializer.setIsExclusive(true);
      });

      it('should assert the queue', async () => {
        await commandQueueInitializer.initialize();

        expect(amqpConnection.assertQueue).toHaveBeenCalledWith({
          queue: QUEUE,
          durable: false,
          autoDelete: false,
          exclusive: true,
        });
      });
    });

    it('should bind queue to the exchange', async () => {
      await commandQueueInitializer.initialize();

      expect(amqpConnection.bindQueue).toHaveBeenCalledWith({
        exchange: EXCHANGE,
        queue: QUEUE,
      });
    });

    describe('[interruption]', () => {
      describe('[by dispose()]', () => {
        it('should interrupt immediately', async () => {
          const initializePromise = commandQueueInitializer.initialize();

          commandQueueInitializer.dispose();

          await initializePromise;

          expect(amqpConnection.assertExchange).not.toHaveBeenCalled();
          expect(amqpConnection.assertQueue).not.toHaveBeenCalled();
          expect(amqpConnection.bindQueue).not.toHaveBeenCalled();
        });

        it('should interrupt queue assertion', async () => {
          amqpConnection.assertExchange.mockImplementation(async () => {
            /** no await */ commandQueueInitializer.dispose();
          });

          await commandQueueInitializer.initialize();

          expect(amqpConnection.assertQueue).not.toHaveBeenCalled();
          expect(amqpConnection.bindQueue).not.toHaveBeenCalled();
        });

        it('should interrupt queue binding', async () => {
          amqpConnection.assertQueue.mockImplementation(async () => {
            /** no await */ commandQueueInitializer.dispose();
            return '';
          });

          await commandQueueInitializer.initialize();

          expect(amqpConnection.bindQueue).not.toHaveBeenCalled();
        });
      });

      /**
       * Currently running initialize() call should be superseded by the new
       *   initialize() call.
       *
       * It should stop its execution and let new initialize() call do its thing.
       */
      describe('[by superseding initialize() call]', () => {
        it('should interrupt immediately', async () => {
          await Promise.all([
            commandQueueInitializer.initialize(),
            commandQueueInitializer.initialize(),
          ]);

          expect(amqpConnection.assertExchange).toHaveBeenCalledTimes(1);
          expect(amqpConnection.assertQueue).toHaveBeenCalledTimes(1);
          expect(amqpConnection.bindQueue).toHaveBeenCalledTimes(1);
        });

        it('should interrupt queue assertion', async () => {
          let initializePromise: any;
          amqpConnection.assertExchange.mockImplementation(async () => {
            if (!initializePromise) {
              initializePromise = commandQueueInitializer.initialize();
            }
          });

          await commandQueueInitializer.initialize();
          await initializePromise;

          expect(amqpConnection.assertExchange).toHaveBeenCalledTimes(2);
          expect(amqpConnection.assertQueue).toHaveBeenCalledTimes(1);
          expect(amqpConnection.bindQueue).toHaveBeenCalledTimes(1);
        });

        it('should interrupt queue binding', async () => {
          let initializePromise: any;
          amqpConnection.assertQueue.mockImplementation(async () => {
            if (!initializePromise) {
              initializePromise = commandQueueInitializer.initialize();
            }
            return '';
          });

          await commandQueueInitializer.initialize();
          await initializePromise;

          expect(amqpConnection.assertExchange).toHaveBeenCalledTimes(2);
          expect(amqpConnection.assertQueue).toHaveBeenCalledTimes(2);
          expect(amqpConnection.bindQueue).toHaveBeenCalledTimes(1);
        });
      });
    });
  });
});
