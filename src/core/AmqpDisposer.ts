import type { Connection, Channel } from 'amqplib';

type callbackFunction = (...args: any[]) => void;

type AmqplibDisposerOptions = {
  disposeTimeoutMs: number;
};

export class AmqpDisposer {
  private readonly disposeTimeoutMs: number;
  private readonly promises: Set<Promise<unknown>>;

  constructor({ disposeTimeoutMs }: AmqplibDisposerOptions) {
    this.disposeTimeoutMs = disposeTimeoutMs;
    this.promises = new Set();
  }

  async disposeConnection(connection: Connection) {
    let timeoutId: NodeJS.Timeout;

    const promise = Promise.race([
      new Promise((resolve) => {
        timeoutId = setTimeout(resolve, this.disposeTimeoutMs);
      }),
      this.wrap(
        () => new Promise((resolve) => connection.once('close', resolve)),
      ),
      this.wrap(async () => {
        try {
          await connection.close();
        } catch (error) {
          if (error instanceof Error) {
            const message = error.message.toLowerCase();

            if (
              !message.startsWith('connection closed') &&
              !message.startsWith('connection closing')
            ) {
              throw error;
            }
          }
        }
      }),
    ]).finally(() => {
      clearTimeout(timeoutId);
      this.promises.delete(promise);
    });

    this.promises.add(promise);
    await promise;
  }

  async disposeChannel(channel: Channel) {
    let timeoutId: NodeJS.Timeout;

    const promise = Promise.race([
      new Promise((resolve) => {
        timeoutId = setTimeout(resolve, this.disposeTimeoutMs);
      }),
      this.wrap(() => new Promise((resolve) => channel.once('close', resolve))),
      this.wrap(async () => {
        try {
          await channel.close();
        } catch (error) {
          if (error instanceof Error) {
            const message = error.message.toLowerCase();

            if (
              !message.startsWith('channel closed') &&
              !message.startsWith('channel closing') &&
              !message.startsWith('channel ended')
            ) {
              throw error;
            }
          }
        }
      }),
    ]).finally(() => {
      clearTimeout(timeoutId);
      this.promises.delete(promise);
    });

    this.promises.add(promise);
    await promise;
  }

  async flush() {
    // allows to wait for disposals which have been performed while flushing
    while (this.promises.size > 0) {
      const promises = [...this.promises];
      this.promises.clear();

      await Promise.all(promises);
    }
  }

  private async wrap(callback: callbackFunction) {
    try {
      await callback();
    } catch (error) {
      await new Promise(() => {}); // don't resolve on error
    }
  }
}
