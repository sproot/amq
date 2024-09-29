import { AmqpConnection } from '../../core';
import { ExchangeType } from '../../core/types';

type JobQueueInitializerOptions = {
  exchange: string;
  queue: string;
};

type JobQueueInitializerDependencies = {
  amqpConnection: AmqpConnection;
};

export class JobQueueInitializer {
  private readonly exchange: string;
  private readonly queue: string;
  private readonly amqpConnection: AmqpConnection;

  private initializePromise: Promise<void> | null = null;

  constructor(
    { exchange, queue }: JobQueueInitializerOptions,
    { amqpConnection }: JobQueueInitializerDependencies,
  ) {
    this.exchange = exchange;
    this.queue = queue;
    this.amqpConnection = amqpConnection;
  }

  async initialize() {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    const promise = Promise.resolve().then(async () => {
      if (this.initializePromise !== promise) return;
      await this.amqpConnection.assertExchange({
        exchange: this.exchange,
        type: ExchangeType.DIRECT,
        durable: true,
        autoDelete: false,
      });

      if (this.initializePromise !== promise) return;
      await this.amqpConnection.assertQueue({
        queue: this.queue,
        durable: true,
        autoDelete: false,
        exclusive: false,
      });

      if (this.initializePromise !== promise) return;
      await this.amqpConnection.bindQueue({
        exchange: this.exchange,
        queue: this.queue,
        routingKey: this.queue,
      });
    });

    this.initializePromise = promise;
    return this.initializePromise;
  }

  reset() {
    this.initializePromise = null;
  }

  dispose() {
    this.initializePromise = null;
  }
}
