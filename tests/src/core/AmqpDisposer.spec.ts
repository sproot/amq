import { AmqpDisposer } from '../../../src/core/AmqpDisposer';
import { eventEmitterHelper, promiseHelper } from '../../helpers';
import type { AsyncEventEmitter } from '../../helpers/AsyncEventEmitter';

describe('AmqpDisposer', () => {
  const DISPOSE_TIMEOUT_MS = 1460;

  let amqpDisposer: AmqpDisposer;

  beforeEach(() => {
    jest.useFakeTimers();

    amqpDisposer = new AmqpDisposer({
      disposeTimeoutMs: DISPOSE_TIMEOUT_MS,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('disposeConnection()', () => {
    let connection: any;
    let connectionEmitter: AsyncEventEmitter;
    let resolveClose: (value?: unknown) => void;

    beforeEach(() => {
      connection = {
        close: jest.fn().mockResolvedValue(undefined),
        once: jest.fn((event, cb) => cb()),
      };
      connectionEmitter = eventEmitterHelper.install(connection);

      connection.close.mockReturnValue(
        new Promise((resolve) => (resolveClose = resolve)),
      );
    });

    it('should wait for connection to close', async () => {
      const promise = amqpDisposer.disposeConnection(connection);

      await jest.advanceTimersByTimeAsync(DISPOSE_TIMEOUT_MS - 1);

      expect(connection.close).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledWith();
      await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

      resolveClose();

      await expect(promise).resolves.toBe(undefined);
    });

    it('should resolve immediately when failed with "Connection closing" or "Connection closed" errors', async () => {
      const errorMessages = [
        'Connection closing',
        'Connection closed',
        'Connection closed (by server)',
        'Connection closed (by client)',
      ];

      for (const errorMessage of errorMessages) {
        connection.close.mockRejectedValue(new Error(errorMessage));

        await expect(amqpDisposer.disposeConnection(connection)).resolves.toBe(
          undefined,
        );
      }
    });

    it('should resolve on "close" event', async () => {
      const promise = amqpDisposer.disposeConnection(connection);

      await jest.advanceTimersByTimeAsync(DISPOSE_TIMEOUT_MS - 1);

      await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

      await connectionEmitter.emitAsync('close');

      await expect(promise).resolves.toBe(undefined);
    });

    it('should should not resolve on other errors but should not reject either', async () => {
      connection.close.mockRejectedValue(new Error('Fake error'));

      const promise = amqpDisposer.disposeConnection(connection);

      await jest.advanceTimersByTimeAsync(DISPOSE_TIMEOUT_MS - 1);

      await expect(promiseHelper.isPending(promise)).resolves.toBe(true);
    });

    it('should resolve when timed out', async () => {
      const promise = amqpDisposer.disposeConnection(connection);

      await jest.advanceTimersByTimeAsync(DISPOSE_TIMEOUT_MS - 1);
      await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

      await jest.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toBe(undefined);
    });
  });

  describe('disposeChannel()', () => {
    let channel: any;
    let channelEmitter: AsyncEventEmitter;
    let resolveClose: (value?: unknown) => void;

    beforeEach(() => {
      channel = {
        close: jest.fn(),
        once: jest.fn(),
      };
      channelEmitter = eventEmitterHelper.install(channel);

      channel.close.mockReturnValue(
        new Promise((resolve) => (resolveClose = resolve)),
      );
    });

    it('should wait for channel to close', async () => {
      const promise = amqpDisposer.disposeChannel(channel);

      await jest.advanceTimersByTimeAsync(DISPOSE_TIMEOUT_MS - 1);

      expect(channel.close).toHaveBeenCalledTimes(1);
      expect(channel.close).toHaveBeenCalledWith();
      await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

      resolveClose();

      await expect(promise).resolves.toBeUndefined();
    });

    it('should resolve immediately when failed with "Channel closing" or "Channel closed [by ...]" errors', async () => {
      const errorMessages = [
        'Channel closing',
        'Channel closed',
        'channel closed by server',
      ];

      for (const errorMessage of errorMessages) {
        channel.close.mockRejectedValue(new Error(errorMessage));

        await expect(
          amqpDisposer.disposeChannel(channel),
        ).resolves.toBeUndefined();
      }
    });

    it('should resolve on "close" event', async () => {
      const promise = amqpDisposer.disposeChannel(channel);

      await jest.advanceTimersByTimeAsync(DISPOSE_TIMEOUT_MS - 1);

      await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

      await channelEmitter.emitAsync('close');

      await expect(promise).resolves.toBeUndefined();
    });

    it('should should not resolve on other errors but should not reject either', async () => {
      channel.close.mockRejectedValue(new Error('Fake error'));

      const promise = amqpDisposer.disposeChannel(channel);

      await jest.advanceTimersByTimeAsync(DISPOSE_TIMEOUT_MS - 1);

      await expect(promiseHelper.isPending(promise)).resolves.toBe(true);
    });

    it('should resolve when timed out', async () => {
      const promise = amqpDisposer.disposeChannel(channel);

      await jest.advanceTimersByTimeAsync(DISPOSE_TIMEOUT_MS - 1);
      await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

      await jest.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  // TODO: make a better test
  describe('flush()', () => {
    let connection: any;
    let connectionEmitter: AsyncEventEmitter;
    let resolveConnectionClose: (value?: unknown) => void;

    let channel: any;
    let channelEmitter: AsyncEventEmitter;
    let resolveChannelClose: (value?: unknown) => void;

    beforeEach(() => {
      const options = { disposeTimeoutMs: 5000 };
      amqpDisposer = new AmqpDisposer(options);

      connection = {
        close: jest.fn().mockResolvedValue(undefined),
        once: jest.fn().mockImplementation((_, cb) => cb()),
      };

      channel = {
        close: jest.fn().mockResolvedValue(undefined),
        once: jest.fn().mockImplementation((_, cb) => cb()),
      };
    });

    it('should wait for all disposals to finish', async () => {
      connectionEmitter = eventEmitterHelper.install(connection);
      channelEmitter = eventEmitterHelper.install(channel);

      connection.close.mockReturnValueOnce(
        new Promise((resolve) => (resolveConnectionClose = resolve)), // resolve manually
      );
      connection.close.mockReturnValueOnce(new Promise(() => {})); // resolve on timeout
      connection.close.mockReturnValueOnce(new Promise(() => {})); // resolve on "close" event
      connection.close.mockReturnValueOnce(
        Promise.reject(new Error('Connection closing')),
      );
      connection.close.mockReturnValueOnce(
        Promise.reject(new Error('Connection closed')),
      );
      connection.close.mockReturnValueOnce(
        Promise.reject(new Error('connection closed (by server)')),
      );
      connection.close.mockReturnValueOnce(
        Promise.reject(new Error('connection closed (by client)')),
      );

      channel.close.mockReturnValueOnce(
        new Promise((resolve) => (resolveChannelClose = resolve)), // resolve manually
      );
      channel.close.mockReturnValueOnce(new Promise(() => {})); // resolve on timeout
      channel.close.mockReturnValueOnce(new Promise(() => {})); // resolve on "close" event
      channel.close.mockReturnValueOnce(
        Promise.reject(new Error('Channel closing')),
      );
      channel.close.mockReturnValueOnce(
        Promise.reject(new Error('Channel closing')),
      );
      channel.close.mockReturnValueOnce(
        Promise.reject(new Error('Channel closing')),
      );

      const disposePromises: Promise<void>[] = [];
      const flushPromises: Promise<void>[] = [];

      disposePromises.push(amqpDisposer.disposeChannel(channel));
      disposePromises.push(amqpDisposer.disposeConnection(connection));

      flushPromises.push(amqpDisposer.flush());

      disposePromises.push(amqpDisposer.disposeChannel(channel));
      disposePromises.push(amqpDisposer.disposeConnection(connection));

      disposePromises.push(amqpDisposer.disposeChannel(channel));
      disposePromises.push(amqpDisposer.disposeConnection(connection));

      flushPromises.push(amqpDisposer.flush());

      disposePromises.push(amqpDisposer.disposeChannel(channel));
      disposePromises.push(amqpDisposer.disposeConnection(connection));

      disposePromises.push(amqpDisposer.disposeChannel(channel));
      disposePromises.push(amqpDisposer.disposeConnection(connection));

      flushPromises.push(amqpDisposer.flush());

      disposePromises.push(amqpDisposer.disposeChannel(channel));
      disposePromises.push(amqpDisposer.disposeConnection(connection));

      disposePromises.push(amqpDisposer.disposeConnection(connection));

      const flushPromise = Promise.all(flushPromises);

      await jest.advanceTimersByTimeAsync(DISPOSE_TIMEOUT_MS - 1);

      await connectionEmitter.emitAsync('close');
      await channelEmitter.emitAsync('close');

      resolveChannelClose();
      resolveConnectionClose();

      await expect(promiseHelper.isPending(flushPromise)).resolves.toBe(true);

      await jest.advanceTimersByTimeAsync(1);

      await expect(flushPromise).resolves.toHaveLength(3);

      for (const promise of disposePromises) {
        await expect(promise).resolves.toBeUndefined();
      }
    });

    it('should wait for all promises to resolve when flushing', async () => {
      connection.close = jest
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 200)),
        );
      channel.close = jest
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 200)),
        );

      // Dispose connection and channel without awaiting, to add promises into set
      amqpDisposer.disposeConnection(connection);
      amqpDisposer.disposeChannel(channel);

      const beforeFlush = amqpDisposer['promises'].size;
      await amqpDisposer.flush();
      const afterFlush = amqpDisposer['promises'].size;

      expect(beforeFlush).toBeGreaterThan(0);
      expect(afterFlush).toBe(0);
    });

    it('should clear promises when flushing even if some promises are rejected', async () => {
      const error = new Error('Test error');
      connection.close = jest.fn().mockRejectedValue(error);
      channel.close = jest.fn().mockRejectedValue(error);

      amqpDisposer.disposeConnection(connection);
      amqpDisposer.disposeChannel(channel);

      const beforeFlush = amqpDisposer['promises'].size;
      await amqpDisposer.flush();
      const afterFlush = amqpDisposer['promises'].size;

      expect(beforeFlush).toBeGreaterThan(0);
      expect(afterFlush).toBe(0);
    });
  });
});
