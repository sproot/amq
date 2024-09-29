import 'jest-extended';
import {
  CorrelationIdNotFoundError,
  CommandError,
} from '../../../../../src/rpc/errors';
import { FactoryMock, factoryMockHelper } from '../../../../helpers';
import { CommandManager } from '../../../../../src/rpc/rpc-client/command-sender/CommandManager';
import { Command } from '../../../../../src/rpc/rpc-client/command-sender/Command';
import { CommandContainer } from '../../../../../src/rpc/rpc-server/CommandContainer';
import { ErrorCode } from '../../../../../src/core/errors/types';
import { IdGenerator } from '../../../../../src/types';

describe('CommandManager', () => {
  let command: any;
  let commandManager: CommandManager;
  let commandContainerFactory: FactoryMock<CommandContainer>;
  let commandContainer: jest.Mocked<CommandContainer>;
  let commandFactory: FactoryMock<Command>;
  let idGenerator: jest.Mocked<IdGenerator>;

  beforeEach(() => {
    command = { stub: 'fake-command' };
    commandFactory = factoryMockHelper.create(command);

    commandContainer = {
      set: jest.fn(),
      get: jest.fn(),
      getAll: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    } as unknown as jest.Mocked<CommandContainer>;

    commandContainerFactory = factoryMockHelper.create(commandContainer);

    idGenerator = {
      generate: jest.fn(),
    } as unknown as jest.Mocked<IdGenerator>;

    commandManager = new CommandManager({
      commandFactory,
      commandContainerFactory,
      idGenerator,
    });
  });

  describe('create()', () => {
    const queue = 'fake-queue';
    const commandName = 'fake-command-name';
    const args = ['fake', 'args'];

    it('should create a command and return its correlation id', () => {
      const correlationId = 'fake-correlation-id';
      const command = createCommandMock();

      idGenerator.generate.mockReturnValueOnce(correlationId);
      commandFactory.create.mockReturnValueOnce(command);

      expect(commandManager.create({ queue, commandName, args })).toBe(
        correlationId,
      );

      expect(commandFactory.create).toHaveBeenCalledExactlyOnceWith({
        queue,
        commandName,
        args,
      });

      expect(commandContainer.set).toHaveBeenCalledExactlyOnceWith(
        correlationId,
        command,
      );
    });
  });

  describe('wait()', () => {
    const correlationId = 'fake-correlation-id';
    let command: jest.Mocked<Command>;

    beforeEach(() => {
      command = createCommandMock();
      commandContainer.get.mockReturnValue(command);
    });

    it('should wait for the command (success)', async () => {
      const result = 'fake-result';
      command.wait.mockResolvedValue(result);

      await expect(commandManager.wait(correlationId)).resolves.toBe(result);

      expect(commandContainer.get).toHaveBeenCalledWith(correlationId);
      expect(commandContainer.delete).toHaveBeenCalledExactlyOnceWith(
        correlationId,
      );
    });

    it('should wait for the command (fail)', async () => {
      const error = new Error('Fake error');
      command.wait.mockRejectedValue(error);

      await expect(commandManager.wait(correlationId)).rejects.toThrow(error);
      expect(commandContainer.delete).toHaveBeenCalledExactlyOnceWith(
        correlationId,
      );
    });

    it('should throw error when command does not exist', async () => {
      commandContainer.get.mockReturnValue(null);

      await expect(commandManager.wait(correlationId)).rejects.toThrow(
        new CorrelationIdNotFoundError(correlationId),
      );
    });
  });

  describe('succeed()', () => {
    const correlationId = 'fake-correlation-id';
    const result = 'fake-result';

    it('should succeed the command with the result', () => {
      const command = createCommandMock();
      commandContainer.get.mockReturnValue(command);

      commandManager.succeed(correlationId, result);

      expect(command.succeed).toHaveBeenCalledExactlyOnceWith(result);
    });

    it('should do nothing when command does not exist', () => {
      expect(() => commandManager.succeed(correlationId, result)).not.toThrow();
    });
  });

  describe('failOneWithError()', () => {
    const correlationId = 'fake-correlation-id';
    const error = new Error('Fake error');

    it('should fail the command with the error', () => {
      const command = createCommandMock();
      commandContainer.get.mockReturnValue(command);

      commandManager.failOneWithError(correlationId, error);

      expect(command.fail).toHaveBeenCalledExactlyOnceWith(error);
    });

    it('should do nothing when command does not exist', () => {
      expect(() =>
        commandManager.failOneWithError(correlationId, error),
      ).not.toThrow();
    });
  });

  describe('failOneWithCode()', () => {
    const correlationId = 'fake-correlation-id';
    const code = ErrorCode.InternalError;

    it('should fail the command with the code', () => {
      const queue = 'fake-queue';
      const commandName = 'fake-command-name';
      const args = ['fake', 'args'];

      const command = createCommandMock({ queue, commandName, args });
      commandContainer.get.mockReturnValue(command);

      commandManager.failOneWithCode(correlationId, code);

      expect(command.fail).toHaveBeenCalledExactlyOnceWith(
        new CommandError({ code, queue, commandName, args }),
      );
    });

    it('should do nothing when command does not exist', () => {
      expect(() =>
        commandManager.failOneWithCode(correlationId, code),
      ).not.toThrow();
    });
  });

  describe('failAllWithCode()', () => {
    const code = ErrorCode.InternalError;

    it('should fail all commands with the code', () => {
      const command1 = createCommandMock({
        queue: 'queue-1',
        commandName: 'command-1',
        args: ['args', 1],
      });
      const command2 = createCommandMock({
        queue: 'queue-2',
        commandName: 'command-2',
        args: ['args', 2],
      });
      const command3 = createCommandMock({
        queue: 'queue-3',
        commandName: 'command-3',
        args: ['args', 3],
      });

      commandContainer.getAll.mockReturnValue([command1, command2, command3]);

      commandManager.failAllWithCode(code);

      expect(command1.fail).toHaveBeenCalledExactlyOnceWith(
        new CommandError({
          code,
          queue: 'queue-1',
          commandName: 'command-1',
          args: ['args', 1],
        }),
      );
      expect(command2.fail).toHaveBeenCalledExactlyOnceWith(
        new CommandError({
          code,
          queue: 'queue-2',
          commandName: 'command-2',
          args: ['args', 2],
        }),
      );
      expect(command3.fail).toHaveBeenCalledExactlyOnceWith(
        new CommandError({
          code,
          queue: 'queue-3',
          commandName: 'command-3',
          args: ['args', 3],
        }),
      );
    });
  });

  describe('getInfo()', () => {
    const correlationId = 'fake-correlation-id';

    it('should return info of a command when present', () => {
      const queue = 'fake-queue';
      const commandName = 'fake-command-name';
      const args = [123, true, { hello: 'world' }];

      commandContainer.get.mockReturnValue({
        queue,
        commandName,
        args,
        some: 'other stuff',
      });

      expect(commandManager.getInfo(correlationId)).toEqual({
        queue,
        commandName,
        args,
      });
    });

    it('should return null when command is not present', () => {
      commandContainer.get.mockReturnValue(null);

      expect(commandManager.getInfo(correlationId)).toBeNull();
    });
  });
});

function createCommandMock({
  queue,
  commandName,
  args,
}: { queue?: string; commandName?: string; args?: any } = {}) {
  return {
    succeed: jest.fn(),
    fail: jest.fn(),
    wait: jest.fn(async () => null),
    queue: queue || 'fake-command-queue',
    commandName: commandName || 'fake-command-name',
    args: args || ['fake', 'command', 'args'],
  } as unknown as jest.Mocked<Command>;
}
