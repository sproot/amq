import { AmqpConnection } from './AmqpConnection';
import { JsonBufferSerializer } from '../src/core';
import { PubSub as PubSubBase } from '../src/pub-sub/PubSub';

/**
 * The default queue name pattern is "{topic}:{consumerNumber}".
 * For example, if the topic is "user_created" the queue name pattern will be
 * "user_created:1" for the first consumer, "user_created:2" for the second
 * consumer, and so on.
 */
const QUEUE_NAME_PATTERN = '{topic}:{consumerNumber}';

type PubSubOptions = {
  amqpConnection: AmqpConnection;
  queueNamePattern?: string;
};

export class PubSub extends PubSubBase {
  constructor({
    amqpConnection,
    queueNamePattern = QUEUE_NAME_PATTERN,
  }: PubSubOptions) {
    super(
      { queueNamePattern },
      {
        amqpConnection,
        jsonBufferSerializer: new JsonBufferSerializer(),
      },
    );
  }
}
