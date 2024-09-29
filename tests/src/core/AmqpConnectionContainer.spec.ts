import { eventEmitterHelper, promiseHelper } from '../../helpers';
import { AmqpConnectionContainer } from '../../../src/core/AmqpConnectionContainer';
import { AmqpConnection } from '../../../src/core/AmqpConnection';
import { AsyncEventEmitter } from '../../helpers/AsyncEventEmitter';

describe('AmqpConnectionContainer', () => {
  let container: AmqpConnectionContainer;

  beforeEach(() => {
    container = new AmqpConnectionContainer();
  });

  describe('get() / set()', () => {
    it('should return current connection', () => {
      const { connection: connection1 } = createAmqpConnectionMock();
      const { connection: connection2 } = createAmqpConnectionMock();

      expect(container.get()).toBeNull();

      container.set(connection1);
      expect(container.get()).toBe(connection1);

      container.set(connection2);
      expect(container.get()).toBe(connection2);

      container.set(null);
      expect(container.get()).toBeNull();
    });
  });

  describe('getWhenAvailable()', () => {
    it('should return the connection when set', async () => {
      const { connection } = createAmqpConnectionMock();

      container.set(connection);

      await expect(
        Promise.all([
          container.getWhenAvailable(),
          container.getWhenAvailable(),
          container.getWhenAvailable(),
        ]),
      ).resolves.toEqual([connection, connection, connection]);
    });

    it('should wait until connection is available', (done) => {
      const { connection } = createAmqpConnectionMock();

      Promise.all([
        container.getWhenAvailable(),
        container.getWhenAvailable(),
        container.getWhenAvailable(),
      ]).then((connections) => {
        expect(connections).toEqual([connection, connection, connection]);
        done();
      });

      container.set(connection);
    });

    it('should not resolve when connection is set to null', async () => {
      const promise = container.getWhenAvailable();

      container.set(null);

      await expect(promiseHelper.isPending(promise)).resolves.toBe(true);
    });
  });

  describe('[handle connection\'s "error" event]', () => {
    let errorEventSpy: jest.Mock;
    let connection: AmqpConnection;
    let connectionEmitter: AsyncEventEmitter;

    beforeEach(() => {
      ({ connection, emitter: connectionEmitter } = createAmqpConnectionMock());
      container.set(connection);

      errorEventSpy = jest.fn();
      container.on('error', errorEventSpy);
    });

    it('should redirect current connection\'s "error" event', () => {
      const error = new Error('Fake error');

      connectionEmitter.emit('error', error);

      expect(errorEventSpy).toHaveBeenCalledTimes(1);
      expect(errorEventSpy).toHaveBeenCalledWith(error);
    });

    it('should redirect new connection\'s "error" event', () => {
      const { connection: newConnection, emitter: newConnectionEmitter } =
        createAmqpConnectionMock();
      container.set(newConnection);

      const error = new Error('Fake error');
      newConnectionEmitter.emit('error', error);

      expect(errorEventSpy).toHaveBeenCalledTimes(1);
      expect(errorEventSpy).toHaveBeenCalledWith(error);
    });

    it('should not redirect old connection\'s "error" event (deleted)', () => {
      container.set(null);

      const error = new Error('Fake error');
      connectionEmitter.emit('error', error);

      expect(errorEventSpy).not.toHaveBeenCalled();
    });

    it('should not redirect old connection\'s "error" event (replaced)', () => {
      const { connection: connection2 } = createAmqpConnectionMock();

      container.set(connection2);

      const error = new Error('Fake error');
      connectionEmitter.emit('error', error);

      expect(errorEventSpy).not.toHaveBeenCalled();
    });

    it('should not emit "error" event when unsubscribed', () => {
      container.removeListener('error', errorEventSpy);

      connectionEmitter.emit('error', new Error('Fake error'));

      expect(errorEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('[handle connection\'s "closed" event]', () => {
    let closedEventSpy: jest.Mock;
    let connection: AmqpConnection;
    let connectionEmitter: AsyncEventEmitter;

    beforeEach(() => {
      ({ connection, emitter: connectionEmitter } = createAmqpConnectionMock());
      container.set(connection);

      closedEventSpy = jest.fn();
      container.on('closed', closedEventSpy);
    });

    it('should redirect current connection\'s "closed" event', () => {
      connectionEmitter.emit('closed');

      expect(closedEventSpy).toHaveBeenCalledTimes(1);
    });

    it('should redirect new connection\'s "closed" event', () => {
      const { connection: newConnection, emitter: newConnectionEmitter } =
        createAmqpConnectionMock();
      container.set(newConnection);

      newConnectionEmitter.emit('closed');

      expect(closedEventSpy).toHaveBeenCalledTimes(1);
    });

    it('should not redirect old connection\'s "closed" event (deleted)', () => {
      container.set(null);

      connectionEmitter.emit('closed');

      expect(closedEventSpy).not.toHaveBeenCalled();
    });

    it('should not redirect old connection\'s "closed" event (replaced)', () => {
      const { connection: newConnection } = createAmqpConnectionMock();
      container.set(newConnection);

      connectionEmitter.emit('closed');

      expect(closedEventSpy).not.toHaveBeenCalled();
    });

    it('should not emit "closed" event when unsubscribed', () => {
      container.removeListener('closed', closedEventSpy);

      connectionEmitter.emit('closed');

      expect(closedEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('[handle connection\'s "return" event]', () => {
    let returnEventSpy: jest.Mock;
    let connection: AmqpConnection;
    let connectionEmitter: AsyncEventEmitter;

    beforeEach(() => {
      ({ connection, emitter: connectionEmitter } = createAmqpConnectionMock());
      container.set(connection);

      returnEventSpy = jest.fn();
      container.on('return', returnEventSpy);
    });

    it('should redirect current connection\'s "return" event', () => {
      connectionEmitter.emit('return', 'fake-correlation-id');

      expect(returnEventSpy).toHaveBeenCalledTimes(1);
      expect(returnEventSpy).toHaveBeenCalledWith('fake-correlation-id');
    });

    it('should redirect new connection\'s "return" event', () => {
      const { connection: newConnection, emitter: newConnectionEmitter } =
        createAmqpConnectionMock();
      container.set(newConnection);

      newConnectionEmitter.emit('return', 'fake-correlation-id');

      expect(returnEventSpy).toHaveBeenCalledTimes(1);
      expect(returnEventSpy).toHaveBeenCalledWith('fake-correlation-id');
    });

    it('should not redirect old connection\'s "return" event (deleted)', () => {
      container.set(null);

      connectionEmitter.emit('return', 'fake-correlation-id');

      expect(returnEventSpy).not.toHaveBeenCalled();
    });

    it('should not redirect old connection\'s "return" event (replaced)', () => {
      const { connection: newConnection } = createAmqpConnectionMock();
      container.set(newConnection);

      connectionEmitter.emit('return', 'fake-correlation-id');

      expect(returnEventSpy).not.toHaveBeenCalled();
    });

    it('should not emit "return" event when unsubscribed', () => {
      container.removeListener('return', returnEventSpy);

      connectionEmitter.emit('return', 'fake-correlation-id');

      expect(returnEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('[handle connection\'s "channelRecreated" event]', () => {
    let channelRecreatedEventSpy: jest.Mock;
    let connection: AmqpConnection;
    let connectionEmitter: AsyncEventEmitter;

    beforeEach(() => {
      ({ connection, emitter: connectionEmitter } = createAmqpConnectionMock());
      container.set(connection);

      channelRecreatedEventSpy = jest.fn();
      container.on('channelRecreated', channelRecreatedEventSpy);
    });

    it('should redirect current connection\'s "channelRecreated" event', () => {
      connectionEmitter.emit('channelRecreated');

      expect(channelRecreatedEventSpy).toHaveBeenCalledTimes(1);
    });

    it('should redirect new connection\'s "channelRecreated" event', () => {
      const { connection: newConnection, emitter: newConnectionEmitter } =
        createAmqpConnectionMock();
      container.set(newConnection);

      newConnectionEmitter.emit('channelRecreated');

      expect(channelRecreatedEventSpy).toHaveBeenCalledTimes(1);
    });

    it('should not redirect old connection\'s "channelRecreated" event (deleted)', () => {
      container.set(null);

      connectionEmitter.emit('channelRecreated');

      expect(channelRecreatedEventSpy).not.toHaveBeenCalled();
    });

    it('should not redirect old connection\'s "channelRecreated" event (replaced)', () => {
      const { connection: newConnection } = createAmqpConnectionMock();
      container.set(newConnection);

      connectionEmitter.emit('channelRecreated');

      expect(channelRecreatedEventSpy).not.toHaveBeenCalled();
    });

    it('should not emit "channelRecreated" event when unsubscribed', () => {
      container.removeListener('channelRecreated', channelRecreatedEventSpy);

      connectionEmitter.emit('channelRecreated');

      expect(channelRecreatedEventSpy).not.toHaveBeenCalled();
    });
  });
});

function createAmqpConnectionMock() {
  const connection = {
    on: jest.fn(),
    removeListener: jest.fn(),
  } as unknown as AmqpConnection;

  const emitter = eventEmitterHelper.install(connection, {
    ignoreUnhandledErrors: true,
  });

  return { connection, emitter };
}
