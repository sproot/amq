import { EventEmitter } from 'events';
import type { AmqpChannelContainer } from './AmqpChannelContainer';
import {
  ChannelBecameUnavailableError,
  ConnectionClosingError,
  CommandTimedOutError,
} from './errors';

type AmqplibChannelExecutorOptions = {
  commandTimeoutMs: number;
  commandRetryIntervalMs: number;
};

type AmqplibChannelExecutorDependencies = {
  amqpChannelContainer: AmqpChannelContainer;
};

type Listener = (...args: any[]) => void;
type CancelCallback = (error: Error) => void;
type ResumeCallback = (value?: unknown) => void;

type ExecuteOptions = {
  retryOnError: boolean;
};

import type { ConfirmChannel } from 'amqplib';
type Command<T> = (channel: ConfirmChannel) => Promise<T>;

export class AmqpChannelExecutor {
  private readonly emitter = new EventEmitter();
  private readonly commandTimeoutMs: number;
  private readonly commandRetryIntervalMs: number;
  private readonly amqpChannelContainer: AmqpChannelContainer;
  private readonly cancelCallbacks: Set<CancelCallback> = new Set();
  private readonly resumeCallbacks: Set<ResumeCallback> = new Set();
  private isCancelled = false;
  private cancellationError: null | Error = null;

  constructor(
    { commandTimeoutMs, commandRetryIntervalMs }: AmqplibChannelExecutorOptions,
    { amqpChannelContainer }: AmqplibChannelExecutorDependencies,
  ) {
    this.commandTimeoutMs = commandTimeoutMs;
    this.commandRetryIntervalMs = commandRetryIntervalMs;
    this.amqpChannelContainer = amqpChannelContainer;
  }

  async execute<T>(
    command: Command<T>,
    { retryOnError }: ExecuteOptions,
  ): Promise<T> {
    if (this.isCancelled) {
      throw this.cancellationError;
    }

    let hasTimedOut = false;

    let timeoutId: NodeJS.Timeout;
    let cancelCallback: CancelCallback;
    let resumeCallback: ResumeCallback;

    return Promise.race([
      (async () => {
        do {
          try {
            return await this.executeOnce(command);
          } catch (error) {
            if (this.isCancelled) {
              throw this.cancellationError;
            }

            if (
              retryOnError &&
              error instanceof ChannelBecameUnavailableError
            ) {
              await new Promise((resolve) => {
                resumeCallback = resolve;
                this.resumeCallbacks.add(resolve);
                this.emitter.emit('channelBecameUnavailable');
              });

              await new Promise((resolve) =>
                setTimeout(resolve, this.commandRetryIntervalMs),
              );
            } else {
              if (error instanceof ConnectionClosingError) {
                this.emitter.emit('connectionClosing');
              }

              throw error;
            }
          }
        } while (!this.isCancelled && !hasTimedOut);

        throw this.cancellationError; // doesn't matter, already rejected below
      })(),
      new Promise<T>((_, reject) => {
        cancelCallback = reject;
        this.cancelCallbacks.add(reject);

        timeoutId = setTimeout(() => {
          hasTimedOut = true;
          reject(new CommandTimedOutError(this.commandTimeoutMs));
        }, this.commandTimeoutMs);
      }),
    ]).finally(() => {
      clearTimeout(timeoutId);
      this.resumeCallbacks.delete(resumeCallback);
      this.cancelCallbacks.delete(cancelCallback);
    });
  }

  async executeOnce<T>(command: Command<T>): Promise<T> {
    const channel = await this.amqpChannelContainer.getWhenAvailable();
    if (this.isCancelled) {
      throw this.cancellationError;
    }

    try {
      return await command(channel);
    } catch (error) {
      if (error instanceof Error) {
        const message = error.message.toLowerCase();

        if (
          message.startsWith('channel closed') ||
          message.startsWith('channel closing') ||
          message.startsWith('channel ended')
        ) {
          throw new ChannelBecameUnavailableError();
        } else if (message.startsWith('connection closing')) {
          throw new ConnectionClosingError();
        }
      }

      throw error;
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
