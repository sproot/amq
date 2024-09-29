import { promiseHelper } from '../../helpers';
import {
  CommandTimedOutError,
  ConnectionBecameUnavailableError,
  ConnectionClosingError,
  ConnectionClosedError,
} from '../../../src/core/errors';
import 'jest-extended';
import { AmqpConnectionExecutor } from '../../../src/core/AmqpConnectionExecutor';

const Tuple = <T extends [any, ...any]>(v: T) => v;

describe('AmqpConnectionExecutor', () => {
  const COMMAND_TIMEOUT_MS = 4800;
  const COMMAND_RETRY_INTERVAL_MS = 1100;
  const STALE_COMMAND_DURATION_MS = 2300;

  let amqpConnectionExecutor: AmqpConnectionExecutor;
  let amqpConnectionContainer: any;

  beforeEach(() => {
    jest.useFakeTimers();

    amqpConnectionContainer = {
      getWhenAvailable: jest.fn(),
    };

    amqpConnectionExecutor = new AmqpConnectionExecutor(
      {
        commandTimeoutMs: COMMAND_TIMEOUT_MS,
        commandRetryIntervalMs: COMMAND_RETRY_INTERVAL_MS,
        staleCommandDurationMs: STALE_COMMAND_DURATION_MS,
      },
      {
        amqpConnectionContainer,
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('execute()', () => {
    const command = 'assertQueue';
    const args = Tuple([{ queue: 'test', durable: true, exclusive: false }]);
    const executeOnceResult = { fake: 'executeOnceResult' };
    let executeOnceSpy: jest.SpyInstance;

    beforeEach(() => {
      executeOnceSpy = jest
        .spyOn(amqpConnectionExecutor, 'executeOnce')
        .mockImplementation(async () => executeOnceResult as any);
    });

    it('should throw cancellation error when cancelled', async () => {
      const cancellationError = new Error('Fake cancellation error');

      amqpConnectionExecutor.cancelAll(cancellationError);

      await expect(
        amqpConnectionExecutor.execute({ command, args, retryOnError: true }),
      ).rejects.toThrow(cancellationError);

      expect(amqpConnectionExecutor.executeOnce).not.toHaveBeenCalled();
    });

    it('should execute the command and return the result', async () => {
      await expect(
        amqpConnectionExecutor.execute({ command, args, retryOnError: true }),
      ).resolves.toBe(executeOnceResult);

      expect(
        amqpConnectionExecutor.executeOnce,
      ).toHaveBeenCalledExactlyOnceWith(command, ...args);
    });

    it('should reject all executions when cancelled', async () => {
      executeOnceSpy.mockReturnValue(new Promise(() => {})); // never resolve

      const cancellationError = new Error('Fake cancellation error');

      const promise1 = amqpConnectionExecutor.execute({
        command,
        args,
        retryOnError: true,
      });
      const promise2 = amqpConnectionExecutor.execute({
        command,
        args,
        retryOnError: true,
      });

      amqpConnectionExecutor.cancelAll(cancellationError);

      await expect(promise1).rejects.toThrow(cancellationError);
      await expect(promise2).rejects.toThrow(cancellationError);
    });

    it('should reject when command timeout has exceeded', async () => {
      executeOnceSpy.mockRejectedValue(new ConnectionBecameUnavailableError());
      amqpConnectionExecutor.on('connectionBecameUnavailable', () => {
        setTimeout(() => amqpConnectionExecutor.resumeAll(), 100);
      });

      const promise = amqpConnectionExecutor.execute({
        command,
        args,
        retryOnError: true,
      });

      await jest.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS - 1);
      await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

      await jest.advanceTimersByTimeAsync(1);
      await expect(promise).rejects.toThrow(
        new CommandTimedOutError(COMMAND_TIMEOUT_MS),
      );
      expect(amqpConnectionExecutor.executeOnce).toHaveBeenCalledTimes(4);

      executeOnceSpy.mockReset();
      await jest.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS);
      expect(amqpConnectionExecutor.executeOnce).not.toHaveBeenCalled();
    });

    it('should reject immediately when retryOnError is disabled', async () => {
      const error = new ConnectionBecameUnavailableError();
      executeOnceSpy.mockRejectedValue(error);

      const connectionBecameUnavailableEventSpy = jest.fn();
      amqpConnectionExecutor.on(
        'connectionBecameUnavailable',
        connectionBecameUnavailableEventSpy,
      );

      await expect(
        amqpConnectionExecutor.execute({ command, args, retryOnError: false }),
      ).rejects.toThrow(error);

      expect(amqpConnectionExecutor.executeOnce).toHaveBeenCalledTimes(1);
      expect(connectionBecameUnavailableEventSpy).not.toHaveBeenCalled();
    });

    describe('["staleCommand" event]', () => {
      let staleCommandEventSpy: jest.Mock;

      beforeEach(() => {
        staleCommandEventSpy = jest.fn();
        amqpConnectionExecutor.on('staleCommand', staleCommandEventSpy);
      });

      it('should emit "staleCommand" when command executes for too long', async () => {
        executeOnceSpy.mockImplementation(async () => {
          await jest.advanceTimersByTimeAsync(STALE_COMMAND_DURATION_MS);
        });

        await amqpConnectionExecutor.execute({
          command,
          args,
          retryOnError: true,
        });

        expect(staleCommandEventSpy).toHaveBeenCalledExactlyOnceWith({
          command,
          args,
          durationMs: STALE_COMMAND_DURATION_MS,
          hasTimedOut: false,
          attempts: 1,
        });
      });

      it('should emit "staleCommand" when command times out', async () => {
        executeOnceSpy.mockImplementation(async () => {
          await jest.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS);
        });

        await amqpConnectionExecutor
          .execute({ command, args, retryOnError: true })
          .catch(() => {});

        expect(staleCommandEventSpy).toHaveBeenCalledExactlyOnceWith({
          command,
          args,
          durationMs: COMMAND_TIMEOUT_MS,
          hasTimedOut: true,
          attempts: 1,
        });
      });

      it('should not emit "staleCommand" when command executes quickly', async () => {
        executeOnceSpy.mockImplementation(async () => {
          await jest.advanceTimersByTimeAsync(STALE_COMMAND_DURATION_MS - 1);
        });

        await amqpConnectionExecutor.execute({
          command,
          args,
          retryOnError: true,
        });

        expect(staleCommandEventSpy).not.toHaveBeenCalled();
      });

      it('should not emit "staleCommand" when unsubscribed', async () => {
        amqpConnectionExecutor.removeListener(
          'staleCommand',
          staleCommandEventSpy,
        );

        executeOnceSpy.mockImplementation(async () => {
          await jest.advanceTimersByTimeAsync(STALE_COMMAND_DURATION_MS);
        });

        await amqpConnectionExecutor.execute({
          command,
          args,
          retryOnError: true,
        });

        expect(staleCommandEventSpy).not.toHaveBeenCalled();
      });
    });

    describe('["executeOnce" throws ConnectionBecameUnavailableError]', () => {
      let connectionBecameUnavailableEventSpy: jest.Mock;

      beforeEach(() => {
        connectionBecameUnavailableEventSpy = jest.fn();
        amqpConnectionExecutor.on(
          'connectionBecameUnavailable',
          connectionBecameUnavailableEventSpy,
        );

        let thrown = false;
        executeOnceSpy.mockImplementation(async () => {
          if (!thrown) {
            thrown = true;
            throw new ConnectionBecameUnavailableError();
          }

          return executeOnceResult;
        });
      });

      it('should emit "connectionBecameUnavailable" event', (done) => {
        amqpConnectionExecutor.on('connectionBecameUnavailable', () =>
          amqpConnectionExecutor.resumeAll(),
        );

        amqpConnectionExecutor
          .execute({ command, args, retryOnError: true })
          .then(() => {
            expect(
              connectionBecameUnavailableEventSpy,
            ).toHaveBeenCalledExactlyOnceWith();
            done();
          });

        jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS);
      });

      it('should not emit "connectionBecameUnavailable" event when unsubscribed', (done) => {
        amqpConnectionExecutor.on('connectionBecameUnavailable', () =>
          amqpConnectionExecutor.resumeAll(),
        );

        amqpConnectionExecutor.removeListener(
          'connectionBecameUnavailable',
          connectionBecameUnavailableEventSpy,
        );

        amqpConnectionExecutor
          .execute({ command, args, retryOnError: true })
          .then(() => {
            expect(connectionBecameUnavailableEventSpy).not.toHaveBeenCalled();
            done();
          });

        jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS);
      });

      it('should not emit "connectionBecameUnavailable" when cancelled while executing the command', async () => {
        executeOnceSpy.mockImplementation(async () => {
          amqpConnectionExecutor.cancelAll(new Error());
          throw new ConnectionBecameUnavailableError();
        });

        await amqpConnectionExecutor
          .execute({ command, args, retryOnError: true })
          .catch(() => {});

        expect(connectionBecameUnavailableEventSpy).not.toHaveBeenCalled();
      });

      it('should pause execution until resumed (one retry)', async () => {
        const promise = amqpConnectionExecutor.execute({
          command,
          args,
          retryOnError: true,
        });

        await jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS);
        await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

        amqpConnectionExecutor.resumeAll();

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
            throw new ConnectionBecameUnavailableError();
          }

          return executeOnceResult;
        });

        const promise = amqpConnectionExecutor.execute({
          command,
          args,
          retryOnError: true,
        });

        await expect(promiseHelper.isPending(promise)).resolves.toBe(true);
        await jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS);
        expect(amqpConnectionExecutor.executeOnce).toHaveBeenCalledTimes(1);

        amqpConnectionExecutor.resumeAll();
        await expect(promiseHelper.isPending(promise)).resolves.toBe(true);
        await jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS);
        expect(amqpConnectionExecutor.executeOnce).toHaveBeenCalledTimes(2);

        amqpConnectionExecutor.resumeAll();
        await expect(promiseHelper.isPending(promise)).resolves.toBe(true);
        await jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS);
        expect(amqpConnectionExecutor.executeOnce).toHaveBeenCalledTimes(3);

        amqpConnectionExecutor.resumeAll();
        await expect(promise).resolves.toBe(executeOnceResult);
        await jest.advanceTimersByTimeAsync(COMMAND_RETRY_INTERVAL_MS);
        expect(amqpConnectionExecutor.executeOnce).toHaveBeenCalledTimes(3);
      });

      it('should pause execution until cancelled', async () => {
        const promise1 = amqpConnectionExecutor.execute({
          command,
          args,
          retryOnError: true,
        });
        const promise2 = amqpConnectionExecutor.execute({
          command,
          args,
          retryOnError: true,
        });

        const error = new Error('Fake error');
        amqpConnectionExecutor.cancelAll(error);

        await expect(promise1).rejects.toThrow(error);
        await expect(promise2).rejects.toThrow(error);
      });

      it('should not retry after resuming when cancelled immediately', async () => {
        const promise = amqpConnectionExecutor.execute({
          command,
          args,
          retryOnError: true,
        });
        await expect(promiseHelper.isPending(promise)).resolves.toBe(true);

        amqpConnectionExecutor.resumeAll();

        const cancellationError = new Error('Fake cancellation error');
        amqpConnectionExecutor.cancelAll(cancellationError);
        await expect(promise).rejects.toThrow(cancellationError);

        expect(executeOnceSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('["executeOnce" throws other error]', () => {
      const error = new Error('Fake error');

      beforeEach(() => {
        executeOnceSpy.mockRejectedValue(error);
      });

      it('should not retry execution and re-throw error', async () => {
        await expect(
          amqpConnectionExecutor.execute({ command, args, retryOnError: true }),
        ).rejects.toThrow(error);

        expect(executeOnceSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('executeOnce()', () => {
    const command = 'assertQueue';
    const args = Tuple([{ queue: 'test', durable: true, exclusive: false }]);
    const commandResult = { fake: 'command-result' };

    let amqpConnection: any;

    beforeEach(() => {
      amqpConnection = {
        [command]: jest.fn(async () => commandResult),
      };
      amqpConnectionContainer.getWhenAvailable.mockImplementation(
        async () => amqpConnection,
      );
    });

    it('should execute the command with available connection and return result', async () => {
      await expect(
        amqpConnectionExecutor.executeOnce(command, ...args),
      ).resolves.toBe(commandResult);

      expect(amqpConnection[command]).toHaveBeenCalledExactlyOnceWith(...args);
    });

    it('should not execute the command when cancelled while getting the connection', async () => {
      const error = new Error('Fake cancellation error');

      amqpConnectionContainer.getWhenAvailable.mockImplementation(async () => {
        amqpConnectionExecutor.cancelAll(error);
        return amqpConnection;
      });

      await expect(
        amqpConnectionExecutor.executeOnce(command, ...args),
      ).rejects.toThrow(error);

      expect(amqpConnection[command]).not.toHaveBeenCalled();
    });

    it('should throw "ConnectionBecameUnavailableError" on "ConnectionClosingError" command error', async () => {
      amqpConnection[command].mockRejectedValue(new ConnectionClosingError());

      await expect(
        amqpConnectionExecutor.executeOnce(command, ...args),
      ).rejects.toThrow(new ConnectionBecameUnavailableError());
    });

    it('should throw "ConnectionBecameUnavailableError" on "ConnectionClosedError" command error', async () => {
      amqpConnection[command].mockRejectedValue(new ConnectionClosedError());

      await expect(
        amqpConnectionExecutor.executeOnce(command, ...args),
      ).rejects.toThrow(new ConnectionBecameUnavailableError());
    });

    it('should re-throw other errors', async () => {
      const error = new Error('Fake command error');
      amqpConnection[command].mockRejectedValue(error);

      await expect(
        amqpConnectionExecutor.executeOnce(command, ...args),
      ).rejects.toThrow(error);
    });
  });

  describe('resumeAll()', () => {
    it('should not throw error when cancelled', () => {
      amqpConnectionExecutor.cancelAll(new Error());

      expect(() => amqpConnectionExecutor.resumeAll()).not.toThrow();
    });
  });

  describe('cancelAll()', () => {
    it('should do nothing on second call', async () => {
      const cancellationError = new Error('Fake cancellation error');

      amqpConnectionExecutor.cancelAll(cancellationError);
      amqpConnectionExecutor.cancelAll(new Error('Some other error'));

      await expect(
        amqpConnectionExecutor.execute({
          command: 'assertQueue',
          args: Tuple([{}]),
          retryOnError: false,
        }),
      ).rejects.toThrow(cancellationError);
    });
  });
});
