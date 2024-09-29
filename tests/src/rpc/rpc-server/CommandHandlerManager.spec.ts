import { UnknownCommandError } from '../../../../src/rpc/errors';
import { CommandHandlerManager } from '../../../../src/rpc/rpc-server/CommandHandlerManager';
import type { CommandHandlerValidator } from '../../../../src/rpc/rpc-server/CommandHandlerValidator';

describe('CommandHandlerManager', () => {
  let commandHandlerManager: CommandHandlerManager;
  let commandHandlerValidator: CommandHandlerValidator;

  beforeEach(() => {
    commandHandlerValidator = {
      validate: jest.fn(),
    } as CommandHandlerValidator;

    commandHandlerManager = new CommandHandlerManager({
      commandHandlerValidator,
    });
  });

  describe('set()', () => {
    it('should throw an error when command handler already exists', () => {
      const expectedError = new Error(
        'Command handler already exists: fake-command',
      );

      expect(() =>
        commandHandlerManager.set('fake-command', () => {}),
      ).not.toThrow();

      expect(() => commandHandlerManager.set('fake-command', () => {})).toThrow(
        expectedError,
      );

      commandHandlerManager.deleteAll();

      expect(() =>
        commandHandlerManager.set('fake-command', () => {}),
      ).not.toThrow();

      expect(() => commandHandlerManager.set('fake-command', () => {})).toThrow(
        expectedError,
      );
    });

    it('should validate the handler', () => {
      const handler1 = jest.fn();
      const handler2 = { handle: jest.fn() };

      commandHandlerManager.set('fake-command-1', handler1);
      commandHandlerManager.set('fake-command-2', handler2);

      expect(commandHandlerValidator.validate).toHaveBeenCalledTimes(2);
      expect(commandHandlerValidator.validate).toHaveBeenCalledWith(
        handler1,
        'fake-command-1',
      );
      expect(commandHandlerValidator.validate).toHaveBeenCalledWith(
        handler2,
        'fake-command-2',
      );
    });
  });

  describe('handle()', () => {
    it('throw an error for unknown commands', async () => {
      await expect(
        commandHandlerManager.handle('non-existing-command', 'fake-arg'),
      ).rejects.toThrow(new UnknownCommandError('non-existing-command'));
    });

    it('should execute the handler and return the result (sync function)', async () => {
      const result = { fake: 'result' };

      const handler = jest.fn(() => result);

      commandHandlerManager.set('fake-command', handler);

      await expect(
        commandHandlerManager.handle('fake-command', 123, 'fake arg', true),
      ).resolves.toBe(result);

      expect(handler).toHaveBeenCalledWith(123, 'fake arg', true);
    });

    it('should execute the handler and return the result (async function)', async () => {
      const result = { fake: 'result' };

      const handler = jest.fn(() => result);

      commandHandlerManager.set('fake-command', handler);

      await expect(
        commandHandlerManager.handle('fake-command', 123, 'fake arg', true),
      ).resolves.toBe(result);
    });

    it('should execute the handler and return the result (object with sync handler)', async () => {
      const result = { fake: 'result' };

      const handler = {
        handle: jest.fn(() => result),
      };

      commandHandlerManager.set('fake-command', handler);

      await expect(
        commandHandlerManager.handle('fake-command', 123, 'fake arg', true),
      ).resolves.toBe(result);

      expect(handler.handle).toHaveBeenCalledWith(123, 'fake arg', true);
    });

    it('should execute the handler and return the result (object with async handler)', async () => {
      const result = { fake: 'result' };

      const handler = {
        handle: jest.fn(() => Promise.resolve(result)),
      };

      commandHandlerManager.set('fake-command', handler);

      await expect(
        commandHandlerManager.handle('fake-command', 123, 'fake arg', true),
      ).resolves.toBe(result);
    });
  });

  describe('deleteAll()', () => {
    it('should delete all set command handlers', async () => {
      const handler1 = jest.fn();
      const handler2 = { handle: jest.fn() };

      commandHandlerManager.set('fake-command-1', handler1);
      commandHandlerManager.set('fake-command-2', handler2);

      commandHandlerManager.deleteAll();

      expect(commandHandlerManager.handle('fake-command-1')).rejects.toThrow(
        new UnknownCommandError('fake-command-1'),
      );
      await expect(
        commandHandlerManager.handle('fake-command-2'),
      ).rejects.toThrow(new UnknownCommandError('fake-command-2'));
    });
  });
});
