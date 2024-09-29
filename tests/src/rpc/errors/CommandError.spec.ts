import { ErrorCode } from '../../../../src/core/errors/types';
import { AppError, CommandError } from '../../../../src/rpc/errors';

describe('CommandError', () => {
  it('should have proper message', () => {
    const error = new CommandError({
      queue: 'fake-queue',
      commandName: 'fake-command-name',
      args: ['fake-arg', 123, true],
      code: ErrorCode.InternalError,
    });

    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe(
      'Command "fake-command-name" to "fake-queue" has failed (code: INTERNAL_ERROR)',
    );
    expect(error.name).toBe('CommandError');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.queue).toBe('fake-queue');
    expect(error.commandName).toBe('fake-command-name');
    expect(error.args).toEqual(['fake-arg', 123, true]);

    expect(error.toPlain()).toEqual({
      name: 'CommandError',
      code: 'INTERNAL_ERROR',
      message:
        'Command "fake-command-name" to "fake-queue" has failed (code: INTERNAL_ERROR)',
      queue: 'fake-queue',
      commandName: 'fake-command-name',
      args: ['fake-arg', 123, true],
    });
  });
});
