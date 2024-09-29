import {
  AmqpConnectionInterface,
  JsonBufferSerializer,
} from '../../../src/core';
import { PubSub } from '../../../src/pub-sub/PubSub';
import { ExchangeType } from '../../../src/types';

describe('PubSub', () => {
  let pubSub: PubSub;
  let amqpConnection: jest.Mocked<AmqpConnectionInterface>;
  let jsonBufferSerializer: jest.Mocked<JsonBufferSerializer>;

  const queueNamePattern = '{topic}:{consumerNumber}';

  beforeEach(() => {
    amqpConnection = {
      assertQueue: jest.fn(),
      assertExchange: jest.fn(),
      bindQueue: jest.fn(),
      consumeQueue: jest.fn(async () =>
        (Math.random() + 1).toString(36).substring(7),
      ),
      publishToExchange: jest.fn(),
      cancelConsumption: jest.fn(),
    } as unknown as jest.Mocked<AmqpConnectionInterface>;

    jsonBufferSerializer = {
      serialize: jest.fn(),
      deserialize: jest.fn(),
    } as unknown as jest.Mocked<JsonBufferSerializer>;

    pubSub = new PubSub(
      { queueNamePattern },
      {
        amqpConnection,
        jsonBufferSerializer,
      },
    );
  });

  describe('subscribe', () => {
    it('should assert exchange', async () => {
      await pubSub.subscribe('fake-topic-name', () => {});

      expect(amqpConnection.assertExchange).toHaveBeenCalledWith({
        exchange: 'fake-topic-name',
        type: ExchangeType.FANOUT,
        durable: true,
        autoDelete: false,
      });
    });

    it('should assert queue with generated queue name', async () => {
      await pubSub.subscribe('fake-topic-name', () => {});

      expect(amqpConnection.assertQueue).toHaveBeenCalledWith({
        queue: 'fake-topic-name:1',
        durable: true,
        exclusive: false,
        autoDelete: false,
        singleActiveConsumer: true,
      });
    });

    it('asserts queue with custom queue name', async () => {
      await pubSub.subscribe('fake-topic-name', () => {}, {
        queueName: 'custom-queue-name',
      });

      expect(amqpConnection.assertQueue).toHaveBeenCalledWith({
        queue: 'custom-queue-name',
        durable: true,
        exclusive: false,
        autoDelete: false,
        singleActiveConsumer: true,
      });
    });

    it('should bind queue to exchange', async () => {
      await pubSub.subscribe('fake-topic-name', () => {});

      expect(amqpConnection.bindQueue).toHaveBeenCalledWith({
        queue: 'fake-topic-name:1',
        exchange: 'fake-topic-name',
      });
    });

    it('should bind queue to exchange with custom routing key', async () => {
      await pubSub.subscribe('fake-topic-name', () => {}, {
        routingKey: 'custom-routing-key',
      });

      expect(amqpConnection.bindQueue).toHaveBeenCalledWith({
        queue: 'fake-topic-name:1',
        exchange: 'fake-topic-name',
        routingKey: 'custom-routing-key',
      });
    });

    it('should consume queue', async () => {
      await pubSub.subscribe('fake-topic-name', () => {});

      expect(amqpConnection.consumeQueue).toHaveBeenCalledWith(
        'fake-topic-name:1',
        expect.any(Function),
      );
    });

    it('should consume queue with custom consumer options', async () => {
      await pubSub.subscribe('fake-topic-name', () => {}, {
        singleActiveConsumer: false,
        autoDeleteQueue: true,
      });

      expect(amqpConnection.consumeQueue).toHaveBeenCalledWith(
        'fake-topic-name:1',
        expect.any(Function),
      );
    });

    it('should call handler with deserialized payload', async () => {
      const handler = jest.fn();
      const message = { content: 'fake-content' };
      const payload = { fake: 'payload' };

      jsonBufferSerializer.deserialize.mockReturnValue(payload);

      await pubSub.subscribe('fake-topic-name', handler);

      const consumeHandler = amqpConnection.consumeQueue.mock.calls[0][1];
      consumeHandler(message);

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('should return consumer tag', async () => {
      amqpConnection.consumeQueue.mockResolvedValue('fake-consumer-tag');

      const consumerTag = await pubSub.subscribe('fake-topic-name', () => {});

      expect(consumerTag).toBe('fake-consumer-tag');
    });

    it('should subscribe to multiple topics', async () => {
      await pubSub.subscribe('fake-topic-name-1', () => {});
      await pubSub.subscribe('fake-topic-name-2', () => {});

      expect(amqpConnection.assertExchange).toHaveBeenCalledTimes(2);
      expect(amqpConnection.assertQueue).toHaveBeenCalledTimes(2);
      expect(amqpConnection.bindQueue).toHaveBeenCalledTimes(2);
      expect(amqpConnection.consumeQueue).toHaveBeenCalledTimes(2);
    });

    it('should subscribe to same topic multiple times', async () => {
      await pubSub.subscribe('fake-topic-name', () => {});
      await pubSub.subscribe('fake-topic-name', () => {});

      expect(amqpConnection.assertExchange).toHaveBeenCalledWith(
        expect.objectContaining({ exchange: 'fake-topic-name' }),
      );

      expect(amqpConnection.assertQueue).toHaveBeenCalledWith(
        expect.objectContaining({ queue: 'fake-topic-name:1' }),
      );
      expect(amqpConnection.bindQueue).toHaveBeenCalledWith(
        expect.objectContaining({ queue: 'fake-topic-name:1' }),
      );
      expect(amqpConnection.consumeQueue).toHaveBeenCalledWith(
        'fake-topic-name:1',
        expect.any(Function),
      );

      expect(amqpConnection.assertQueue).toHaveBeenCalledWith(
        expect.objectContaining({ queue: 'fake-topic-name:2' }),
      );
      expect(amqpConnection.bindQueue).toHaveBeenCalledWith(
        expect.objectContaining({ queue: 'fake-topic-name:2' }),
      );
      expect(amqpConnection.consumeQueue).toHaveBeenCalledWith(
        'fake-topic-name:2',
        expect.any(Function),
      );
    });
  });

  describe('unsubscribe', () => {
    it('should cancel consumption', async () => {
      const consumerTag = 'fake-consumer-tag';

      await pubSub.subscribe('fake-topic-name', () => {});

      await pubSub.unsubscribe('fake-topic-name', consumerTag);

      expect(amqpConnection.cancelConsumption).toHaveBeenCalledWith(
        consumerTag,
      );
    });

    it('should cancel consumption for all consumer tags', async () => {
      await pubSub.subscribe('fake-topic-name', () => {});
      await pubSub.subscribe('fake-topic-name', () => {});

      await pubSub.unsubscribe('fake-topic-name');

      expect(amqpConnection.cancelConsumption).toHaveBeenCalledTimes(2);
    });

    it('should not cancel consumption for other topics', async () => {
      await pubSub.subscribe('fake-topic-name-1', () => {});
      await pubSub.subscribe('fake-topic-name-2', () => {});

      await pubSub.unsubscribe('fake-topic-name-1');

      expect(amqpConnection.cancelConsumption).toHaveBeenCalledTimes(1);
    });

    it('should not cancel consumption for other consumer tags', async () => {
      amqpConnection.consumeQueue
        .mockResolvedValueOnce('fake-consumer-tag-1')
        .mockResolvedValueOnce('fake-consumer-tag-2');

      await pubSub.subscribe('fake-topic-name', () => {});
      await pubSub.subscribe('fake-topic-name', () => {});

      await pubSub.unsubscribe('fake-topic-name', 'fake-consumer-tag-2');

      expect(amqpConnection.cancelConsumption).toHaveBeenCalledTimes(1);
    });
  });

  describe('publish', () => {
    const topic = 'fake-topic-name';
    const payload = Buffer.from('fake-data');

    beforeEach(() => {
      jsonBufferSerializer.serialize.mockReturnValue(payload);
    });

    it('should assert exchange', async () => {
      await pubSub.publish(topic, {});

      expect(amqpConnection.assertExchange).toHaveBeenCalledWith({
        exchange: topic,
        type: ExchangeType.FANOUT,
        durable: true,
        autoDelete: false,
      });
    });

    it('should publish to exchange', async () => {
      await pubSub.publish(topic, 'fake-data');

      expect(amqpConnection.publishToExchange).toHaveBeenCalledWith(
        'fake-topic-name',
        payload,
        {},
      );
    });

    it('should publish to exchange with custom routing key', async () => {
      await pubSub.publish('fake-topic-name', payload, {
        routingKey: 'custom-routing-key',
      });

      expect(amqpConnection.publishToExchange).toHaveBeenCalledWith(
        'fake-topic-name',
        payload,
        { routingKey: 'custom-routing-key' },
      );
    });

    it('should publish to exchange with custom exchange type', async () => {
      const exchangeType = ExchangeType.TOPIC;

      await pubSub.publish('fake-topic-name', payload, { exchangeType });

      expect(amqpConnection.assertExchange).toHaveBeenCalledWith({
        exchange: topic,
        type: exchangeType,
        durable: true,
        autoDelete: false,
      });
    });
  });
});
