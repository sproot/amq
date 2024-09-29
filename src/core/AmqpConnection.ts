import EventEmitter from 'events';
import {
  connect as AmqplibConnect,
  Connection as AmqplibConnection,
  Message as AmqplibMessage,
} from 'amqplib';

import type { FactoryFor } from '../utils/SimpleFactory';
import type { AmqpDisposer } from './AmqpDisposer';
import type { AmqpChannelContainer } from './AmqpChannelContainer';
import type { AmqpChannelProvider } from './AmqpChannelProvider';
import type { AmqpChannelExecutor } from './AmqpChannelExecutor';
import { ConnectionClosedError } from '../core/errors';
import { ExchangeType } from './types';
import { ObjectUtil } from '../utils/ObjectUtil';
import { AmqpConnectionInterface } from './AmqpConnectionInterface';

export type AmqpConnectionOptions = {
  protocol: string;
  hostname: string;
  port: number;
  username: string;
  password: string;
  vhost: string;
  commandTimeoutMs: number;
  commandRetryIntervalMs: number;
};

export type AmqpConnectionDependencies = {
  amqplibConnect: typeof AmqplibConnect;
  amqpDisposer: AmqpDisposer;
  amqpChannelContainer: AmqpChannelContainer;
  amqpChannelProviderFactory: FactoryFor<AmqpChannelProvider>;
  amqpChannelExecutorFactory: FactoryFor<AmqpChannelExecutor>;
};

/**
 * @emits AmqpConnection#error
 * @emits AmqpConnection#return
 * @emits AmqpConnection#closed
 * @emits AmqpConnection#channelRecreated
 */
export class AmqpConnection implements AmqpConnectionInterface {
  private readonly emitter: EventEmitter;
  private readonly amqplibConnect: typeof AmqplibConnect;

  private readonly protocol: string;
  private readonly hostname: string;
  private readonly port: number;
  private readonly username: string;
  private readonly password: string;
  private readonly vhost: string;

  private readonly amqpDisposer: AmqpDisposer;
  private readonly amqpChannelContainer: AmqpChannelContainer;
  private readonly amqpChannelProviderFactory: FactoryFor<AmqpChannelProvider>;

  private amqplibConnection: AmqplibConnection | null = null;
  private amqpChannelProvider: AmqpChannelProvider | null = null;
  private amqpChannelExecutor: AmqpChannelExecutor;

  private isDisposed = false;
  private isRecreatingChannel = false;

  constructor(
    {
      protocol,
      hostname,
      port,
      username,
      password,
      vhost,
      commandTimeoutMs,
      commandRetryIntervalMs,
    }: AmqpConnectionOptions,
    {
      amqplibConnect,
      amqpDisposer,
      amqpChannelContainer,
      amqpChannelProviderFactory,
      amqpChannelExecutorFactory,
    }: AmqpConnectionDependencies,
  ) {
    // We don't need to check for types in the typescript,
    // but since this library could potentially be used in a
    // javascript environment, such checks are necessary.
    if (!protocol) throw new Error('"options.protocol" is required');
    if (!hostname) throw new Error('"options.hostname" is required');
    if (!username) throw new Error('"options.username" is required');
    if (!password) throw new Error('"options.password" is required');
    if (!vhost) throw new Error('"options.vhost" is required');

    if (typeof protocol !== 'string' || !['amqp', 'amqps'].includes(protocol))
      throw new Error('"options.protocol" must be "amqp" or "amqps"');
    if (typeof port !== 'number' || port < 1)
      throw new Error('"options.port" must be 1 or greater');
    if (typeof commandTimeoutMs !== 'number' || commandTimeoutMs < 1)
      throw new Error('"options.commandTimeoutMs" must be 1 or greater');
    if (
      typeof commandRetryIntervalMs !== 'number' ||
      commandRetryIntervalMs < 1
    )
      throw new Error('"options.commandRetryIntervalMs" must be 1 or greater');

    this.amqplibConnect = amqplibConnect;
    this.protocol = protocol;
    this.hostname = hostname;
    this.port = port;
    this.username = username;
    this.password = password;
    this.vhost = vhost;

    this.amqpDisposer = amqpDisposer;
    this.amqpChannelContainer = amqpChannelContainer;
    this.amqpChannelProviderFactory = amqpChannelProviderFactory;
    this.amqpChannelExecutor = amqpChannelExecutorFactory.create(
      {
        commandTimeoutMs,
        commandRetryIntervalMs,
      },
      {
        amqpChannelContainer: this.amqpChannelContainer,
      },
    );

    // ignore unhandled "error" events
    this.emitter = new EventEmitter().on('error', () => {});

    this.handleConnectionClose = this.handleConnectionClose.bind(this);
    this.handleChannelClose = this.handleChannelClose.bind(this);
    this.handleError = this.handleError.bind(this);
    this.handleReturn = this.handleReturn.bind(this);
    this.handleChannelBecameUnavailable =
      this.handleChannelBecameUnavailable.bind(this);
    this.handleConnectionClosing = this.handleConnectionClosing.bind(this);
  }

  async connect() {
    this.amqplibConnection = await this.amqplibConnect({
      protocol: this.protocol,
      hostname: this.hostname,
      port: this.port,
      username: this.username,
      password: this.password,
      vhost: this.vhost,
    });

    this.amqplibConnection.on('error', () => {}); // ignore unhandled "error" events

    this.amqpChannelProvider = this.amqpChannelProviderFactory.create(
      this.amqplibConnection,
    );

    let channel;
    try {
      channel = await this.amqpChannelProvider.create();
    } catch (error) {
      this.isDisposed = true;
      await this.amqpDisposer.disposeConnection(this.amqplibConnection);
      throw error;
    }

    if (this.isDisposed) {
      // rollback
      await this.amqpDisposer.disposeChannel(channel);
      return;
    }

    this.amqpChannelContainer.set(channel);
    this.amqplibConnection.on('close', this.handleConnectionClose);
    this.amqplibConnection.on('error', this.handleError);
    this.amqpChannelContainer.on('close', this.handleChannelClose);
    this.amqpChannelContainer.on('error', this.handleError);
    this.amqpChannelContainer.on('return', this.handleReturn);
    this.amqpChannelExecutor.on(
      'channelBecameUnavailable',
      this.handleChannelBecameUnavailable,
    );
    this.amqpChannelExecutor.on(
      'connectionClosing',
      this.handleConnectionClosing,
    );
  }

  private handleConnectionClose() {
    this.emitter.emit('closed');
    /** no await */ this.dispose();
  }

  private handleChannelClose() {
    /** no await */ this.recreateChannel();
  }

  private handleConnectionClosing() {
    this.emitter.emit('closed');
    /** no await */ this.dispose();
  }

  private handleError(error: Error) {
    this.emitter.emit('error', error);
  }

  private handleReturn(message: AmqplibMessage) {
    this.emitter.emit('return', message.properties.correlationId);
  }

  private handleChannelBecameUnavailable() {
    /** no await */ this.recreateChannel();
  }

  /** @private */
  async recreateChannel() {
    if (this.isRecreatingChannel) return;
    this.isRecreatingChannel = true;
    const oldChannel = this.amqpChannelContainer.get();
    this.amqpChannelContainer.set(null);
    if (oldChannel) {
      this.amqpDisposer.disposeChannel(oldChannel);
    }
    try {
      if (!this.amqpChannelProvider) return;
      const channel = await this.amqpChannelProvider.create();
      if (this.isDisposed) {
        this.amqpDisposer.disposeChannel(channel);
        return;
      }
      this.amqpChannelContainer.set(channel);
      this.amqpChannelExecutor.resumeAll();
      this.emitter.emit('channelRecreated');
    } catch (error) {
      if (this.isDisposed) return;
      this.emitter.emit('error', error);
      this.emitter.emit('closed');
      await this.dispose();
    } finally {
      this.isRecreatingChannel = false;
    }
  }

  async dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.amqpChannelExecutor.removeListener(
      'connectionClosing',
      this.handleConnectionClosing,
    );
    this.amqpChannelExecutor.removeListener(
      'channelBecameUnavailable',
      this.handleChannelBecameUnavailable,
    );
    this.amqpChannelExecutor.cancelAll(new ConnectionClosedError());
    this.amqpChannelContainer.set(null);
    this.amqpChannelContainer.removeListener('close', this.handleChannelClose);
    this.amqpChannelContainer.removeListener('error', this.handleError);
    this.amqpChannelContainer.removeListener('return', this.handleReturn);
    if (this.amqplibConnection) {
      this.amqplibConnection.removeListener(
        'close',
        this.handleConnectionClose,
      );
      this.amqplibConnection.removeListener('error', this.handleError);
      this.amqpDisposer.disposeConnection(this.amqplibConnection);
    }
    await this.amqpDisposer.flush();
  }

  async assertQueue({
    queue = '',
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
  }) {
    return this.amqpChannelExecutor.execute(
      async (channel) => {
        const assertionResult = await channel.assertQueue(
          queue,
          ObjectUtil.removeBlankFields(
            {
              durable,
              exclusive,
              autoDelete,
              expires: disuseExpireMs,
              deadLetterExchange,
              deadLetterRoutingKey,
              arguments: {
                'x-single-active-consumer': singleActiveConsumer,
              },
            },
            { removeEmptyObjects: true, deep: true },
          ),
        );
        return assertionResult.queue;
      },
      { retryOnError: true },
    );
  }

  async deleteQueue(queue: string) {
    await this.amqpChannelExecutor.execute(
      async (channel) => channel.deleteQueue(queue),
      { retryOnError: true },
    );
  }

  async assertExchange({
    exchange,
    type,
    durable,
    autoDelete,
  }: {
    exchange: string;
    type: ExchangeType;
    durable?: boolean;
    autoDelete?: boolean;
  }) {
    if (!Object.values(ExchangeType).includes(type)) {
      throw new Error(`Invalid exchange type: ${type}`);
    }

    await this.amqpChannelExecutor.execute(
      async (channel) =>
        channel.assertExchange(exchange, type, {
          durable,
          autoDelete,
        }),
      { retryOnError: true },
    );
  }

  async setChannelPrefetchCount(count: number) {
    // https://www.rabbitmq.com/consumer-prefetch.html
    // shared across all consumers on the channel (global: true)
    await this.amqpChannelExecutor.execute(
      async (channel) => channel.prefetch(count, true),
      { retryOnError: true },
    );
  }

  async setConsumerPrefetchCount(count: number) {
    // https://www.rabbitmq.com/consumer-prefetch.html
    // applied to the new consumers (global: false)
    await this.amqpChannelExecutor.execute(
      async (channel) => channel.prefetch(count, false),
      { retryOnError: true },
    );
  }

  async bindQueue({
    queue,
    exchange,
    routingKey = '',
  }: {
    queue: string;
    exchange: string;
    routingKey?: string;
  }) {
    await this.amqpChannelExecutor.execute(
      async (channel) => channel.bindQueue(queue, exchange, routingKey),
      { retryOnError: true },
    );
  }

  async consumeQueue(
    queue: string,
    handler: (...args: any[]) => void,
    {
      requiresAcknowledgement = false,
    }: { requiresAcknowledgement?: boolean } = {},
  ) {
    return this.amqpChannelExecutor.execute(
      async (channel) => {
        const consumeResult = await channel.consume(
          queue,
          (message) =>
            handler({
              content: message?.content,
              correlationId: message?.properties.correlationId,
              deliveryTag: message?.fields.deliveryTag,
              replyQueue: message?.properties.replyTo,
              headers: message?.properties.headers,
            }),
          { noAck: !requiresAcknowledgement },
        );
        return consumeResult.consumerTag;
      },
      { retryOnError: true },
    );
  }

  async acknowledge(deliveryTag: number) {
    await this.amqpChannelExecutor.execute(
      async (channel) =>
        channel.ack({ fields: { deliveryTag } } as AmqplibMessage),
      { retryOnError: false },
    );
  }

  async negativeAcknowledge(deliveryTag: number) {
    await this.amqpChannelExecutor.execute(
      async (channel) =>
        channel.nack({ fields: { deliveryTag } } as AmqplibMessage),
      { retryOnError: false },
    );
  }

  /**
   * NOTE: Consumer tag is unique for the current channel,
   *       therefore retrying is not supported for this command.
   */
  async cancelConsumption(consumerTag: string) {
    await this.amqpChannelExecutor.execute(
      async (channel) => channel.cancel(consumerTag),
      { retryOnError: false },
    );
  }

  async publishToExchange(
    exchange: string,
    dataBuffer: Buffer,
    {
      routingKey = '',
      correlationId,
      persistent = false,
      mandatory = false,
      expireMs,
    }: {
      routingKey?: string;
      correlationId?: string;
      persistent?: boolean;
      mandatory?: boolean;
      expireMs?: number;
    } = {},
  ) {
    await this.amqpChannelExecutor.execute(
      async (channel) => {
        return new Promise((resolve, reject) => {
          channel.publish(
            exchange,
            routingKey,
            dataBuffer,
            {
              correlationId,
              persistent,
              mandatory,
              expiration: expireMs && String(expireMs),
            },
            (error) => (error ? reject(error) : resolve(undefined)),
          );
        });
      },
      { retryOnError: true },
    );
  }

  async sendToQueue(
    queue: string,
    dataBuffer: Buffer,
    {
      correlationId,
      replyQueue,
      mandatory = false,
      persistent = false,
      expireMs,
    }: {
      correlationId?: string;
      replyQueue?: string;
      mandatory?: boolean;
      persistent?: boolean;
      expireMs?: number;
    } = {},
  ) {
    await this.amqpChannelExecutor.execute(
      async (channel) => {
        return new Promise((resolve, reject) => {
          channel.sendToQueue(
            queue,
            dataBuffer,
            {
              correlationId,
              persistent,
              mandatory,
              replyTo: replyQueue,
              expiration: expireMs && String(expireMs),
            },
            (error) => (error ? reject(error) : resolve(undefined)),
          );
        });
      },
      { retryOnError: true },
    );
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: (...args: any[]) => void) {
    this.emitter.removeListener(event, listener);
  }
}
