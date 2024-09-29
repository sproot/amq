import { ChannelBecameUnavailableError } from '../../../../src/core/errors/ChannelBecameUnavailableError';

describe('ChannelBecameUnavailableError', () => {
  it('should have proper error message', () => {
    expect(new ChannelBecameUnavailableError().message).toBe(
      'AMQP channel became unavailable while executing a command',
    );
  });
});
