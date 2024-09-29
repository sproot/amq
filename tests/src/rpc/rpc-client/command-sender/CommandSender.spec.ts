import 'jest-extended';
import { CommandError } from '../../../../../src/rpc/errors/CommandError';
import {
  factoryMockHelper,
  eventEmitterHelper,
  FactoryMock,
} from '../../../../helpers';
import { CommandSender } from '../../../../../src/rpc/rpc-client/command-sender/CommandSender';
import { CommandManager } from '../../../../../src/rpc/rpc-client/command-sender/CommandManager';
import { ReplyQueueConsumer } from '../../../../../src/rpc/rpc-client/command-sender/ReplyQueueConsumer';
import { AsyncEventEmitter } from '../../../../helpers/AsyncEventEmitter';
import { ErrorCode } from '../../../../../src/core/errors/types';

describe('CommandSender', () => {
  const QUEUE = 'fake-queue';
  const TIMEOUT_MS = 14600;
  const REPLY_QUEUE_DISUSE_EXPIRE_MS = 64100;
  const STALE_COMMAND_DURATION_MS = 4440;
  const REPLY_QUEUE = 'fake-reply-queue';

  let commandSender: CommandSender;
  let commandFactory: any;
  let commandContainerFactory: any;
  let commandManagerFactory: FactoryMock<CommandManager>;
  let commandManager: any;
  let problemReporter: any;
  let replyQueueConsumerFactory: FactoryMock<ReplyQueueConsumer>;
  let replyQueueConsumer: any;
  let replyQueueConsumerEmitter: AsyncEventEmitter;
  let amqpConnection: any;
  let amqpConnectionEmitter: AsyncEventEmitter;
  let jsonBufferSerializer: any;
  let errorSerializer: any;
  let idGenerator: any;

  beforeEach(() => {
    jest.useFakeTimers();

    commandManager = {
      create: jest.fn(),
      wait: jest.fn(),
      succeed: jest.fn(),
      failOneWithError: jest.fn(),
      failOneWithCode: jest.fn(),
      failAllWithCode: jest.fn(),
      getInfo: jest.fn(),
    };

    commandManagerFactory = factoryMockHelper.create(commandManager);

    commandFactory = { dummy: 'commandFactory' };
    commandContainerFactory = { dummy: 'commandContainerFactory' };

    problemReporter = {
      reportStaleCommand: jest.fn(),
      reportAcknowledgeError: jest.fn(),
    };

    replyQueueConsumer = {
      consume: jest.fn(),
      dispose: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
      replyQueue: REPLY_QUEUE,
    };
    replyQueueConsumerEmitter = eventEmitterHelper.install(replyQueueConsumer);
    replyQueueConsumerFactory = factoryMockHelper.create(replyQueueConsumer);

    amqpConnection = {
      on: jest.fn(),
      removeListener: jest.fn(),
      sendToQueue: jest.fn(async () => {}),
      acknowledge: jest.fn(async () => {}),
    };
    amqpConnectionEmitter = eventEmitterHelper.install(amqpConnection);

    jsonBufferSerializer = {
      serialize: jest.fn((content) => ({
        serialized: content,
      })),
      deserialize: jest.fn((content) => ({
        deserialized: content,
      })),
    };

    errorSerializer = {
      deserialize: jest.fn((error) => ({
        deserializedError: error,
      })),
    };

    idGenerator = { dummy: 'idGenerator' };

    commandSender = new CommandSender(
      {
        queue: QUEUE,
        timeoutMs: TIMEOUT_MS,
        replyQueueDisuseExpireMs: REPLY_QUEUE_DISUSE_EXPIRE_MS,
        staleCommandDurationMs: STALE_COMMAND_DURATION_MS,
      },
      {
        commandManagerFactory,
        commandContainerFactory,
        commandFactory,
        problemReporter,
        replyQueueConsumerFactory,
        amqpConnection,
        jsonBufferSerializer,
        errorSerializer,
        idGenerator,
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor()', () => {
    it('should create CommandManager', () => {
      expect(commandManagerFactory.create).toHaveBeenCalledExactlyOnceWith({
        commandFactory,
        commandContainerFactory,
        idGenerator,
      });
    });

    it('should create ReplyQueueConsumer', () => {
      expect(replyQueueConsumerFactory.create).toHaveBeenCalledExactlyOnceWith(
        {
          queue: QUEUE,
          disuseExpireMs: REPLY_QUEUE_DISUSE_EXPIRE_MS,
        },
        {
          amqpConnection,
          idGenerator,
        },
      );
    });
  });

  describe('sendCommand()', () => {
    const correlationId = 'fake-correlation-id';
    const commandName = 'fake-command-name';
    const args = [
      'fake',
      'args',
      123,
      true,
      false,
      { hello: 'world' },
      [1, 2, 3],
    ];
    const commandInterruptedError = new CommandError({
      code: ErrorCode.CommandInterrupted,
      queue: QUEUE,
      commandName,
      args,
    });

    beforeEach(() => {
      commandManager.create.mockReturnValue(correlationId);
      commandManager.wait.mockResolvedValue(null);

      jest.spyOn(commandSender, 'initialize').mockResolvedValue();
    });

    it('should initialize the sender', async () => {
      await commandSender.sendCommand(commandName, ...args);

      expect(commandSender.initialize).toHaveBeenCalledExactlyOnceWith();
    });

    it('should interrupt when disposed while initializing the sender', async () => {
      jest.spyOn(commandSender, 'initialize').mockImplementation(async () => {
        /** no await */ commandSender.dispose();
      });

      await expect(
        commandSender.sendCommand(commandName, ...args),
      ).rejects.toThrow(commandInterruptedError);
      expect(amqpConnection.sendToQueue).not.toHaveBeenCalled();
    });

    it('should create a command', async () => {
      await commandSender.sendCommand(commandName, ...args);

      expect(commandManager.create).toHaveBeenCalledExactlyOnceWith({
        queue: QUEUE,
        commandName,
        args,
      });
    });

    it('should send serialized command to the queue', async () => {
      await commandSender.sendCommand(commandName, ...args);

      expect(amqpConnection.sendToQueue).toHaveBeenCalledWith(
        QUEUE,
        {
          serialized: { command: commandName, args },
        },
        {
          correlationId: correlationId,
          replyQueue: REPLY_QUEUE,
          mandatory: true,
          expireMs: TIMEOUT_MS,
        },
      );
    });

    it('should interrupt when disposed while sending the command to the queue', async () => {
      amqpConnection.sendToQueue.mockImplementation(() => {
        /** no await */ commandSender.dispose();
      });

      await expect(
        commandSender.sendCommand(commandName, ...args),
      ).rejects.toThrow(commandInterruptedError);
      expect(commandManager.wait).not.toHaveBeenCalled();
    });

    it('should return awaited result for the command', async () => {
      const response = { dummy: 'response' };

      commandManager.wait.mockResolvedValue(response);

      await expect(
        commandSender.sendCommand(commandName, ...args),
      ).resolves.toBe(response);
    });

    it('should fail after the specified timeout', async () => {
      commandManager.wait.mockReturnValue(new Promise(() => {})); // never resolve

      commandSender.sendCommand(commandName, ...args);

      await jest.advanceTimersByTimeAsync(TIMEOUT_MS - 1);

      expect(commandManager.failOneWithCode).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);

      expect(commandManager.failOneWithCode).toHaveBeenCalledWith(
        correlationId,
        'COMMAND_TIMED_OUT',
      );
    });

    it('should not time out fail after when command has been resolved before timing out', async () => {
      let resolve: (value?: unknown) => void;

      commandManager.wait.mockReturnValue(
        new Promise((_resolve) => (resolve = _resolve)),
      );

      commandSender.sendCommand(commandName, ...args);

      await jest.advanceTimersByTimeAsync(TIMEOUT_MS - 1);

      // @ts-ignore
      resolve({ dummy: 'response' });

      await jest.advanceTimersByTimeAsync(1);

      expect(commandManager.failOneWithCode).not.toHaveBeenCalled();
    });

    it('should not time out fail after when command has been rejected before timing out', async () => {
      let reject;
      commandManager.wait.mockReturnValue(
        new Promise((_, _reject) => (reject = _reject)),
      );

      commandSender.sendCommand(commandName, ...args).catch(() => {});

      await jest.advanceTimersByTimeAsync(TIMEOUT_MS - 1);

      // @ts-ignore
      reject(new Error('Fake error'));

      await jest.advanceTimersByTimeAsync(1);

      expect(commandManager.failOneWithCode).not.toHaveBeenCalled();
    });

    it('should not time out fail after when could not send to queue', async () => {
      amqpConnection.sendToQueue.mockRejectedValue(new Error());

      commandSender.sendCommand(commandName, ...args).catch(() => {});

      await jest.advanceTimersByTimeAsync(TIMEOUT_MS);

      expect(commandManager.failOneWithCode).not.toHaveBeenCalled();
    });

    describe('[stale command]', () => {
      it('should report stale command when command executes for too long', async () => {
        commandManager.wait.mockImplementation(async () => {
          await jest.advanceTimersByTimeAsync(STALE_COMMAND_DURATION_MS);
        });

        await commandSender.sendCommand(commandName, ...args);

        expect(
          problemReporter.reportStaleCommand,
        ).toHaveBeenCalledExactlyOnceWith({
          durationMs: STALE_COMMAND_DURATION_MS,
          hasTimedOut: false,
          queue: QUEUE,
          commandName,
          args,
        });
      });

      it('should report stale command when command times out', async () => {
        commandManager.wait.mockImplementation(async () => {
          await jest.advanceTimersByTimeAsync(TIMEOUT_MS);
        });

        await commandSender.sendCommand(commandName, ...args);

        expect(
          problemReporter.reportStaleCommand,
        ).toHaveBeenCalledExactlyOnceWith({
          durationMs: TIMEOUT_MS,
          hasTimedOut: true,
          queue: QUEUE,
          commandName,
          args,
        });
      });

      it('should not report stale command when command executes quickly', async () => {
        commandManager.wait.mockImplementation(async () => {
          await jest.advanceTimersByTimeAsync(STALE_COMMAND_DURATION_MS - 1);
        });

        await commandSender.sendCommand(commandName, ...args);

        expect(problemReporter.reportStaleCommand).not.toHaveBeenCalled();
      });
    });
  });

  describe('private initialize()', () => {
    it('should not initialize when already initialized', async () => {
      await Promise.all([
        commandSender.initialize(),
        commandSender.initialize(),
      ]);

      expect(replyQueueConsumer.consume).toHaveBeenCalledExactlyOnceWith();
    });
  });

  describe('dispose()', () => {
    it('should immediately fail all commands with "cancelled" error', () => {
      /** no await */ commandSender.dispose();

      expect(commandManager.failAllWithCode).toHaveBeenCalledExactlyOnceWith(
        'COMMAND_CANCELLED',
      );
    });

    it('should immediately dispose the reply queue', () => {
      /** no await */ commandSender.dispose();

      expect(replyQueueConsumer.dispose).toHaveBeenCalledExactlyOnceWith();
    });

    it('should not dispose when already disposed', async () => {
      await Promise.all([commandSender.dispose(), commandSender.dispose()]);

      expect(replyQueueConsumer.dispose).toHaveBeenCalledExactlyOnceWith();
    });
  });

  // --- events

  describe('[handle reply queue consumer\'s "message" event]', () => {
    const correlationId = 'fake-correlation-id';
    const deliveryTag = 'fake-delivery-tag';
    const content = Buffer.from('Fake message content');
    const message = {
      content,
      correlationId,
      deliveryTag,
    };

    const commandName = 'fake-command-name';
    const args = [123, 'hello world', true];

    beforeEach(() => {
      commandManager.getInfo.mockReturnValue({
        queue: QUEUE,
        commandName,
        args,
      });
    });

    executeWhenInitialized(() => {
      it('should resolve on "success" reply', async () => {
        const messageContent = Buffer.from('Fake message content');
        const commandData = { fake: 'commandData' };

        jsonBufferSerializer.deserialize.mockReturnValue({
          state: 'success',
          data: commandData,
        });

        await replyQueueConsumerEmitter.emitAsync('message', message);

        expect(jsonBufferSerializer.deserialize).toHaveBeenCalledWith(
          messageContent,
        );
        expect(commandManager.getInfo).toHaveBeenCalledWith(correlationId);
        expect(commandManager.succeed).toHaveBeenCalledWith(
          correlationId,
          commandData,
        );
      });

      it('should fail with serialized error on "error" reply', async () => {
        const serializedError = { fake: 'error' };

        jsonBufferSerializer.deserialize.mockReturnValue({
          state: 'error',
          data: serializedError,
        });

        await replyQueueConsumerEmitter.emitAsync('message', message);

        expect(commandManager.failOneWithError).toHaveBeenCalledWith(
          correlationId,
          { deserializedError: serializedError },
        );
      });

      it('should fail on deserialization error', async () => {
        const error = new Error('Fake error');

        jsonBufferSerializer.deserialize.mockImplementation(() => {
          throw error;
        });

        await replyQueueConsumerEmitter.emitAsync('message', message);

        expect(commandManager.failOneWithError).toHaveBeenCalledExactlyOnceWith(
          correlationId,
          error,
        );
      });

      it('should acknowledge the message', async () => {
        await replyQueueConsumerEmitter.emitAsync('message', message);

        expect(amqpConnection.acknowledge).toHaveBeenCalledExactlyOnceWith(
          deliveryTag,
        );
        expect(problemReporter.reportAcknowledgeError).not.toHaveBeenCalled();
      });

      describe('[acknowledge error]', () => {
        let acknowledgeError: Error;

        beforeEach(() => {
          acknowledgeError = new Error('Fake acknowledge error');
          amqpConnection.acknowledge.mockRejectedValue(acknowledgeError);
        });

        it('should ignore acknowledge errors', async () => {
          await expect(
            replyQueueConsumerEmitter.emitAsync('message', message),
          ).toResolve();
        });

        it('should ignore acknowledge errors and report acknowledge error', async () => {
          await replyQueueConsumerEmitter.emitAsync('message', message);

          expect(
            problemReporter.reportAcknowledgeError,
          ).toHaveBeenCalledExactlyOnceWith({
            error: acknowledgeError,
            queue: QUEUE,
            commandName,
            args,
          });
        });

        it('should report acknowledge error even when command is not found', async () => {
          commandManager.getInfo.mockReturnValue(null);

          await replyQueueConsumerEmitter.emitAsync('message', message);

          expect(commandManager.getInfo).toHaveBeenCalledWith(correlationId);
          expect(
            problemReporter.reportAcknowledgeError,
          ).toHaveBeenCalledExactlyOnceWith({
            error: acknowledgeError,
            queue: undefined,
            commandName: undefined,
            args: undefined,
          });
        });
      });
    });

    executeWhenNotInitialized(() => {
      it('should do nothing', async () => {
        await replyQueueConsumerEmitter.emitAsync('message', message);

        expect(jsonBufferSerializer.deserialize).not.toHaveBeenCalled();
        expect(amqpConnection.acknowledge).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle amqp connection\'s "return" event]', () => {
    const correlationId = 'fake-correlation-id';

    executeWhenInitialized(() => {
      it('should fail command by the correlation ID', () => {
        amqpConnectionEmitter.emit('return', correlationId);

        expect(commandManager.failOneWithCode).toHaveBeenCalledExactlyOnceWith(
          correlationId,
          ErrorCode.CommandDismissed,
        );
      });
    });

    executeWhenNotInitialized(() => {
      it('should do nothing', async () => {
        amqpConnectionEmitter.emit('return', correlationId);

        expect(commandManager.failOneWithCode).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle amqp connection\'s "reconnected" event]', () => {
    executeWhenInitialized(() => {
      beforeEach(() => {
        replyQueueConsumer.consume.mockClear();
      });

      it('should re-consume the reply queue', async () => {
        await amqpConnectionEmitter.emitAsync('reconnected');

        expect(replyQueueConsumer.consume).toHaveBeenCalledExactlyOnceWith();
      });
    });

    executeWhenNotInitialized(() => {
      beforeEach(() => {
        replyQueueConsumer.consume.mockClear();
      });

      it('should do nothing', async () => {
        await amqpConnectionEmitter.emitAsync('reconnected');

        expect(replyQueueConsumer.consume).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle amqp connection\'s "channelRecreated" event]', () => {
    executeWhenInitialized(() => {
      beforeEach(() => {
        replyQueueConsumer.consume.mockClear();
      });

      it('should re-consume the reply queue', async () => {
        await amqpConnectionEmitter.emitAsync('channelRecreated');

        expect(replyQueueConsumer.consume).toHaveBeenCalledExactlyOnceWith();
      });
    });

    executeWhenNotInitialized(() => {
      beforeEach(() => {
        replyQueueConsumer.consume.mockClear();
      });

      it('should do nothing', async () => {
        await amqpConnectionEmitter.emitAsync('channelRecreated');

        expect(replyQueueConsumer.consume).not.toHaveBeenCalled();
      });
    });
  });

  // --- helpers

  function executeWhenInitialized(tests: () => void) {
    describe('[initialized]', () => {
      beforeEach(async () => {
        await commandSender.initialize();
      });

      tests();
    });
  }

  function executeWhenNotInitialized(tests: () => void) {
    describe('[ready]', () => {
      tests();
    });

    describe('[disposed]', () => {
      beforeEach(async () => {
        await commandSender.initialize();
        await commandSender.dispose();
      });

      tests();
    });
  }
});
