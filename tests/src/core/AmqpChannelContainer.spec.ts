import type { ConfirmChannel } from 'amqplib';
import { eventEmitterHelper, asyncHelper } from '../../helpers';
import { AmqpChannelContainer } from '../../../src/core/AmqpChannelContainer';
import { AsyncEventEmitter } from '../../helpers/AsyncEventEmitter';

describe('AmqpChannelContainer', () => {
  let container: AmqpChannelContainer;

  beforeEach(() => {
    container = new AmqpChannelContainer();
  });

  describe('set() / get()', () => {
    it('should return currently stored channel', () => {
      expect(container.get()).toBeNull();

      const { channel: channel1 } = createAmqpChannelMock();
      container.set(channel1);
      expect(container.get()).toBe(channel1);

      const { channel: channel2 } = createAmqpChannelMock();
      container.set(channel2);
      expect(container.get()).toBe(channel2);

      container.set(null);
      expect(container.get()).toBeNull();
    });

    it('should detach old channel when setting new one', () => {
      const { channel: channel1, emitter: emitter1 } = createAmqpChannelMock();
      const { channel: channel2, emitter: emitter2 } = createAmqpChannelMock();

      container.set(channel1);
      container.set(channel2);

      expect(emitter1.listenerCount('error')).toBe(1);
      expect(emitter1.listenerCount('close')).toBe(0);
      expect(emitter1.listenerCount('return')).toBe(0);

      expect(emitter2.listenerCount('error')).toBe(2);
      expect(emitter2.listenerCount('close')).toBe(1);
      expect(emitter2.listenerCount('return')).toBe(1);

      expect(container.get()).toBe(channel2);
    });
  });

  describe('getWhenAvailable()', () => {
    it('should return the channel when set', async () => {
      const { channel: channel } = createAmqpChannelMock();

      container.set(channel);

      await expect(
        Promise.all([
          container.getWhenAvailable(),
          container.getWhenAvailable(),
          container.getWhenAvailable(),
        ]),
      ).resolves.toEqual([channel, channel, channel]);
    });

    it('should wait until channel is available', (done) => {
      const { channel } = createAmqpChannelMock();

      Promise.all([
        container.getWhenAvailable(),
        container.getWhenAvailable(),
        container.getWhenAvailable(),
      ]).then((channels) => {
        expect(channels).toEqual([channel, channel, channel]);
        done();
      });

      container.set(channel);
    });

    it('should not resolve when channel is set to null', async () => {
      let isResolved = false;

      container.getWhenAvailable().then(() => (isResolved = true));

      container.set(null);

      await asyncHelper.waitForPromisesToSettle();

      expect(isResolved).toBe(false);
    });
  });

  describe('[event handling]', () => {
    let channel: ConfirmChannel;
    let channelEmitter: AsyncEventEmitter;

    beforeEach(() => {
      ({ channel, emitter: channelEmitter } = createAmqpChannelMock());
      container.set(channel);
    });

    describe('[handle channel\'s "error" event]', () => {
      let errorEventSpy: jest.Mock;

      beforeEach(() => {
        errorEventSpy = jest.fn();
        container.on('error', errorEventSpy);
      });

      it('should redirect current channel\'s "error" event', () => {
        const error = new Error('Fake error');

        channelEmitter.emit('error', error);

        expect(errorEventSpy).toHaveBeenCalledTimes(1);
        expect(errorEventSpy).toHaveBeenCalledWith(error);
      });

      it('should redirect new channel\'s "error" event', () => {
        const { channel: newChannel, emitter: newChannelEmitter } =
          createAmqpChannelMock();

        container.set(newChannel);

        const error = new Error('Fake error');
        newChannelEmitter.emit('error', error);

        expect(errorEventSpy).toHaveBeenCalledTimes(1);
        expect(errorEventSpy).toHaveBeenCalledWith(error);
      });

      it('should not redirect old channel\'s "error" event (deleted)', () => {
        container.set(null);

        const error = new Error('Fake error');
        channelEmitter.emit('error', error);

        expect(errorEventSpy).not.toHaveBeenCalled();
      });

      it('should not redirect old channel\'s "error" event (replaced)', () => {
        const { channel: newChannel } = createAmqpChannelMock();
        container.set(newChannel);

        const error = new Error('Fake error');
        channelEmitter.emit('error', error);

        expect(errorEventSpy).not.toHaveBeenCalled();
      });

      it('should not emit "error" event when unsubscribed', () => {
        container.removeListener('error', errorEventSpy);

        channelEmitter.emit('error', new Error('Fake error'));

        expect(errorEventSpy).not.toHaveBeenCalled();
      });
    });

    describe('[handle channel\'s "close" event]', () => {
      let closeEventSpy: jest.Mock;

      beforeEach(() => {
        closeEventSpy = jest.fn();
        container.on('close', closeEventSpy);
      });

      it('should redirect current channel\'s "close" event', () => {
        channelEmitter.emit('close');

        expect(closeEventSpy).toHaveBeenCalled();
        expect(closeEventSpy).toHaveBeenCalledTimes(1);
      });

      it('should redirect new channel\'s "close" event', () => {
        const { channel: newChannel, emitter: newChannelEmitter } =
          createAmqpChannelMock();
        container.set(newChannel);

        newChannelEmitter.emit('close');

        expect(closeEventSpy).toHaveBeenCalled();
        expect(closeEventSpy).toHaveBeenCalledTimes(1);
      });

      it('should not redirect old channel\'s "close" event (deleted)', () => {
        container.set(null);

        channelEmitter.emit('close');

        expect(closeEventSpy).not.toHaveBeenCalled();
      });

      it('should not redirect old channel\'s "close" event (replaced)', () => {
        const { channel: newChannel } = createAmqpChannelMock();
        container.set(newChannel);

        channelEmitter.emit('close');

        expect(closeEventSpy).not.toHaveBeenCalled();
      });

      it('should not emit "close" event when unsubscribed', () => {
        container.removeListener('close', closeEventSpy);

        channelEmitter.emit('close');

        expect(closeEventSpy).not.toHaveBeenCalled();
      });
    });

    describe('[handle channel\'s "return" event]', () => {
      let returnEventSpy: jest.Mock;

      beforeEach(() => {
        returnEventSpy = jest.fn();
        container.on('return', returnEventSpy);
      });

      it('should redirect current channel\'s "return" event', () => {
        channelEmitter.emit('return', 'fake-correlation-id');

        expect(returnEventSpy).toHaveBeenCalledTimes(1);
        expect(returnEventSpy).toHaveBeenCalledWith('fake-correlation-id');
      });

      it('should redirect new channel\'s "return" event', () => {
        const { channel: newChannel, emitter: newChannelEmitter } =
          createAmqpChannelMock();
        container.set(newChannel);

        newChannelEmitter.emit('return', 'fake-correlation-id');

        expect(returnEventSpy).toHaveBeenCalledTimes(1);
        expect(returnEventSpy).toHaveBeenCalledWith('fake-correlation-id');
      });

      it('should not redirect old channel\'s "return" event (deleted)', () => {
        container.set(null);

        channelEmitter.emit('return', 'fake-correlation-id');

        expect(returnEventSpy).not.toHaveBeenCalled();
      });

      it('should not redirect old channel\'s "return" event (replaced)', () => {
        const { channel: newChannel } = createAmqpChannelMock();
        container.set(newChannel);

        channelEmitter.emit('return', 'fake-correlation-id');

        expect(returnEventSpy).not.toHaveBeenCalled();
      });

      it('should not emit "return" event when unsubscribed', () => {
        container.removeListener('return', returnEventSpy);

        channelEmitter.emit('return', 'fake-correlation-id');

        expect(returnEventSpy).not.toHaveBeenCalled();
      });
    });
  });
});

function createAmqpChannelMock() {
  const channel = {
    on: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  } as unknown as ConfirmChannel;

  const emitter = eventEmitterHelper.install(channel, {
    ignoreUnhandledErrors: true,
  });

  return { channel, emitter };
}
