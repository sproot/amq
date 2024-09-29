import { CommandTimedOutError } from '../../../../src/core/errors/CommandTimedOutError';

describe('CommandTimedOutError', () => {
  let error: CommandTimedOutError;

  beforeEach(() => {
    error = new CommandTimedOutError(1460);
  });

  it('should have proper message', () => {
    expect(error.message).toBe(
      'AMQP command has timed out after being retried for 1460 ms',
    );
  });
});
