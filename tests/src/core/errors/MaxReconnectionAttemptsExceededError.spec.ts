import { MaxReconnectionAttemptsExceededError } from '../../../../src/core/errors/MaxReconnectionAttemptsExceededError';

describe('MaxReconnectionAttemptsExceededError', () => {
  let error: MaxReconnectionAttemptsExceededError;

  beforeEach(() => {
    error = new MaxReconnectionAttemptsExceededError(46);
  });

  it('should have proper message', () => {
    expect(error.message).toBe(
      'Maximum AMQP reconnection attempts has exceeded after 46 attempts',
    );
  });
});
