import { eventEmitterHelper } from '../../helpers';
import { AmqpChannelProvider } from '../../../src/core/AmqpChannelProvider';
import type { AsyncEventEmitter } from '../../helpers/AsyncEventEmitter';

describe('AmqpChannelProvider', () => {
  let amqpChannelProvider: AmqpChannelProvider;
  let amqpConnection: any;
  let amqpChannel: any;
  let amqpChannelEmitter: AsyncEventEmitter;

  beforeEach(() => {
    amqpChannel = { on: jest.fn() };
    amqpChannelEmitter = eventEmitterHelper.install(amqpChannel);

    amqpConnection = {
      createConfirmChannel: jest.fn(async () => amqpChannel),
    };

    amqpChannelProvider = new AmqpChannelProvider(amqpConnection);
  });

  describe('create()', () => {
    it('should return created channel with ignored unhandled "error" events', async () => {
      const result = await amqpChannelProvider.create();

      expect(result).toBe(amqpChannel);

      expect(() =>
        amqpChannelEmitter.emit('error', new Error('Fake error')),
      ).not.toThrow();
    });
  });
});
