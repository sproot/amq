import { ExchangeType } from './types';

export interface AmqpConnectionInterface {
  connect(): Promise<void>;
  dispose(): Promise<void>;

  setChannelPrefetchCount(count: number): Promise<void>;
  setConsumerPrefetchCount(count: number): Promise<void>;

  acknowledge(deliveryTag: number): Promise<void>;
  negativeAcknowledge(deliveryTag: number): Promise<void>;

  assertQueue({
    queue,
    durable,
    exclusive,
    autoDelete,
    disuseExpireMs,
    deadLetterExchange,
    deadLetterRoutingKey,
    singleActiveConsumer,
  }: {
    queue?: string;
    durable?: boolean;
    exclusive?: boolean;
    autoDelete?: boolean;
    disuseExpireMs?: number;
    deadLetterExchange?: string;
    deadLetterRoutingKey?: string;
    singleActiveConsumer?: boolean;
  }): Promise<string>;

  deleteQueue(queue: string): Promise<void>;

  assertExchange({
    exchange,
    type,
    durable,
    autoDelete,
  }: {
    exchange: string;
    type: ExchangeType;
    durable?: boolean;
    autoDelete?: boolean;
  }): Promise<void>;

  bindQueue({
    queue,
    exchange,
    routingKey,
  }: {
    queue: string;
    exchange: string;
    routingKey?: string;
  }): Promise<void>;

  consumeQueue(
    queue: string,
    handler: (...args: any[]) => void,
    options?: { requiresAcknowledgement?: boolean },
  ): Promise<string>;

  cancelConsumption(consumerTag: string): Promise<void>;

  publishToExchange(
    exchange: string,
    dataBuffer: Buffer,
    options?: {
      routingKey?: string;
      correlationId?: string;
      persistent?: boolean;
      mandatory?: boolean;
      expireMs?: number;
    },
  ): Promise<void>;

  sendToQueue(
    queue: string,
    dataBuffer: Buffer,
    options?: {
      correlationId?: string;
      replyQueue?: string;
      mandatory?: boolean;
      persistent?: boolean;
      expireMs?: number;
    },
  ): Promise<void>;

  on(event: string, listener: (...args: any[]) => void): void;
  removeListener(event: string, listener: (...args: any[]) => void): void;
}
