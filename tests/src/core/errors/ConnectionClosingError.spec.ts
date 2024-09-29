import { ConnectionClosingError } from '../../../../src/core/errors/ConnectionClosingError';

describe('ConnectionClosingError', () => {
  it('should have proper error message', () => {
    expect(new ConnectionClosingError().message).toBe(
      'AMQP connection is closing',
    );
  });
});
