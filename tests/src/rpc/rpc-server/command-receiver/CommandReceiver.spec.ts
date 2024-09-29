import 'jest-extended';
import { AmqpConnection } from '../../../../../src/core';
import { CommandQueueConsumer } from '../../../../../src/rpc/rpc-server/command-receiver/CommandQueueConsumer';
import { CommandQueueInitializer } from '../../../../../src/rpc/rpc-server/command-receiver/CommandQueueInitializer';
import { CommandReceiver } from '../../../../../src/rpc/rpc-server/command-receiver/CommandReceiver';
import {
  eventEmitterHelper,
  factoryMockHelper,
  FactoryMock,
} from '../../../../helpers';
import { AsyncEventEmitter } from '../../../../helpers/AsyncEventEmitter';

describe('CommandReceiver', () => {
  const EXCHANGE = 'fake-exchange';
  const QUEUE = 'fake-queue';

  let commandReceiver: CommandReceiver;
  let amqpConnection: jest.Mocked<AmqpConnection>;
  let amqpConnectionEmitter: AsyncEventEmitter;
  let commandQueueConsumerFactory: FactoryMock<CommandQueueConsumer>;
  let commandQueueConsumer: jest.Mocked<CommandQueueConsumer>;
  let commandQueueConsumerEmitter: AsyncEventEmitter;
  let commandQueueInitializerFactory: FactoryMock<CommandQueueInitializer>;
  let commandQueueInitializer: jest.Mocked<CommandQueueInitializer>;

  beforeEach(() => {
    amqpConnection = {
      on: jest.fn(),
      removeListener: jest.fn(),
    } as unknown as jest.Mocked<AmqpConnection>;

    amqpConnectionEmitter = eventEmitterHelper.install(amqpConnection);

    commandQueueConsumer = {
      on: jest.fn(),
      removeListener: jest.fn(),
      consume: jest.fn(async () => {}),
      dispose: jest.fn(async () => {}),
    } as unknown as jest.Mocked<CommandQueueConsumer>;

    commandQueueConsumerEmitter =
      eventEmitterHelper.install(commandQueueConsumer);
    commandQueueConsumerFactory =
      factoryMockHelper.create(commandQueueConsumer);

    commandQueueInitializer = {
      initialize: jest.fn(async () => {}),
      dispose: jest.fn(async () => {}),
      setIsExclusive: jest.fn(),
      isExclusive: false,
    } as unknown as jest.Mocked<CommandQueueInitializer>;

    commandQueueInitializerFactory = factoryMockHelper.create(
      commandQueueInitializer,
    );

    commandReceiver = new CommandReceiver(
      {
        exchange: EXCHANGE,
        queue: QUEUE,
      },
      {
        amqpConnection,
        commandQueueConsumerFactory,
        commandQueueInitializerFactory,
      },
    );
  });

  describe('constructor()', () => {
    it('should create CommandQueueInitializer', () => {
      expect(
        commandQueueInitializerFactory.create,
      ).toHaveBeenCalledExactlyOnceWith(
        {
          exchange: EXCHANGE,
          queue: QUEUE,
        },
        {
          amqpConnection,
        },
      );
    });

    it('should create CommandQueueConsumer', () => {
      expect(
        commandQueueConsumerFactory.create,
      ).toHaveBeenCalledExactlyOnceWith(
        {
          queue: QUEUE,
        },
        {
          amqpConnection,
        },
      );
    });
  });

  it('should have "isExclusive" getter', () => {
    commandQueueInitializer.isExclusive = false;
    expect(commandReceiver.isExclusive).toBeFalse();

    commandQueueInitializer.isExclusive = true;
    expect(commandReceiver.isExclusive).toBeTrue();
  });

  it('should have "setIsExclusive" setter', () => {
    expect(commandReceiver.setIsExclusive(true)).toBe(commandReceiver);
    expect(
      commandQueueInitializer.setIsExclusive,
    ).toHaveBeenCalledExactlyOnceWith(true);

    expect(commandReceiver.setIsExclusive(false)).toBe(commandReceiver);
    expect(commandQueueInitializer.setIsExclusive).toHaveBeenCalledTimes(2);
    expect(commandQueueInitializer.setIsExclusive).toHaveBeenCalledWith(false);
  });

  describe('listen()', () => {
    it('should initialize the queue', async () => {
      await commandReceiver.listen();

      expect(commandQueueInitializer.initialize).toHaveBeenCalledTimes(1);
    });

    it('should consume the queue', async () => {
      await commandReceiver.listen();

      expect(commandQueueConsumer.consume).toHaveBeenCalledTimes(1);
    });

    it('should initialize and then consume', async () => {
      await commandReceiver.listen();

      expect(commandQueueInitializer.initialize).toHaveBeenCalledBefore(
        commandQueueConsumer.consume,
      );
    });

    describe('[interruption]', () => {
      it('should interrupt queue consumption when disposed', async () => {
        commandQueueInitializer.initialize.mockImplementation(async () => {
          /** no await */ commandReceiver.dispose();
        });

        await commandReceiver.listen();

        expect(commandQueueConsumer.consume).not.toHaveBeenCalled();
      });
    });
  });

  describe('dispose()', () => {
    it('should dispose the queue initializer immediately', () => {
      /** no await */ commandReceiver.dispose();

      expect(commandQueueInitializer.dispose).toHaveBeenCalledTimes(1);
    });

    it('should dispose the queue consumer immediately', () => {
      /** no await */ commandReceiver.dispose();

      expect(commandQueueConsumer.dispose).toHaveBeenCalledTimes(1);
    });
  });

  // --- events

  describe('[handle amqpConnection\'s "reconnected" event]', () => {
    executeWhenListening(() => {
      beforeEach(() => {
        commandQueueInitializer.initialize.mockClear();
        commandQueueConsumer.consume.mockClear();
      });

      it('should re-initialize the queue', async () => {
        await amqpConnectionEmitter.emitAsync('reconnected');

        expect(commandQueueInitializer.initialize).toHaveBeenCalledTimes(1);
      });

      it('should re-consume the queue', async () => {
        await amqpConnectionEmitter.emitAsync('reconnected');

        expect(commandQueueConsumer.consume).toHaveBeenCalledTimes(1);
      });

      it('should re-initialize and then re-consume', async () => {
        await amqpConnectionEmitter.emitAsync('reconnected');

        expect(commandQueueInitializer.initialize).toHaveBeenCalledBefore(
          commandQueueConsumer.consume,
        );
      });

      describe('[interruption]', () => {
        it('should interrupt the queue consumption when disposed', async () => {
          commandQueueInitializer.initialize.mockImplementation(async () => {
            /** no await */ commandReceiver.dispose();
          });

          await amqpConnectionEmitter.emitAsync('reconnected');

          expect(commandQueueConsumer.consume).not.toHaveBeenCalled();
        });
      });
    });

    executeWhenNotListening(() => {
      beforeEach(() => {
        commandQueueInitializer.initialize.mockClear();
        commandQueueConsumer.consume.mockClear();
      });

      it('should do nothing', async () => {
        await amqpConnectionEmitter.emitAsync('reconnected');

        expect(commandQueueInitializer.initialize).not.toHaveBeenCalled();
        expect(commandQueueConsumer.consume).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle amqpConnection\'s "channelRecreated" event]', () => {
    executeWhenListening(() => {
      beforeEach(() => {
        commandQueueInitializer.initialize.mockClear();
        commandQueueConsumer.consume.mockClear();
      });

      it('should re-initialize the queue', async () => {
        await amqpConnectionEmitter.emitAsync('channelRecreated');

        expect(commandQueueInitializer.initialize).toHaveBeenCalledTimes(1);
      });

      it('should re-consume the queue', async () => {
        await amqpConnectionEmitter.emitAsync('channelRecreated');

        expect(commandQueueConsumer.consume).toHaveBeenCalledTimes(1);
      });

      it('should re-initialize and then re-consume', async () => {
        await amqpConnectionEmitter.emitAsync('channelRecreated');

        expect(commandQueueInitializer.initialize).toHaveBeenCalledBefore(
          commandQueueConsumer.consume,
        );
      });

      describe('[interruption]', () => {
        it('should interrupt the queue consumption when disposed', async () => {
          commandQueueInitializer.initialize.mockImplementation(async () => {
            /** no await */ commandReceiver.dispose();
          });

          await amqpConnectionEmitter.emitAsync('channelRecreated');

          expect(commandQueueConsumer.consume).not.toHaveBeenCalled();
        });
      });
    });

    executeWhenNotListening(() => {
      beforeEach(() => {
        commandQueueInitializer.initialize.mockClear();
        commandQueueConsumer.consume.mockClear();
      });

      it('should do nothing', async () => {
        await amqpConnectionEmitter.emitAsync('channelRecreated');

        expect(commandQueueInitializer.initialize).not.toHaveBeenCalled();
        expect(commandQueueConsumer.consume).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle queueConsumer\'s "message" event]', () => {
    executeWhenListening(() => {
      let messageEventSpy: jest.Mock;

      beforeEach(() => {
        messageEventSpy = jest.fn();
        commandReceiver.on('message', messageEventSpy);
      });

      it('should emit "message" event', async () => {
        const message = { fake: 'message' };
        await commandQueueConsumerEmitter.emitAsync('message', message);

        expect(messageEventSpy).toHaveBeenCalledExactlyOnceWith(message);
      });

      it('should not emit "message" event when unsubscribed', async () => {
        commandReceiver.removeListener('message', messageEventSpy);

        await commandQueueConsumerEmitter.emitAsync('message', {
          fake: 'message',
        });

        expect(messageEventSpy).not.toHaveBeenCalled();
      });
    });

    executeWhenNotListening(() => {
      it('should not emit "message" event', async () => {
        const messageEventSpy = jest.fn();
        commandReceiver.on('message', messageEventSpy);

        await commandQueueConsumerEmitter.emitAsync('message', {
          fake: 'message',
        });

        expect(messageEventSpy).not.toHaveBeenCalled();
      });
    });
  });

  // --- helpers

  function executeWhenListening(tests: () => void) {
    describe('[listening]', () => {
      beforeEach(async () => {
        await commandReceiver.listen();
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
        await commandReceiver.listen();
        await commandReceiver.dispose();
      });

      tests();
    });
  }
});
