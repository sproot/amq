import 'jest-extended';
import {
  factoryMockHelper,
  eventEmitterHelper,
  FactoryMock,
} from '../../../helpers';
import { RpcClient } from '../../../../src/rpc/rpc-client/RpcClient';
import { CommandSenderManager } from '../../../../src/rpc/rpc-client/command-sender/CommandSenderManager';
import { CommandSender } from '../../../../src/rpc/rpc-client/command-sender/CommandSender';
import { AsyncEventEmitter } from '../../../helpers/AsyncEventEmitter';
import { ProblemReporter } from '../../../../src/rpc/rpc-client/ProblemReporter';

describe('RpcClient', () => {
  const COMMAND_TIMEOUT_MS = 1460;
  const REPLY_QUEUE_DISUSE_EXPIRE_MS = 6410;
  const STALE_COMMAND_DURATION_MS = 2330;

  let rpcClient: RpcClient;
  let commandFactory: any;
  let commandContainerFactory: any;
  let commandSenderManagerFactory: FactoryMock<CommandSenderManager>;
  let commandSenderManager: any;
  let commandSenderFactory: FactoryMock<CommandSender>;
  let commandSender: any;
  let commandManagerFactory: any;
  let problemReporter: any;
  let problemReporterEmitter: AsyncEventEmitter;
  let problemReporterFactory: FactoryMock<ProblemReporter>;
  let replyQueueConsumerFactory: any;
  let amqpConnection: any;
  let jsonBufferSerializer: any;
  let errorSerializer: any;
  let idGenerator: any;

  beforeEach(() => {
    commandSenderManager = {
      set: jest.fn(),
      get: jest.fn(),
      disposeAll: jest.fn(async () => {}),
    };

    commandSenderManagerFactory =
      factoryMockHelper.create(commandSenderManager);

    commandSender = { stub: 'fake-command' };
    commandSenderFactory = factoryMockHelper.create(commandSender);

    commandFactory = { dummy: 'commandFactory' };
    commandContainerFactory = { dummy: 'commandContainerFactory' };
    commandManagerFactory = { dummy: 'commandManagerFactory' };
    replyQueueConsumerFactory = { dummy: 'replyQueueConsumerFactory' };

    problemReporter = {
      on: jest.fn(),
      removeListener: jest.fn(),
    };

    problemReporterEmitter = eventEmitterHelper.install(problemReporter);
    problemReporterFactory = factoryMockHelper.create(problemReporter);

    amqpConnection = {
      sendToQueue: jest.fn(async () => {}),
      acknowledge: jest.fn(async () => {}),
    };

    jsonBufferSerializer = {
      serialize: jest.fn((content) => ({
        serialized: content,
      })),
      deserialize: jest.fn(() => null),
    };

    errorSerializer = { dummy: 'errorSerializer' };
    idGenerator = { dummy: 'idGenerator' };

    rpcClient = new RpcClient(
      {
        commandTimeoutMs: COMMAND_TIMEOUT_MS,
        replyQueueDisuseExpireMs: REPLY_QUEUE_DISUSE_EXPIRE_MS,
        staleCommandDurationMs: STALE_COMMAND_DURATION_MS,
      },
      {
        commandSenderManagerFactory,
        commandContainerFactory,
        commandFactory,
        commandSenderFactory,
        commandManagerFactory,
        problemReporterFactory,
        replyQueueConsumerFactory,
        amqpConnection,
        jsonBufferSerializer,
        errorSerializer,
        idGenerator,
      },
    );
  });

  describe('constructor()', () => {
    it('should validate necessary options and dependencies', () => {
      for (const commandTimeoutMs of ['1234', null, undefined, -99, -1, 0]) {
        expect(
          () =>
            new RpcClient(
              {
                // @ts-ignore: ignore invalid type
                commandTimeoutMs,
              },
              {},
            ),
        ).toThrowError('"options.commandTimeoutMs" must be a positive number');
      }

      for (const replyQueueDisuseExpireMs of [
        '1234',
        null,
        undefined,
        -99,
        -1,
        0,
      ]) {
        expect(
          () =>
            new RpcClient(
              {
                commandTimeoutMs: COMMAND_TIMEOUT_MS,
                // @ts-ignore: ignore invalid type
                replyQueueDisuseExpireMs,
              },
              {},
            ),
        ).toThrowError(
          '"options.replyQueueDisuseExpireMs" must be a positive number',
        );
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
            new RpcClient(
              {
                commandTimeoutMs: 1,
                replyQueueDisuseExpireMs: 1,
                // @ts-ignore: ignore invalid type
                staleCommandDurationMs,
              },
              {},
            ),
        ).toThrowError(
          '"options.staleCommandDurationMs" must be a positive number',
        );
      }

      expect(
        () =>
          new RpcClient(
            {
              commandTimeoutMs: 1,
              replyQueueDisuseExpireMs: 1,
              staleCommandDurationMs: 1,
            },
            // @ts-ignore: ignore dependencies
            {},
          ),
      ).toThrowError('"dependencies.amqpConnection" is required');
    });
  });

  describe('dispose()', () => {
    it('should immediately dispose all command senders', () => {
      /** await */ rpcClient.dispose();

      expect(commandSenderManager.disposeAll).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when already disposed', async () => {
      await Promise.all([rpcClient.dispose(), rpcClient.dispose()]);

      expect(commandSenderManager.disposeAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeRemoteCommand()', () => {
    const queue = 'fake-queue';
    const commandName = 'fake-command-name';
    const args = ['fake', 'args'];

    it('should throw an error when disposed', async () => {
      /** no await */ rpcClient.dispose();

      await expect(
        rpcClient.executeRemoteCommand(queue, commandName, ...args),
      ).rejects.toThrow(
        'Cannot send "fake-command-name" command, because RPC client is disposed',
      );
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

      for (const queue of invalidQueues) {
        await expect(
          // @ts-ignore: ignore invalid queue type
          rpcClient.executeRemoteCommand(queue, commandName, ...args),
        ).rejects.toThrow(
          `"queue" must be a non-empty string (provided: "${String(queue)}")`,
        );
      }
    });

    it('should validate "commandName"', async () => {
      const invalidCommandName = [
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

      for (const commandName of invalidCommandName) {
        await expect(
          // @ts-ignore: ignore invalid commandName type
          rpcClient.executeRemoteCommand('fake-queue', commandName, ...args),
        ).rejects.toThrow(
          `"commandName" must be a non-empty string (provided: "${String(
            commandName,
          )}")`,
        );
      }
    });

    it('should create command sender for the queue ', async () => {
      const commandSender = createCommandSenderMock();
      commandSenderFactory.create.mockReturnValue(commandSender);

      await rpcClient.executeRemoteCommand(queue, commandName, ...args);

      expect(commandSenderFactory.create).toHaveBeenCalledExactlyOnceWith(
        {
          queue: 'fake-queue',
          timeoutMs: COMMAND_TIMEOUT_MS,
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

      expect(commandSenderManager.set).toHaveBeenCalledExactlyOnceWith(
        'fake-queue',
        commandSender,
      );
    });

    it('should not create new command sender for the queue when already exists', async () => {
      const commandSender = createCommandSenderMock();
      commandSenderManager.get.mockReturnValue(commandSender);

      await rpcClient.executeRemoteCommand(queue, commandName, ...args);

      expect(commandSenderFactory.create).not.toHaveBeenCalled();
      expect(commandSenderManager.set).not.toHaveBeenCalled();
    });

    it('should execute specified command with provided arguments and return the result', async () => {
      const result = { fake: 'command result' };

      const commandSender = createCommandSenderMock();
      commandSender.sendCommand.mockResolvedValue(result);
      commandSenderManager.get.mockReturnValue(commandSender);

      await expect(
        rpcClient.executeRemoteCommand(queue, commandName, ...args),
      ).resolves.toBe(result);

      expect(commandSender.sendCommand).toHaveBeenCalledExactlyOnceWith(
        commandName,
        ...args,
      );
    });
  });

  describe('[ProblemReporter\'s "staleCommand" event]', () => {
    let staleCommandEventSpy: jest.Mock;

    const args = [123, true, 'hello world', { hey: 'there' }];

    beforeEach(() => {
      staleCommandEventSpy = jest.fn();
      rpcClient.on('staleCommand', staleCommandEventSpy);
    });

    it('should emit "staleCommand" event', () => {
      problemReporterEmitter.emit('staleCommand', ...args);

      expect(staleCommandEventSpy).toHaveBeenCalledExactlyOnceWith(...args);
    });

    it('should not emit "staleCommand" event when unsubscribed', () => {
      rpcClient.removeListener('staleCommand', staleCommandEventSpy);

      problemReporterEmitter.emit('staleCommand', ...args);

      expect(staleCommandEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('[ProblemReporter\'s "acknowledgeError" event]', () => {
    let acknowledgeErrorEventSpy: jest.Mock;

    const args = [123, true, 'hello world', { hey: 'there' }];

    beforeEach(() => {
      acknowledgeErrorEventSpy = jest.fn();
      rpcClient.on('acknowledgeError', acknowledgeErrorEventSpy);
    });

    it('should emit "acknowledgeError" event', () => {
      problemReporterEmitter.emit('acknowledgeError', ...args);

      expect(acknowledgeErrorEventSpy).toHaveBeenCalledExactlyOnceWith(...args);
    });

    it('should not emit "acknowledgeError" event when unsubscribed', () => {
      rpcClient.removeListener('acknowledgeError', acknowledgeErrorEventSpy);

      problemReporterEmitter.emit('acknowledgeError', ...args);

      expect(acknowledgeErrorEventSpy).not.toHaveBeenCalled();
    });
  });
});

function createCommandSenderMock() {
  const commandSender = {
    sendCommand: jest.fn(async () => null),
  } as unknown as jest.Mocked<CommandSender>;

  return commandSender;
}
