import type { AmqpConnection } from '../../../core';
import { ExchangeType } from '../../../core/types';

type CommandQueueInitializerOptions = {
  exchange: string;
  queue: string;
};

type CommandQueueInitializerDependencies = {
  amqpConnection: AmqpConnection;
};

export class CommandQueueInitializer {
  private readonly exchange: string;
  private readonly queue: string;
  private initializePromise: Promise<void> | null = null;

  public isExclusive = false;

  private readonly amqpConnection: AmqpConnection;

  constructor(
    { exchange, queue }: CommandQueueInitializerOptions,
    { amqpConnection }: CommandQueueInitializerDependencies,
  ) {
    this.exchange = exchange;
    this.queue = queue;

    this.amqpConnection = amqpConnection;
  }

  async initialize() {
    const promise = Promise.resolve().then(async () => {
      // disposed or superseded by new initialize() call
      if (this.initializePromise !== promise) return;

      await this.amqpConnection.assertExchange({
        exchange: this.exchange,
        type: ExchangeType.DIRECT,
        durable: true,
        autoDelete: false,
      });

      // disposed or superseded by new initialize() call
      if (this.initializePromise !== promise) return;

      await this.amqpConnection.assertQueue({
        queue: this.queue,
        durable: !this.isExclusive,
        autoDelete: false,
        exclusive: this.isExclusive,
      });

      // disposed or superseded by new initialize() call
      if (this.initializePromise !== promise) return;

      await this.amqpConnection.bindQueue({
        exchange: this.exchange,
        queue: this.queue,
      });
    });

    this.initializePromise = promise;
    return this.initializePromise;
  }

  dispose() {
    this.initializePromise = null;
    // We don't need to delete the queue/exchange since they'll be deleted automatically by RabbitMQ
  }

  setIsExclusive(value: boolean) {
    if (this.initializePromise) {
      throw new Error("Cannot change initialized queue's exclusivity");
    }

    this.isExclusive = value;
    return this;
  }
}
