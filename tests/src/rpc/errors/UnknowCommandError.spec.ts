import { AppError, UnknownCommandError } from '../../../../src/rpc/errors';

describe('UnknownCommandError', () => {
  it('should have proper message', () => {
    const error = new UnknownCommandError('fake-command-name');

    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe(
      'Handler for command "fake-command-name" is not registered',
    );
    expect(error.name).toBe('UnknownCommandError');
    expect(error.code).toBe('UNKNOWN_COMMAND');
    expect(error.commandName).toBe('fake-command-name');

    expect(error.toJson()).toEqual({
      name: 'UnknownCommandError',
      code: 'UNKNOWN_COMMAND',
      message: 'Handler for command "fake-command-name" is not registered',
      commandName: 'fake-command-name',
    });
  });
});
