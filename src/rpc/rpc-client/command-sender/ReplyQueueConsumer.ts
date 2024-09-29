import { EventEmitter } from 'events';
import { AmqpConnection } from '../../../core';
import { IdGenerator } from '../../../types';

type ReplyQueueConsumerOptions = {
  queue: string;
  disuseExpireMs: number;
};

type ReplyQueueConsumerDependencies = {
  amqpConnection: AmqpConnection;
  idGenerator: IdGenerator;
};

export class ReplyQueueConsumer {
  private readonly emitter: EventEmitter;
  private readonly disuseExpireMs: number;
  private readonly amqpConnection: AmqpConnection;

  private isDisposed: boolean;
  private consumerTag: null | string = null;

  readonly replyQueue: string;

  constructor(
    { queue, disuseExpireMs }: ReplyQueueConsumerOptions,
    { amqpConnection, idGenerator }: ReplyQueueConsumerDependencies,
  ) {
    this.emitter = new EventEmitter();

    this.disuseExpireMs = disuseExpireMs;
    this.amqpConnection = amqpConnection;

    this.isDisposed = false;
    this.replyQueue = `${queue}:replies:${idGenerator.generate()}`;

    this.handleReplyQueueMessage = this.handleReplyQueueMessage.bind(this);
  }

  async consume() {
    await this.amqpConnection.assertQueue({
      queue: this.replyQueue,
      durable: false,
      exclusive: false,
      autoDelete: false,
      disuseExpireMs: this.disuseExpireMs,
    });

    if (this.isDisposed) return;

    this.consumerTag = await this.amqpConnection.consumeQueue(
      this.replyQueue,
      this.handleReplyQueueMessage,
      { requiresAcknowledgement: true },
    );

    if (this.isDisposed) {
      // rollback
      await this.cancelConsumption();
    }
  }

  private async handleReplyQueueMessage(message: any) {
    if (this.isDisposed) return;

    // See: http://www.squaremobius.net/amqp.node/channel_api.html#channelconsume
    // "If the consumer is cancelled by RabbitMQ, the message callback will be invoked with null."
    if (!message) {
      await this.consume();
      return;
    }

    this.emitter.emit('message', message);
  }

  async dispose() {
    this.isDisposed = true;
    await this.cancelConsumption();
  }

  /** @private */
  async cancelConsumption() {
    if (!this.consumerTag) return;

    const consumerTag = this.consumerTag;
    this.consumerTag = null;

    try {
      await this.amqpConnection.cancelConsumption(consumerTag);
    } catch (error) {
      // ignore
    }
  }

  on(event: string, listener: (...args: any[]) => any) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: (...args: any[]) => any) {
    this.emitter.removeListener(event, listener);
  }
}
