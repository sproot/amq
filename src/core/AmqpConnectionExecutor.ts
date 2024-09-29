import { EventEmitter } from 'events';
import {
  ConnectionBecameUnavailableError,
  ConnectionClosingError,
  ConnectionClosedError,
  CommandTimedOutError,
} from './errors';
import { AmqpConnectionContainer } from './AmqpConnectionContainer';
import { AmqpConnection } from './AmqpConnection';

type AmqpConnectionExecutorOptions = {
  commandTimeoutMs: number;
  commandRetryIntervalMs: number;
  staleCommandDurationMs: number;
};

type AmqpConnectionExecutorDependencies = {
  amqpConnectionContainer: AmqpConnectionContainer;
};

type Listener = (...args: any[]) => void;
type CancelCallback = (error: Error) => void;
type ResumeCallback = (value?: unknown) => void;

interface ExecuteParams<T extends keyof AmqpConnection> {
  command: T;
  args: Parameters<AmqpConnection[T]>;
  retryOnError: boolean;
}

export class AmqpConnectionExecutor {
  private readonly emitter: EventEmitter = new EventEmitter();

  private readonly commandTimeoutMs: number;
  private readonly commandRetryIntervalMs: number;
  private readonly staleCommandDurationMs: number;

  private readonly amqpConnectionContainer: AmqpConnectionContainer;
  private readonly cancelCallbacks: Set<CancelCallback> = new Set();
  private readonly resumeCallbacks: Set<ResumeCallback> = new Set();

  private isCancelled = false;
  private cancellationError: null | Error = null;

  constructor(
    {
      commandTimeoutMs,
      commandRetryIntervalMs,
      staleCommandDurationMs,
    }: AmqpConnectionExecutorOptions,
    { amqpConnectionContainer }: AmqpConnectionExecutorDependencies,
  ) {
    this.commandTimeoutMs = commandTimeoutMs;
    this.commandRetryIntervalMs = commandRetryIntervalMs;
    this.staleCommandDurationMs = staleCommandDurationMs;
    this.amqpConnectionContainer = amqpConnectionContainer;
  }

  async execute<T extends keyof AmqpConnection>({
    command,
    args,
    retryOnError,
  }: ExecuteParams<T>): Promise<Awaited<ReturnType<AmqpConnection[T]>>> {
    if (this.isCancelled) {
      throw this.cancellationError;
    }

    let hasTimedOut = false;

    let timeoutId: NodeJS.Timeout;
    let cancelCallback: CancelCallback;
    let resumeCallback: ResumeCallback;
    let attempts = 0;

    const executedAt = Date.now();

    return Promise.race([
      (async () => {
        do {
          attempts++;

          try {
            return await this.executeOnce(command, ...args);
          } catch (error) {
            if (this.isCancelled) {
              throw this.cancellationError;
            }

            if (
              retryOnError &&
              error instanceof ConnectionBecameUnavailableError
            ) {
              await new Promise((resolve) => {
                resumeCallback = resolve;
                this.resumeCallbacks.add(resolve);
                this.emitter.emit('connectionBecameUnavailable');
              });

              await new Promise((resolve) =>
                setTimeout(resolve, this.commandRetryIntervalMs),
              );
            } else {
              throw error;
            }
          }
        } while (!this.isCancelled && !hasTimedOut);

        throw this.cancellationError; // doesn't matter, already rejected below
      })(),
      new Promise<Awaited<ReturnType<AmqpConnection[T]>>>((_, reject) => {
        cancelCallback = reject;
        this.cancelCallbacks.add(reject);

        timeoutId = setTimeout(() => {
          hasTimedOut = true;
          reject(new CommandTimedOutError(this.commandTimeoutMs));
        }, this.commandTimeoutMs);
      }),
    ]).finally(() => {
      const durationMs = Date.now() - executedAt;
      if (durationMs >= this.staleCommandDurationMs) {
        this.emitter.emit('staleCommand', {
          durationMs,
          hasTimedOut,
          attempts,
          command,
          args,
        });
      }

      clearTimeout(timeoutId);
      this.resumeCallbacks.delete(resumeCallback);
      this.cancelCallbacks.delete(cancelCallback);
    });
  }

  async executeOnce<T extends keyof AmqpConnection>(
    command: T,
    ...args: Parameters<AmqpConnection[T]>
  ): Promise<Awaited<ReturnType<AmqpConnection[T]>>> {
    const connection = await this.amqpConnectionContainer.getWhenAvailable();
    if (this.isCancelled) {
      throw this.cancellationError;
    }

    try {
      return await (connection[command] as any)(...args);
    } catch (error) {
      if (
        error instanceof ConnectionClosingError ||
        error instanceof ConnectionClosedError
      ) {
        throw new ConnectionBecameUnavailableError();
      } else {
        throw error;
      }
    }
  }

  resumeAll() {
    const resumeCallbacks = [...this.resumeCallbacks];
    this.resumeCallbacks.clear();

    for (const callback of resumeCallbacks) {
      callback();
    }
  }

  cancelAll(error: Error) {
    if (this.isCancelled) return;

    this.isCancelled = true;
    this.cancellationError = error;

    const cancelCallbacks = [...this.cancelCallbacks];
    this.cancelCallbacks.clear();
    this.resumeCallbacks.clear();

    for (const callback of cancelCallbacks) {
      callback(error);
    }
  }

  on(event: string, listener: Listener) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: Listener) {
    this.emitter.removeListener(event, listener);
  }
}
