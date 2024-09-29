import { promiseHelper } from '../../helpers';
import {
  ChannelBecameUnavailableError,
  CommandTimedOutError,
  ConnectionClosingError,
} from '../../../src/core/errors';
import { AmqpChannelExecutor } from '../../../src/core/AmqpChannelExecutor';

describe('AmqpChannelExecutor', () => {
  const COMMAND_TIMEOUT_MS = 4800;
  const COMMAND_RETRY_INTERVAL_MS = 1100;

  let amqpChannelExecutor: AmqpChannelExecutor;
  let amqpChannelContainer: any;
  let amqpChannel: any;

  beforeEach(() => {
    jest.useFakeTimers();

    amqpChannel = { fake: 'amqpChannel' };
    amqpChannelContainer = {
      getWhenAvailable: jest.fn(async () => amqpChannel),
    };

    amqpChannelExecutor = new AmqpChannelExecutor(
      {
        commandTimeoutMs: COMMAND_TIMEOUT_MS,
        commandRetryIntervalMs: COMMAND_RETRY_INTERVAL_MS,
      },
      {
        amqpChannelContainer,
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('execute()', () => {
    const command = async () => {
      'fake command';
    };
    const executeOnceResult = { fake: 'executeOnceResult' };
    let executeOnceSpy: jest.SpyInstance;

    beforeEach(() => {
      executeOnceSpy = jest
        .spyOn(amqpChannelExecutor, 'executeOnce')
        .mockImplementation(async () => executeOnceResult);
    });

    it('should throw cancellation error when cancelled', async () => {
      const cancellationError = new Error('Fake cancellation error');

      amqpChannelExecutor.cancelAll(cancellationError);

      await expect(
        amqpChannelExecutor.execute(command, { retryOnError: true }),
      ).rejects.toThrow(cancellationError);

      expect(executeOnceSpy).not.toHaveBeenCalled();
    });

    it('should execute the command and return the result', async () => {
      await expect(
        amqpChannelExecutor.execute(command, { retryOnError: true }),
      ).resolves.toBe(executeOnceResult);

      expect(executeOnceSpy).toHaveBeenCalledWith(command);
      expect(executeOnceSpy).toHaveBeenCalledTimes(1);
    });

    it('should reject all executions when cancelled', async () => {
      executeOnceSpy.mockReturnValue(new Promise(() => {})); // never resolve

      const cancellationError = new Error('Fake cancellation error');

      const promise1 = amqpChannelExecutor.execute<void>(
        async () => {
          'fake command 1';
        },
        { retryOnError: true },
      );
      const promise2 = amqpChannelExecutor.execute<void>(
        async () => {
          'fake command 2';
        },
        { retryOnError: true },
      );

      amqpChannelExecutor.cancelAll(cancellationError);

      await expect(promise1).rejects.toThrow(cancellationError);
      await expect(promise2).rejects.toThrow(cancellationError);
    });

    it('should reject when command timeout has exceeded', async () => {
      executeOnceSpy.mockRejectedValue(new ChannelBecameUnavailableError());
      amqpChannelExecutor.on('channelBecameUnavailable', () => {
        setTimeout(() => amqpChannelExecutor.resumeAll(), 100);
      });

      const promise = amqpChannelExecutor.execute(command, {
        retryOnError: true,
      });

      await jest.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS - 1);
      await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

      await jest.advanceTimersByTimeAsync(1);
      await expect(promise).rejects.toThrow(
        new CommandTimedOutError(COMMAND_TIMEOUT_MS),
      );
      expect(amqpChannelExecutor.executeOnce).toHaveBeenCalledTimes(4);

      executeOnceSpy.mockReset();
      await jest.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS);
      expect(amqpChannelExecutor.executeOnce).not.toHaveBeenCalled();
    });

    it('should immediately reject when retryOnError is disabled', async () => {
      const channelBecameUnavailableEventSpy = jest.fn();
      amqpChannelExecutor.on(
        'channelBecameUnavailable',
        channelBecameUnavailableEventSpy,
      );

      const error = new ChannelBecameUnavailableError();
      executeOnceSpy.mockRejectedValue(error);

      await expect(
        amqpChannelExecutor.execute(command, { retryOnError: false }),
      ).rejects.toThrow(error);

      expect(executeOnceSpy).toHaveBeenCalledTimes(1);
      expect(channelBecameUnavailableEventSpy).not.toHaveBeenCalled();
    });

    describe('["executeOnce" throws ChannelBecameUnavailableError]', () => {
      let channelBecameUnavailableEventSpy: jest.Mock;

      beforeEach(() => {
        channelBecameUnavailableEventSpy = jest.fn();
        amqpChannelExecutor.on(
          'channelBecameUnavailable',
          channelBecameUnavailableEventSpy,
        );

        let thrown = false;
        executeOnceSpy.mockImplementation(async () => {
          if (!thrown) {
            thrown = true;
            throw new ChannelBecameUnavailableError();
          }

          return executeOnceResult;
        });
      });

      it('should emit "channelBecameUnavailable" event', (done) => {
        amqpChannelExecutor.on('channelBecameUnavailable', () =>
          amqpChannelExecutor.resumeAll(),
        );

        amqpChannelExecutor
          .execute(command, { retryOnError: true })
          .then(() => {
            expect(channelBecameUnavailableEventSpy).toHaveBeenCalledWith();
            expect(channelBecameUnavailableEventSpy).toHaveBeenCalledTimes(1);
            done();
          });

        jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS);
      });

      it('should not emit "channelBecameUnavailable" event when unsubscribed', (done) => {
        amqpChannelExecutor.on('channelBecameUnavailable', () =>
          amqpChannelExecutor.resumeAll(),
        );

        amqpChannelExecutor.removeListener(
          'channelBecameUnavailable',
          channelBecameUnavailableEventSpy,
        );

        amqpChannelExecutor
          .execute(command, { retryOnError: true })
          .then(() => {
            expect(channelBecameUnavailableEventSpy).not.toHaveBeenCalled();
            done();
          });

        jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS);
      });

      it('should not emit "channelBecameUnavailable" event when cancelled while executing the command', async () => {
        executeOnceSpy.mockImplementation(async () => {
          amqpChannelExecutor.cancelAll(new Error());
          throw new ChannelBecameUnavailableError();
        });

        await amqpChannelExecutor
          .execute(command, { retryOnError: true })
          .catch(() => {});

        expect(channelBecameUnavailableEventSpy).not.toHaveBeenCalled();
      });

      it('should pause execution until resumed (one retry)', async () => {
        const promise = amqpChannelExecutor.execute(command, {
          retryOnError: true,
        });

        await jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS);
        await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

        amqpChannelExecutor.resumeAll();

        await jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS - 1);
        await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

        await jest.advanceTimersByTimeAsync(1);
        await expect(promise).resolves.toBe(executeOnceResult);
      });

      it('should pause execution until resumed (multiple retries)', async () => {
        let thrownTimes = 0;
        executeOnceSpy.mockImplementation(async () => {
          if (thrownTimes < 2) {
            thrownTimes++;
            throw new ChannelBecameUnavailableError();
          }

          return executeOnceResult;
        });

        const promise = amqpChannelExecutor.execute(command, {
          retryOnError: true,
        });

        await expect(promiseHelper.isPending(promise)).resolves.toBe(true);
        await jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS);
        expect(executeOnceSpy).toHaveBeenCalledTimes(1);

        amqpChannelExecutor.resumeAll();
        await expect(promiseHelper.isPending(promise)).resolves.toBe(true);
        await jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS);
        expect(executeOnceSpy).toHaveBeenCalledTimes(2);

        amqpChannelExecutor.resumeAll();
        await expect(promiseHelper.isPending(promise)).resolves.toBe(true);
        await jest.advanceTimersByTime(COMMAND_RETRY_INTERVAL_MS);
        expect(executeOnceSpy).toHaveBeenCalledTimes(3);

        amqpChannelExecutor.resumeAll();
        await expect(promise).resolves.toBe(executeOnceResult);
        await jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS);
        expect(amqpChannelExecutor.executeOnce).toHaveBeenCalledTimes(3);
      });

      it('should pause execution until cancelled', async () => {
        const promise1 = amqpChannelExecutor.execute(
          async () => {
            'fake command 1';
          },
          { retryOnError: true },
        );
        const promise2 = amqpChannelExecutor.execute(
          async () => {
            'fake command 2';
          },
          { retryOnError: true },
        );

        const error = new Error('Fake error');
        amqpChannelExecutor.cancelAll(error);

        await expect(promise1).rejects.toThrow(error);
        await expect(promise2).rejects.toThrow(error);
      });

      it('should not retry after resuming when cancelled immediately', async () => {
        const promise = amqpChannelExecutor.execute(command, {
          retryOnError: true,
        });
        await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

        amqpChannelExecutor.resumeAll();

        const cancellationError = new Error('Fake cancellation error');
        amqpChannelExecutor.cancelAll(cancellationError);
        await expect(promise).rejects.toThrow(cancellationError);

        expect(executeOnceSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('["executeOnce" throws ConnectionClosingError]', () => {
      let connectionClosingEventSpy: jest.Mock;

      beforeEach(() => {
        connectionClosingEventSpy = jest.fn();
        amqpChannelExecutor.on('connectionClosing', connectionClosingEventSpy);

        let thrown = false;
        executeOnceSpy.mockImplementation(async () => {
          if (!thrown) {
            thrown = true;
            throw new ConnectionClosingError();
          }

          return executeOnceResult;
        });
      });

      it('should emit "connectionClosing" event', async () => {
        await amqpChannelExecutor
          .execute(command, { retryOnError: true })
          .catch(() => {});

        expect(connectionClosingEventSpy).toHaveBeenCalledWith();
        expect(connectionClosingEventSpy).toHaveBeenCalledTimes(1);
      });

      it('should not emit "connectionClosing" event when unsubscribed', async () => {
        amqpChannelExecutor.removeListener(
          'connectionClosing',
          connectionClosingEventSpy,
        );

        await amqpChannelExecutor
          .execute(command, { retryOnError: true })
          .catch(() => {});

        expect(connectionClosingEventSpy).not.toHaveBeenCalled();
      });

      it('should not emit "connectionClosing" event when cancelled while executing the command', async () => {
        executeOnceSpy.mockImplementation(async () => {
          amqpChannelExecutor.cancelAll(new Error());
          throw new ConnectionClosingError();
        });

        await amqpChannelExecutor
          .execute(command, { retryOnError: true })
          .catch(() => {});

        expect(connectionClosingEventSpy).not.toHaveBeenCalled();
      });

      it('should throw "ConnectionClosingError"', async () => {
        await expect(
          amqpChannelExecutor.execute(command, { retryOnError: true }),
        ).rejects.toThrow(new ConnectionClosingError());
      });
    });

    describe('["executeOnce" throws other error]', () => {
      const error = new Error('Fake error');

      beforeEach(() => {
        executeOnceSpy.mockRejectedValue(error);
      });

      it('should not emit "connectionClosing" event', async () => {
        const connectionClosingEventSpy = jest.fn();
        amqpChannelExecutor.on('connectionClosing', connectionClosingEventSpy);

        await amqpChannelExecutor
          .execute(command, { retryOnError: true })
          .catch(() => {});

        expect(connectionClosingEventSpy).not.toHaveBeenCalled();
      });

      it('should not retry execution and re-throw error', async () => {
        await expect(
          amqpChannelExecutor.execute(command, { retryOnError: true }),
        ).rejects.toThrow(error);

        expect(amqpChannelExecutor.executeOnce).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('executeOnce()', () => {
    let commandSpy: jest.Mock;
    let commandResult: any;

    beforeEach(() => {
      commandResult = { fake: 'commandResult' };
      commandSpy = jest.fn(async () => commandResult);
    });

    it('should execute the command with available channel and return result', async () => {
      await expect(amqpChannelExecutor.executeOnce(commandSpy)).resolves.toBe(
        commandResult,
      );

      expect(commandSpy).toHaveBeenCalledWith(amqpChannel);
      expect(commandSpy).toHaveBeenCalledTimes(1);
    });

    it('should not execute the command when cancelled while getting the channel', async () => {
      const error = new Error('Fake cancellation error');

      amqpChannelContainer.getWhenAvailable.mockImplementation(async () => {
        amqpChannelExecutor.cancelAll(error);
        return amqpChannel;
      });

      await expect(amqpChannelExecutor.executeOnce(commandSpy)).rejects.toThrow(
        error,
      );

      expect(commandSpy).not.toHaveBeenCalled();
    });

    it('should throw ChannelBecameUnavailableError on "Channel closing" command error', async () => {
      commandSpy.mockRejectedValue(new Error('Channel closing: reason'));

      await expect(amqpChannelExecutor.executeOnce(commandSpy)).rejects.toThrow(
        new ChannelBecameUnavailableError(),
      );
    });

    it('should throw ChannelBecameUnavailableError on "Channel closed" command error', async () => {
      commandSpy.mockRejectedValue(new Error('Channel closed'));

      await expect(amqpChannelExecutor.executeOnce(commandSpy)).rejects.toThrow(
        new ChannelBecameUnavailableError(),
      );
    });

    it('should throw ChannelBecameUnavailableError on "channel closed by server" command error', async () => {
      commandSpy.mockRejectedValue(new Error('channel closed by server'));

      await expect(amqpChannelExecutor.executeOnce(commandSpy)).rejects.toThrow(
        new ChannelBecameUnavailableError(),
      );
    });

    it('should throw ChannelBecameUnavailableError on "Channel ended, no reply will be forthcoming" command error', async () => {
      commandSpy.mockRejectedValue(
        new Error('Channel ended, no reply will be forthcoming'),
      );

      await expect(amqpChannelExecutor.executeOnce(commandSpy)).rejects.toThrow(
        new ChannelBecameUnavailableError(),
      );
    });

    it('should throw ConnectionClosingError on "Connection closing" command error', async () => {
      commandSpy.mockRejectedValue(new Error('Connection closing: reason'));

      await expect(amqpChannelExecutor.executeOnce(commandSpy)).rejects.toThrow(
        new ConnectionClosingError(),
      );
    });

    it('should re-throw other errors', async () => {
      const error = new Error('Fake command error');
      commandSpy.mockRejectedValue(error);

      await expect(amqpChannelExecutor.executeOnce(commandSpy)).rejects.toThrow(
        error,
      );
    });
  });

  describe('resumeAll()', () => {
    it('should not throw error when cancelled', () => {
      amqpChannelExecutor.cancelAll(new Error());

      expect(() => amqpChannelExecutor.resumeAll()).not.toThrow();
    });
  });

  describe('cancelAll()', () => {
    it('should do nothing on second call', async () => {
      const cancellationError = new Error('Fake cancellation error');

      amqpChannelExecutor.cancelAll(cancellationError);
      amqpChannelExecutor.cancelAll(new Error('Some other error'));

      await expect(
        amqpChannelExecutor.execute(async () => {}, { retryOnError: true }),
      ).rejects.toThrow(cancellationError);
    });
  });
});
