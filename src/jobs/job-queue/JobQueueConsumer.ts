import { Message as AmqplibMessage } from 'amqplib';
import { EventEmitter } from 'events';

import { AmqpConnection } from '../../core';

type JobQueueConsumerOptions = {
  queue: string;
};

type JobQueueConsumerDependencies = {
  amqpConnection: AmqpConnection;
};

export class JobQueueConsumer {
  private readonly emitter: EventEmitter;

  private readonly queue: string;
  private readonly amqpConnection: AmqpConnection;

  private consumerTag: string | null = null;
  private isDisposed: boolean;

  constructor(
    { queue }: JobQueueConsumerOptions,
    { amqpConnection }: JobQueueConsumerDependencies,
  ) {
    this.emitter = new EventEmitter();

    this.queue = queue;
    this.amqpConnection = amqpConnection;
    this.isDisposed = false;

    this.handleJobQueueMessage = this.handleJobQueueMessage.bind(this);
  }

  async consume() {
    this.consumerTag = await this.amqpConnection.consumeQueue(
      this.queue,
      this.handleJobQueueMessage,
      { requiresAcknowledgement: true },
    );

    if (this.isDisposed) {
      // rollback
      await this.cancelConsumption();
    }
  }

  private async handleJobQueueMessage(message: AmqplibMessage) {
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

  on(event: string, listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: (...args: any[]) => void) {
    this.emitter.removeListener(event, listener);
  }
}
