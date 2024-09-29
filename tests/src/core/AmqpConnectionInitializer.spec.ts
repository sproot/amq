import { AmqpConnectionInitializer } from '../../../src/core';
import { MaxReconnectionAttemptsExceededError } from '../../../src/core/errors';

describe('AmqpConnectionInitializer', () => {
  const MAX_ATTEMPTS = 5;
  const ATTEMPT_TIMEOUT_BASE = 2.64;
  const ATTEMPT_TIMEOUT_MULTIPLIER = 1000; // 1 seconds

  // we are using 2.64 as connectionAttemptTimeoutBase and 5 as maxConnectionAttempts
  // therefore final formula is: round(2.64 ^ (attempt - 1)) * multiplier, ms
  // attempt timeline: 0s (immediately) -> 1s -> 3s -> 7s -> 18s -> [x]
  const ATTEMPT_INTERVALS_MS = [1000, 3000, 7000, 18000];

  let amqpConnectionInitializer: AmqpConnectionInitializer;
  let amqpConnection: any;
  let amqpConnectionProvider: any;

  beforeEach(() => {
    jest.useFakeTimers();

    amqpConnection = createAmqpConnectionMock();

    amqpConnectionProvider = {
      create: jest.fn(() => amqpConnection),
    };

    amqpConnectionInitializer = new AmqpConnectionInitializer(
      {
        maxAttempts: MAX_ATTEMPTS,
        attemptTimeoutBase: ATTEMPT_TIMEOUT_BASE,
        attemptTimeoutMultiplier: ATTEMPT_TIMEOUT_MULTIPLIER,
      },
      {
        amqpConnectionProvider,
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initializeConnection()', () => {
    describe('[success (eventually)]', () => {
      it('should return the same connection until connected', async () => {
        const amqpConnection1 = createAmqpConnectionMock();
        const amqpConnection2 = createAmqpConnectionMock();
        amqpConnectionProvider.create
          .mockReturnValueOnce(amqpConnection1)
          .mockReturnValueOnce(amqpConnection2);

        await expect(
          Promise.all([
            amqpConnectionInitializer.initializeConnection(),
            amqpConnectionInitializer.initializeConnection(),
          ]),
        ).resolves.toEqual([amqpConnection1, amqpConnection1]);

        await expect(
          Promise.all([
            amqpConnectionInitializer.initializeConnection(),
            amqpConnectionInitializer.initializeConnection(),
          ]),
        ).resolves.toEqual([amqpConnection2, amqpConnection2]);
      });

      it('should initialize connection at first attempt', async () => {
        const result = await amqpConnectionInitializer.initializeConnection();
        expect(result).toBe(amqpConnection);
        expect(amqpConnectionProvider.create).toHaveBeenCalledTimes(1);
        expect(amqpConnection.connect).toHaveBeenCalledTimes(1);
      });

      it('should try to initialize connection regularly until succeeded', async () => {
        amqpConnection.connect.mockRejectedValue(new Error('Fake error'));

        amqpConnectionInitializer.initializeConnection().then((result) => {
          expect(result).toBe(amqpConnection);
          expect(amqpConnection.connect).toHaveBeenCalledTimes(3);
        });

        await jest.advanceTimersByTimeAsync(0);

        expect(amqpConnection.connect).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(ATTEMPT_INTERVALS_MS[0]);
        expect(amqpConnection.connect).toHaveBeenCalledTimes(2);

        amqpConnection.connect.mockImplementation(() => Promise.resolve());
        await jest.advanceTimersByTimeAsync(ATTEMPT_INTERVALS_MS[1]);
        await jest.advanceTimersByTimeAsync(ATTEMPT_INTERVALS_MS[2]);
        await jest.advanceTimersByTimeAsync(ATTEMPT_INTERVALS_MS[3]);
      });
    });

    describe('[fail]', () => {
      beforeEach(() => {
        amqpConnection.connect.mockRejectedValue(new Error('Fake error'));
      });

      it('should create only one connection instance for all attempts', async () => {
        amqpConnectionInitializer.initializeConnection().catch(() => {
          expect(amqpConnectionProvider.create).toHaveBeenCalledTimes(1);
        });

        await advanceTimersAfterLastAttempt();
      });

      it('should try to connect regularly with increasing intervals', async () => {
        expect(amqpConnection.connect).not.toHaveBeenCalled();
        let isDone = false;
        amqpConnectionInitializer.initializeConnection().catch(() => {
          isDone = true;
        });

        await jest.advanceTimersByTimeAsync(0);
        expect(amqpConnection.connect).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(ATTEMPT_INTERVALS_MS[0] - 1);
        expect(amqpConnection.connect).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(1);
        expect(amqpConnection.connect).toHaveBeenCalledTimes(2);

        await jest.advanceTimersByTimeAsync(ATTEMPT_INTERVALS_MS[1] - 1);
        expect(amqpConnection.connect).toHaveBeenCalledTimes(2);

        await jest.advanceTimersByTimeAsync(1);
        expect(amqpConnection.connect).toHaveBeenCalledTimes(3);

        await jest.advanceTimersByTimeAsync(ATTEMPT_INTERVALS_MS[2] - 1);
        expect(amqpConnection.connect).toHaveBeenCalledTimes(3);

        await jest.advanceTimersByTimeAsync(1);
        expect(amqpConnection.connect).toHaveBeenCalledTimes(4);

        await jest.advanceTimersByTimeAsync(ATTEMPT_INTERVALS_MS[3] - 1);
        expect(amqpConnection.connect).toHaveBeenCalledTimes(4);

        expect(isDone).toBe(false);

        await jest.advanceTimersByTimeAsync(1);

        expect(amqpConnection.connect).toHaveBeenCalledTimes(5);
        expect(isDone).toBe(true);
      });

      describe('["error" event]', () => {
        let errorEventSpy: jest.Mock;

        beforeEach(() => {
          errorEventSpy = jest.fn();
          amqpConnectionInitializer.on('error', errorEventSpy);
        });

        it('should emit "error" event for each connection error', async () => {
          const thrownErrors: Error[] = [];

          amqpConnection.connect.mockImplementation(async () => {
            const error = new Error(`Fake error #${thrownErrors.length + 1}`);
            thrownErrors.push(error);
            throw error;
          });

          amqpConnectionInitializer.initializeConnection().catch(() => {
            expect(errorEventSpy).toHaveBeenCalledTimes(5);
            for (const error of thrownErrors) {
              expect(errorEventSpy).toHaveBeenCalledWith(error);
            }
          });

          await advanceTimersAfterLastAttempt();
        });

        it('should not emit "error" event when unsubscribed', async () => {
          amqpConnectionInitializer.removeListener('error', errorEventSpy);
          amqpConnection.connect.mockImplementation(() =>
            Promise.reject(new Error('Fake error')),
          );
          amqpConnectionInitializer.initializeConnection().catch(() => {
            expect(errorEventSpy).not.toHaveBeenCalled();
          });

          await advanceTimersAfterLastAttempt();
        });
      });

      it('should fail after maximum connection attempts have been reached', async () => {
        amqpConnectionInitializer.initializeConnection().catch((error) => {
          expect(error).toEqual(new MaxReconnectionAttemptsExceededError(5));
        });

        await advanceTimersAfterLastAttempt();
      });
    });
  });

  describe('cancel()', () => {
    it('should do nothing when there are no current initializations', () => {
      amqpConnectionInitializer.cancel();
    });

    it('should interrupt initialization (immediately)', (done) => {
      amqpConnectionInitializer.initializeConnection().then((result) => {
        expect(result).toBeNull();
        expect(amqpConnectionProvider.create).not.toHaveBeenCalled();
        expect(amqpConnection.connect).not.toHaveBeenCalled();
        done();
      });

      amqpConnectionInitializer.cancel();
    });

    it('should interrupt initialization (after success)', async () => {
      amqpConnection.connect.mockImplementation(async () => {
        amqpConnectionInitializer.cancel();
      });

      const result = await amqpConnectionInitializer.initializeConnection();

      expect(result).toBeNull();
      expect(amqpConnection.connect).toHaveBeenCalledTimes(1);
    });

    it('should interrupt initialization (after fail)', async () => {
      const errorEventSpy = jest.fn();

      amqpConnectionInitializer.on('error', errorEventSpy);
      amqpConnection.connect.mockImplementation(async () => {
        amqpConnectionInitializer.cancel();
        throw new Error('Fake error');
      });

      const result = await amqpConnectionInitializer.initializeConnection();

      expect(result).toBeNull();
      expect(amqpConnection.connect).toHaveBeenCalledTimes(1);
      expect(errorEventSpy).not.toHaveBeenCalled();
    });

    it('should interrupt initialization (after fail & timeout)', async () => {
      amqpConnection.connect.mockImplementation(() =>
        Promise.reject(new Error('Fake error')),
      );

      amqpConnectionInitializer.initializeConnection().then((result) => {
        expect(result).toBeNull();
        expect(amqpConnection.connect).toHaveBeenCalledTimes(1);
      });

      await jest.advanceTimersByTimeAsync(ATTEMPT_INTERVALS_MS[0] - 1);
      amqpConnectionInitializer.cancel();
      await jest.advanceTimersByTimeAsync(1);
    });
  });

  async function advanceTimersAfterLastAttempt() {
    for (const interval of ATTEMPT_INTERVALS_MS) {
      await jest.advanceTimersByTimeAsync(interval);
    }
  }
});

function createAmqpConnectionMock() {
  const amqpConnection = {
    connect: jest.fn(async () => null),
  };

  return amqpConnection;
}
