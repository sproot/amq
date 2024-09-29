import { EventEmitter } from 'events';
import { TimeoutUtil } from '../utils/TimeoutUtil';
import { MaxReconnectionAttemptsExceededError } from './errors/MaxReconnectionAttemptsExceededError';
import { AmqpConnectionProvider } from './AmqpConnectionProvider';
import { AmqpConnection } from './AmqpConnection';

type AmqpConnectionInitializerOptions = {
  maxAttempts: number;
  attemptTimeoutBase: number;
  attemptTimeoutMultiplier: number;
};

type AmqpConnectionInitializerDependencies = {
  amqpConnectionProvider: AmqpConnectionProvider;
};

/**
 * Tries to initialize an AMQP connection until maximum attempt count is reached.
 *
 * Uses next formula for retry intervals:
 *   `round(attemptTimeoutBase ^ (attempt - 1))`,
 *   where `1 <= attempt <= maxAttempts `
 */
export class AmqpConnectionInitializer {
  private readonly emitter: EventEmitter;

  private readonly maxAttempts: number;
  private readonly attemptTimeoutBase: number;
  private readonly attemptTimeoutMultiplier: number;
  private readonly amqpConnectionProvider: AmqpConnectionProvider;

  private connectionPromise: Promise<AmqpConnection | null> | null;

  constructor(
    {
      maxAttempts,
      attemptTimeoutBase,
      attemptTimeoutMultiplier,
    }: AmqpConnectionInitializerOptions,
    { amqpConnectionProvider }: AmqpConnectionInitializerDependencies,
  ) {
    this.emitter = new EventEmitter().on('error', () => {}); // ignore unhandled "error" events

    this.maxAttempts = maxAttempts;
    this.attemptTimeoutBase = attemptTimeoutBase;
    this.attemptTimeoutMultiplier = attemptTimeoutMultiplier;

    this.amqpConnectionProvider = amqpConnectionProvider;

    this.connectionPromise = null;
  }

  async initializeConnection(): Promise<AmqpConnection | null> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const promise = Promise.resolve()
      .then(async () => {
        if (this.connectionPromise !== promise) return null; // canceled

        const amqpConnection = this.amqpConnectionProvider.create();

        for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
          try {
            await amqpConnection.connect();

            if (this.connectionPromise !== promise) return null; // canceled

            break;
          } catch (error) {
            if (this.connectionPromise !== promise) return null; // canceled

            this.emitter.emit('error', error);

            if (attempt === this.maxAttempts) {
              throw new MaxReconnectionAttemptsExceededError(this.maxAttempts);
            }

            await TimeoutUtil.delay(this.calculateAttemptTimeoutMs(attempt));

            if (this.connectionPromise !== promise) return null; // canceled
          }
        }

        return amqpConnection;
      })
      .finally(() => (this.connectionPromise = null));

    this.connectionPromise = promise;
    return this.connectionPromise;
  }

  private calculateAttemptTimeoutMs(attempt: number) {
    return (
      Math.round(this.attemptTimeoutBase ** (attempt - 1)) *
      this.attemptTimeoutMultiplier
    );
  }

  cancel() {
    this.connectionPromise = null;
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: (...args: any[]) => void) {
    this.emitter.removeListener(event, listener);
  }
}
