import { ConnectionBecameUnavailableError } from '../../../../src/core/errors/ConnectionBecameUnavailableError';

describe('ConnectionBecameUnavailableError', () => {
  it('should have proper error message', () => {
    expect(new ConnectionBecameUnavailableError().message).toBe(
      'AMQP connection became unavailable while executing a command',
    );
  });
});
