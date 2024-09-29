import { ExchangeType } from '../types';
import { AmqpConnectionInterface, JsonBufferSerializer } from '../core';
import { ObjectUtil, StringUtil } from '../utils';

type PubSubOptions = {
  queueNamePattern: string;
};

type PubSubDependencies = {
  amqpConnection: AmqpConnectionInterface;
  jsonBufferSerializer: JsonBufferSerializer;
};

type PublishOptions = {
  exchangeType?: ExchangeType;
  routingKey?: string;
};

type SubscribeOptions = PublishOptions & {
  queueName?: string;
  autoDeleteQueue?: boolean;
  singleActiveConsumer?: boolean;
};

export class PubSub {
  private readonly amqpConnection: AmqpConnectionInterface;
  private readonly jsonBufferSerializer: JsonBufferSerializer;
  private readonly topicToConsumerTags: Map<string, Set<string>> = new Map();
  private queueNamePattern: string;

  constructor(
    { queueNamePattern }: PubSubOptions,
    { amqpConnection, jsonBufferSerializer }: PubSubDependencies,
  ) {
    this.amqpConnection = amqpConnection;
    this.jsonBufferSerializer = jsonBufferSerializer;

    this.queueNamePattern = queueNamePattern;
  }

  async subscribe(
    topic: string,
    handler: (payload: any) => void,
    {
      queueName,
      exchangeType,
      routingKey,
      singleActiveConsumer = true,
      autoDeleteQueue = false,
    }: SubscribeOptions = {},
  ) {
    await this.assertExchange(topic, { exchangeType });

    queueName = queueName || this.generateQueueName(topic);

    await this.amqpConnection.assertQueue({
      queue: queueName,
      durable: true,
      exclusive: false,
      autoDelete: autoDeleteQueue,
      singleActiveConsumer,
    });

    await this.amqpConnection.bindQueue({
      queue: queueName,
      exchange: topic,
      ...ObjectUtil.removeBlankFields({
        routingKey,
      }),
    });

    // TODO: Re-consume on null message
    const consumerTag = await this.amqpConnection.consumeQueue(
      queueName,
      async (message) => {
        const payload = this.jsonBufferSerializer.deserialize(message.content);
        handler(payload);
      },
    );

    const consumerTags = this.getConsumerTags(topic);
    consumerTags.add(consumerTag);
    this.topicToConsumerTags.set(topic, consumerTags);

    return consumerTag;
  }

  async unsubscribe(topic: string, consumerTag?: string) {
    const consumerTags = this.getConsumerTags(topic);

    if (consumerTag) {
      await this.amqpConnection.cancelConsumption(consumerTag);
      consumerTags.delete(consumerTag);
      this.topicToConsumerTags.set(topic, consumerTags);
    } else {
      for (const consumerTag of consumerTags) {
        await this.amqpConnection.cancelConsumption(consumerTag);
        this.topicToConsumerTags.delete(topic);
      }
    }
  }

  async publish(topic: string, payload: any, options: PublishOptions = {}) {
    await this.assertExchange(topic, options);
    await this.amqpConnection.publishToExchange(
      topic,
      this.jsonBufferSerializer.serialize(payload),
      options.routingKey ? { routingKey: options.routingKey } : {},
    );
  }

  private async assertExchange(
    topic: string,
    { exchangeType = ExchangeType.FANOUT }: PublishOptions = {},
  ) {
    return await this.amqpConnection.assertExchange({
      exchange: topic,
      type: exchangeType,
      durable: true,
      autoDelete: false,
    });
  }

  private getConsumerTags(topic: string) {
    return this.topicToConsumerTags.get(topic) || new Set();
  }

  private generateQueueName(topic: string) {
    const consumerTags = this.getConsumerTags(topic);
    return StringUtil.substitute(this.queueNamePattern, {
      topic,
      consumerNumber: consumerTags.size + 1,
    });
  }
}
