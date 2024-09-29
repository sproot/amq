import { Command } from '../../../../../src/rpc/rpc-client/command-sender/Command';

describe('Command', () => {
  const QUEUE = 'fake-queue';
  const COMMAND_NAME = 'fake-command-name';
  const ARGS = ['fake', 'args'];

  let command: Command;

  beforeEach(() => {
    command = new Command({
      queue: QUEUE,
      commandName: COMMAND_NAME,
      args: ARGS,
    });
  });

  it('should have "queue" getter', () => {
    expect(command.queue).toBe(QUEUE);
  });

  it('should have "commandName" getter', () => {
    expect(command.commandName).toBe(COMMAND_NAME);
  });

  it('should have "args" getter', () => {
    expect(command.args).toBe(ARGS);
  });

  describe('succeed()', () => {
    const result = { fake: 'command result' };

    it('should resolve the command', async () => {
      const promiseBefore = command.wait();
      command.succeed(result);
      const promiseAfter = command.wait();

      await expect(promiseBefore).resolves.toBe(result);
      await expect(promiseAfter).resolves.toBe(result);
    });

    it('should not resolve when already resolved', async () => {
      command.succeed(result);
      command.succeed({ fake: 'new result' });

      await expect(command.wait()).resolves.toBe(result);
    });

    it('should not resolve when already rejected', async () => {
      const error = new Error('Fake command error');
      command.fail(error);

      command.succeed(result);

      await expect(command.wait()).rejects.toBe(error);
    });
  });

  describe('fail()', () => {
    const error = new Error('Fake command error');

    it('should reject the command', async () => {
      const promiseBefore = command.wait();
      command.fail(error);
      const promiseAfter = command.wait();

      await expect(promiseBefore).rejects.toThrow(error);
      await expect(promiseAfter).rejects.toThrow(error);
    });

    it('should not reject when already rejected', async () => {
      command.fail(error);
      command.fail(new Error('New command error'));

      await expect(command.wait()).rejects.toThrow(error);
    });

    it('should not reject when already resolved', async () => {
      const result = { fake: 'command result' };

      command.succeed(result);
      command.fail(error);

      await expect(command.wait()).resolves.toBe(result);
    });
  });
});
