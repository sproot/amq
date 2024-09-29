import 'jest-extended';
import { factoryMockHelper, eventEmitterHelper } from '../../../helpers';

import { RpcServer } from '../../../../src/rpc/rpc-server/RpcServer';
import { FactoryFor } from '../../../../src/utils/SimpleFactory';
import { AsyncEventEmitter } from '../../../helpers/AsyncEventEmitter';
import { CommandReceiver } from '../../../../src/rpc/rpc-server/command-receiver/CommandReceiver';
import { AmqpConnection, JsonBufferSerializer } from '../../../../src/core';
import { ErrorSerializer } from '../../../../src/rpc/errors/ErrorSerializer';
import { CommandHandlerManager } from '../../../../src/rpc/rpc-server/CommandHandlerManager';
import { MessageRelevancyChecker } from '../../../../src/MessageRelevancyChecker';

describe('RpcServer', () => {
  const EXCHANGE = 'exchange';
  const QUEUE = 'queue';
  const COMMAND_TIMEOUT_MS = 1460;
  const STALE_COMMAND_DURATION_MS = 1060;

  let rpcServer: RpcServer;
  let messageRelevancyChecker: jest.Mocked<MessageRelevancyChecker>;
  let messageRelevancyCheckerFactory: FactoryFor<MessageRelevancyChecker>;

  let commandHandlerManagerFactory: FactoryFor<CommandHandlerManager>;
  let commandHandlerManager: jest.Mocked<CommandHandlerManager>;
  let commandHandlerValidator: any;
  let commandReceiverFactory: FactoryFor<CommandReceiver>;
  let commandReceiver: any;
  let commandReceiverEmitter: AsyncEventEmitter;
  let commandQueueConsumerFactory: any;
  let commandQueueInitializerFactory: any;

  let amqpConnection: jest.Mocked<AmqpConnection>;
  let amqpConnectionEmitter: AsyncEventEmitter;
  let jsonBufferSerializer: jest.Mocked<JsonBufferSerializer>;
  let errorSerializer: jest.Mocked<ErrorSerializer>;

  beforeEach(() => {
    jest.useFakeTimers();

    messageRelevancyChecker = {
      lock: jest.fn(() => false),
      unlock: jest.fn(),
      unlockAll: jest.fn(),
      getDeliveryTag: jest.fn(() => null),
    } as unknown as jest.Mocked<MessageRelevancyChecker>;

    messageRelevancyCheckerFactory = factoryMockHelper.create(
      messageRelevancyChecker,
    );

    commandHandlerManager = {
      set: jest.fn(),
      handle: jest.fn(async () => null),
      deleteAll: jest.fn(),
    } as unknown as jest.Mocked<CommandHandlerManager>;

    commandHandlerManagerFactory = factoryMockHelper.create(
      commandHandlerManager,
    );

    commandHandlerValidator = { dummy: 'commandHandlerValidator' };

    commandReceiver = {
      listen: jest.fn(),
      dispose: jest.fn(),
      setIsExclusive: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
      isExclusive: false,
    };

    commandReceiverEmitter = eventEmitterHelper.install(commandReceiver);
    commandReceiverFactory = factoryMockHelper.create(commandReceiver);

    commandQueueConsumerFactory = { dummy: 'commandQueueConsumerFactory' };
    commandQueueInitializerFactory = {
      dummy: 'commandQueueInitializerFactory',
    };

    amqpConnection = {
      sendToQueue: jest.fn(async () => {}),
      acknowledge: jest.fn(async () => {}),
      on: jest.fn(),
      removeListener: jest.fn(),
    } as unknown as jest.Mocked<AmqpConnection>;

    amqpConnectionEmitter = eventEmitterHelper.install(amqpConnection);

    jsonBufferSerializer = {
      serialize: jest.fn((content) => ({
        serializedContent: content,
      })),
      deserialize: jest.fn(),
    } as unknown as jest.Mocked<JsonBufferSerializer>;

    errorSerializer = {
      serialize: jest.fn((error) => ({
        serializedError: error,
      })),
    } as unknown as jest.Mocked<ErrorSerializer>;

    rpcServer = new RpcServer(
      {
        exchange: EXCHANGE,
        queue: QUEUE,
        commandTimeoutMs: COMMAND_TIMEOUT_MS,
        staleCommandDurationMs: STALE_COMMAND_DURATION_MS,
      },
      {
        messageRelevancyCheckerFactory,
        commandHandlerManagerFactory,
        commandHandlerValidator,
        commandReceiverFactory,
        commandQueueConsumerFactory,
        commandQueueInitializerFactory,
        amqpConnection,
        jsonBufferSerializer,
        errorSerializer,
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should have "isExclusive" getter', () => {
    commandReceiver.isExclusive = false;
    expect(rpcServer.isExclusive).toBeFalse();

    commandReceiver.isExclusive = true;
    expect(rpcServer.isExclusive).toBeTrue();
  });

  it('should have "setIsExclusive" setter', () => {
    expect(rpcServer.setIsExclusive(true)).toBe(rpcServer);
    expect(commandReceiver.setIsExclusive).toHaveBeenCalledExactlyOnceWith(
      true,
    );

    expect(rpcServer.setIsExclusive(false)).toBe(rpcServer);
    expect(commandReceiver.setIsExclusive).toHaveBeenCalledTimes(2);
    expect(commandReceiver.setIsExclusive).toHaveBeenCalledWith(false);
  });

  describe('constructor()', () => {
    it('should validate necessary options and dependencies', () => {
      // @ts-ignore: ignore invalid options
      expect(() => new RpcServer({}, {})).toThrowError(
        '"options.queue" is required',
      );

      expect(
        () =>
          new RpcServer(
            // @ts-ignore: ignore invalid options
            {
              queue: QUEUE,
            },
            // @ts-ignore: ignore dependencies
            {},
          ),
      ).toThrowError('"options.exchange" is required');

      for (const commandTimeoutMs of ['1234', null, undefined, -99, -1, 0]) {
        expect(
          () =>
            new RpcServer(
              {
                queue: QUEUE,
                exchange: EXCHANGE,
                // @ts-ignore; invalid commandTimeoutMs
                commandTimeoutMs,
              },
              // @ts-ignore: ignore dependencies
              {},
            ),
        ).toThrowError('"options.commandTimeoutMs" must be a positive number');
      }

      for (const staleCommandDurationMs of [
        '1234',
        null,
        undefined,
        -99,
        -1,
        0,
      ]) {
        expect(
          () =>
            new RpcServer(
              {
                queue: QUEUE,
                exchange: EXCHANGE,
                commandTimeoutMs: 1,
                // @ts-ignore; invalid staleCommandDurationMs
                staleCommandDurationMs,
              },
              // @ts-ignore: ignore dependencies
              {},
            ),
        ).toThrowError(
          '"options.staleCommandDurationMs" must be a positive number',
        );
      }

      expect(
        () =>
          new RpcServer(
            {
              queue: QUEUE,
              exchange: EXCHANGE,
              commandTimeoutMs: 1,
              staleCommandDurationMs: 1,
            },
            // @ts-ignore: ignore dependencies
            {},
          ),
      ).toThrowError('"dependencies.amqpConnection" is required');
    });

    it('should create CommandHandlerManager', () => {
      expect(commandHandlerManagerFactory.create).toHaveBeenCalledWith({
        commandHandlerValidator,
      });
    });

    it('should create CommandReceiver', () => {
      expect(commandReceiverFactory.create).toHaveBeenCalledWith(
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
  });

  describe('listen()', () => {
    it('should start command receiver', async () => {
      await rpcServer.listen();

      expect(commandReceiver.listen).toHaveBeenCalledTimes(1);
    });

    it('should throw an error when already listening', async () => {
      /** no await */ rpcServer.listen();

      await expect(rpcServer.listen()).rejects.toThrow(
        'RPC node is already listening',
      );
    });

    it('should throw an error when disposed', async () => {
      await rpcServer.listen();
      /** no await */ rpcServer.dispose();

      await expect(rpcServer.listen()).rejects.toThrow(
        'Cannot reuse disposed RPC node',
      );
    });
  });

  describe('dispose()', () => {
    it('should do nothing when not listening', async () => {
      await rpcServer.dispose();

      expect(commandHandlerManager.deleteAll).not.toHaveBeenCalled();
      expect(commandReceiver.dispose).not.toHaveBeenCalled();
    });

    executeWhenListening(() => {
      it('should immediately delete all command handlers', () => {
        /** await */ rpcServer.dispose();

        expect(
          commandHandlerManager.deleteAll,
        ).toHaveBeenCalledExactlyOnceWith();
      });

      it('should immediately dispose command receiver wrapper', () => {
        /** await */ rpcServer.dispose();

        expect(commandReceiver.dispose).toHaveBeenCalledExactlyOnceWith();
      });

      it('should do nothing when already disposed', async () => {
        await Promise.all([rpcServer.dispose(), rpcServer.dispose()]);

        expect(commandHandlerManager.deleteAll).toHaveBeenCalledTimes(1);
        expect(commandReceiver.dispose).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('setCommandHandler()', () => {
    it('should put command handler into the command pool', () => {
      const handler = () => {
        'fake handler';
      };

      rpcServer.setCommandHandler('fake-command', handler);

      expect(commandHandlerManager.set).toHaveBeenCalledWith(
        'fake-command',
        handler,
      );
    });
  });

  // --- events

  describe('[handle CommandReceiver\'s "message" event]', () => {
    const content = Buffer.from('fake-content');
    const correlationId = 'fake-correlation-id';
    const replyQueue = 'fake-reply-queue';
    const deliveryTag = 'fake-delivery-tag';
    const message = { content, correlationId, replyQueue, deliveryTag };

    const commandName = 'fake-command-name';
    const args = ['fake', 'args'];

    const actualDeliveryTag = 1001;

    beforeEach(() => {
      messageRelevancyChecker.lock.mockReturnValue(true);
      messageRelevancyChecker.getDeliveryTag.mockReturnValue(actualDeliveryTag);

      jsonBufferSerializer.deserialize.mockReturnValue({
        command: commandName,
        args,
      });
    });

    executeWhenListening(() => {
      it('should do nothing when message is locked due to relevancy check', async () => {
        messageRelevancyChecker.lock.mockReturnValue(false);

        await commandReceiverEmitter.emitAsync('message', message);

        expect(messageRelevancyChecker.lock).toHaveBeenCalledWith(
          correlationId,
          deliveryTag,
        );
        expect(jsonBufferSerializer.deserialize).not.toHaveBeenCalled();
        expect(commandHandlerManager.handle).not.toHaveBeenCalled();
        expect(amqpConnection.sendToQueue).not.toHaveBeenCalled();
        expect(amqpConnection.acknowledge).not.toHaveBeenCalled();
      });

      it('should execute corresponding command', async () => {
        const result = { fake: 'result' };
        commandHandlerManager.handle.mockResolvedValue(result);

        await commandReceiverEmitter.emitAsync('message', message);

        expect(commandHandlerManager.handle).toHaveBeenCalledExactlyOnceWith(
          commandName,
          ...args,
        );
        expect(amqpConnection.sendToQueue).toHaveBeenCalledExactlyOnceWith(
          replyQueue,
          { serializedContent: { state: 'success', data: result } },
          { correlationId },
        );
      });

      it('should interrupt when disposed while handling the command', async () => {
        commandHandlerManager.handle.mockImplementation(async () => {
          /** no await */ rpcServer.dispose();
        });

        await commandReceiverEmitter.emitAsync('message', message);

        expect(amqpConnection.sendToQueue).not.toHaveBeenCalled();
      });

      it('should serialize command handler errors', async () => {
        const error = new Error('Fake error');
        commandHandlerManager.handle.mockRejectedValue(error);

        await commandReceiverEmitter.emitAsync('message', message);

        expect(amqpConnection.sendToQueue).toHaveBeenCalledExactlyOnceWith(
          replyQueue,
          {
            serializedContent: {
              state: 'error',
              data: { serializedError: error },
            },
          },
          { correlationId },
        );
      });

      it('should interrupt when disposed while sending the reply', async () => {
        amqpConnection.sendToQueue.mockImplementation(async () => {
          /** no await */ rpcServer.dispose();
        });

        await commandReceiverEmitter.emitAsync('message', message);

        expect(amqpConnection.acknowledge).not.toHaveBeenCalled();
      });

      it('should acknowledge the message', async () => {
        await commandReceiverEmitter.emitAsync('message', message);

        expect(amqpConnection.acknowledge).toHaveBeenCalledWith(
          actualDeliveryTag,
        );
      });

      it('should not acknowledge the message when actual delivery tag is not available', async () => {
        messageRelevancyChecker.getDeliveryTag.mockReturnValue(null);

        await commandReceiverEmitter.emitAsync('message', message);

        expect(messageRelevancyChecker.getDeliveryTag).toHaveBeenCalledWith(
          correlationId,
        );
        expect(amqpConnection.acknowledge).not.toHaveBeenCalled();
      });

      describe('["acknowledgeError" event]', () => {
        let acknowledgeErrorEventSpy: jest.Mock;
        let acknowledgeError: Error;

        beforeEach(() => {
          acknowledgeErrorEventSpy = jest.fn();
          rpcServer.on('acknowledgeError', acknowledgeErrorEventSpy);

          acknowledgeError = new Error('Fake acknowledge error');
          amqpConnection.acknowledge.mockRejectedValue(acknowledgeError);
        });

        it('should ignore acknowledge errors and emit "acknowledgeError"', async () => {
          await expect(
            commandReceiverEmitter.emitAsync('message', message),
          ).toResolve();

          expect(acknowledgeErrorEventSpy).toHaveBeenCalledExactlyOnceWith({
            error: acknowledgeError,
            queue: QUEUE,
            commandName,
            args,
          });
        });

        it('should not emit "acknowledgeError" when unsubscribed', async () => {
          rpcServer.removeListener(
            'acknowledgeError',
            acknowledgeErrorEventSpy,
          );

          await expect(
            commandReceiverEmitter.emitAsync('message', message),
          ).toResolve();

          expect(acknowledgeErrorEventSpy).not.toHaveBeenCalled();
        });
      });

      it('should unlock relevancy checker lock', async () => {
        await commandReceiverEmitter.emitAsync('message', message);

        expect(messageRelevancyChecker.unlock).toHaveBeenCalledExactlyOnceWith(
          correlationId,
        );
        expect(amqpConnection.acknowledge).toHaveBeenCalledBefore(
          messageRelevancyChecker.unlock,
        );
      });

      it('should fail on timeout and not send the reply', (done) => {
        commandHandlerManager.handle.mockReturnValue(new Promise(() => {})); // never resolve

        commandReceiverEmitter.emitAsync('message', message).then(() => {
          expect(amqpConnection.sendToQueue).not.toHaveBeenCalled();
          expect(amqpConnection.acknowledge).toHaveBeenCalled();
          done();
        });

        jest.advanceTimersByTime(COMMAND_TIMEOUT_MS);
      });

      describe('["staleCommand" event]', () => {
        let staleCommandEventSpy: jest.Mock;

        beforeEach(() => {
          staleCommandEventSpy = jest.fn();
          rpcServer.on('staleCommand', staleCommandEventSpy);
        });

        it('should emit "staleCommand" event when command executes for too long', async () => {
          commandHandlerManager.handle.mockImplementation(async () => {
            await jest.advanceTimersByTimeAsync(STALE_COMMAND_DURATION_MS);
          });

          await commandReceiverEmitter.emitAsync('message', message);

          expect(staleCommandEventSpy).toHaveBeenCalledExactlyOnceWith({
            durationMs: STALE_COMMAND_DURATION_MS,
            hasTimedOut: false,
            queue: QUEUE,
            commandName,
            args,
          });
        });

        it('should emit "staleCommand" event when command times out', async () => {
          commandHandlerManager.handle.mockImplementation(async () => {
            await jest.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS);
          });

          await commandReceiverEmitter.emitAsync('message', message);

          expect(staleCommandEventSpy).toHaveBeenCalledExactlyOnceWith({
            durationMs: COMMAND_TIMEOUT_MS,
            hasTimedOut: true,
            queue: QUEUE,
            commandName,
            args,
          });
        });

        it('should not emit "staleCommand" event when command executes quickly', async () => {
          commandHandlerManager.handle.mockImplementation(async () => {
            await jest.advanceTimersByTimeAsync(STALE_COMMAND_DURATION_MS - 1);
          });

          await commandReceiverEmitter.emitAsync('message', message);

          expect(staleCommandEventSpy).not.toHaveBeenCalled();
        });

        it('should not emit "staleCommand" event when unsubscribed', async () => {
          rpcServer.removeListener('staleCommand', staleCommandEventSpy);

          commandHandlerManager.handle.mockImplementation(async () => {
            await jest.advanceTimersByTimeAsync(STALE_COMMAND_DURATION_MS);
          });

          await commandReceiverEmitter.emitAsync('message', message);
        });
      });
    });

    executeWhenNotListening(() => {
      it('should do nothing', async () => {
        await commandReceiverEmitter.emitAsync('message', message);

        expect(jsonBufferSerializer.deserialize).not.toHaveBeenCalled();
        expect(commandHandlerManager.handle).not.toHaveBeenCalled();
        expect(amqpConnection.sendToQueue).not.toHaveBeenCalled();
        expect(amqpConnection.acknowledge).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle AmqpConnection\'s "reconnected" event]', () => {
    executeWhenListening(() => {
      it('should reset relevancy for all commands', () => {
        amqpConnectionEmitter.emit('reconnected');

        expect(
          messageRelevancyChecker.unlockAll,
        ).toHaveBeenCalledExactlyOnceWith();
      });
    });

    executeWhenNotListening(() => {
      it('should do nothing', () => {
        amqpConnectionEmitter.emit('reconnected');

        expect(messageRelevancyChecker.unlockAll).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle AmqpConnection\'s "channelRecreated" event]', () => {
    executeWhenListening(() => {
      it('should reset relevancy for all commands', () => {
        amqpConnectionEmitter.emit('channelRecreated');

        expect(
          messageRelevancyChecker.unlockAll,
        ).toHaveBeenCalledExactlyOnceWith();
      });
    });

    executeWhenNotListening(() => {
      it('should do nothing', () => {
        amqpConnectionEmitter.emit('channelRecreated');

        expect(messageRelevancyChecker.unlockAll).not.toHaveBeenCalled();
      });
    });
  });

  // --- helpers

  function executeWhenListening(tests: () => void) {
    describe('[listening]', () => {
      beforeEach(async () => {
        await rpcServer.listen();
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
        await rpcServer.listen();
        await rpcServer.dispose();
      });

      tests();
    });
  }
});
