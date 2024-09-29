import { AmqpConnection } from '../../core';

type JobRetryQueueProviderOptions = {
  exchange: string;
  queue: string;
  disuseExpireMs?: number;
};

type JobRetryQueueProviderDependencies = {
  amqpConnection: AmqpConnection;
};

export class JobRetryQueueProvider {
  private readonly exchange: string;
  private readonly queue: string;
  private readonly disuseExpireMs: number;

  private readonly amqpConnection: AmqpConnection;

  constructor(
    { exchange, queue, disuseExpireMs = 1000 }: JobRetryQueueProviderOptions,
    { amqpConnection }: JobRetryQueueProviderDependencies,
  ) {
    this.exchange = exchange;
    this.queue = queue;
    this.disuseExpireMs = disuseExpireMs;

    this.amqpConnection = amqpConnection;
  }

  async create(expireMs: number) {
    return this.amqpConnection.assertQueue({
      queue: `${this.queue}:retry:${expireMs}`,
      durable: true,
      autoDelete: false,
      exclusive: false,
      disuseExpireMs: this.disuseExpireMs + expireMs,
      deadLetterExchange: this.exchange,
      deadLetterRoutingKey: this.queue,
    });
  }
}
