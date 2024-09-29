import { EventEmitter } from 'events';
import { ConnectionClosedError } from './errors';
import { FactoryFor } from '../utils/SimpleFactory';
import { AmqpConnectionInitializer } from './AmqpConnectionInitializer';
import { AmqpConnectionProvider } from './AmqpConnectionProvider';
import { AmqpConnectionExecutor } from './AmqpConnectionExecutor';
import { AmqpConnectionContainer } from './AmqpConnectionContainer';
import { ExchangeType } from './types';
import { AmqpConnectionInterface } from './AmqpConnectionInterface';

export type AmqpConnectionWrapperOptions = {
  maxConnectionAttempts: number;
  commandTimeoutMs: number;
  commandRetryIntervalMs: number;
  staleCommandDurationMs: number;
  connectionAttemptTimeoutBase: number;
  connectionAttemptTimeoutMultiplier: number;
};

type AmqpConnectionWrapperDependencies = {
  amqpConnectionProvider: AmqpConnectionProvider;
  amqpConnectionContainerFactory: FactoryFor<AmqpConnectionContainer>;
  amqpConnectionInitializerFactory: FactoryFor<AmqpConnectionInitializer>;
  amqpConnectionExecutorFactory: FactoryFor<AmqpConnectionExecutor>;
};

enum AmqpConnectionState {
  Ready = 'ready',
  Connected = 'connected',
  Disposed = 'disposed',
}

/**
 * Wraps over an AMQP connection, and reconnects when the connection has been closed.
 * Uses an AMQP connection provider to create AMQP connection.
 *
 * @emits AmqpConnectionWrapper#error
 * @emits AmqpConnectionWrapper#closed
 * @emits AmqpConnectionWrapper#return
 * @emits AmqpConnectionWrapper#reconnected
 * @emits AmqpConnectionWrapper#channelRecreated
 */
export class AmqpConnectionWrapper implements AmqpConnectionInterface {
  private readonly emitter: EventEmitter = new EventEmitter();

  private readonly amqpConnectionContainer: AmqpConnectionContainer;
  private readonly amqpConnectionInitializer: AmqpConnectionInitializer;
  private readonly amqpConnectionExecutor: AmqpConnectionExecutor;

  private state: AmqpConnectionState = AmqpConnectionState.Ready;
  private isReconnecting = false;

  constructor(
    {
      maxConnectionAttempts,
      commandTimeoutMs,
      commandRetryIntervalMs,
      staleCommandDurationMs,
      connectionAttemptTimeoutBase,
      connectionAttemptTimeoutMultiplier,
    }: AmqpConnectionWrapperOptions,
    {
      amqpConnectionProvider,
      amqpConnectionContainerFactory,
      amqpConnectionInitializerFactory,
      amqpConnectionExecutorFactory,
    }: AmqpConnectionWrapperDependencies,
  ) {
    if (typeof maxConnectionAttempts !== 'number' || maxConnectionAttempts < 1)
      throw new Error('"options.maxConnectionAttempts" must be 1 or greater');
    if (typeof commandTimeoutMs !== 'number' || commandTimeoutMs < 1)
      throw new Error('"options.commandTimeoutMs" must be 1 or greater');
    if (
      typeof commandRetryIntervalMs !== 'number' ||
      commandRetryIntervalMs < 1
    )
      throw new Error('"options.commandRetryIntervalMs" must be 1 or greater');
    if (
      typeof staleCommandDurationMs !== 'number' ||
      staleCommandDurationMs < 1
    )
      throw new Error('"options.staleCommandDurationMs" must be 1 or greater');
    if (
      typeof connectionAttemptTimeoutBase !== 'number' ||
      connectionAttemptTimeoutBase < 1
    )
      throw new Error(
        '"options.connectionAttemptTimeoutBase" must be 1 or greater',
      );
    if (
      typeof connectionAttemptTimeoutMultiplier !== 'number' ||
      connectionAttemptTimeoutMultiplier <= 0
    )
      throw new Error(
        '"options.connectionAttemptTimeoutMultiplier" must be a positive number',
      );

    this.emitter.on('error', () => {}); // ignore unhandled "error" events

    this.amqpConnectionContainer = amqpConnectionContainerFactory.create();

    this.amqpConnectionInitializer = amqpConnectionInitializerFactory.create(
      {
        maxAttempts: maxConnectionAttempts,
        attemptTimeoutBase: connectionAttemptTimeoutBase,
        attemptTimeoutMultiplier: connectionAttemptTimeoutMultiplier,
      },
      {
        amqpConnectionProvider,
      },
    );

    this.amqpConnectionExecutor = amqpConnectionExecutorFactory.create(
      {
        commandTimeoutMs,
        commandRetryIntervalMs,
        staleCommandDurationMs,
      },
      {
        amqpConnectionContainer: this.amqpConnectionContainer,
      },
    );
    this.amqpConnectionExecutor.on('staleCommand', (...args) =>
      this.emitter.emit('staleCommand', ...args),
    );

    this.handleError = this.handleError.bind(this);
    this.handleConnectionClosed = this.handleConnectionClosed.bind(this);
    this.handleConnectionReturn = this.handleConnectionReturn.bind(this);
    this.handleChannelRecreated = this.handleChannelRecreated.bind(this);
    this.handleConnectionBecameUnavailable =
      this.handleConnectionBecameUnavailable.bind(this);
  }

  async connect() {
    if (this.state === AmqpConnectionState.Connected)
      throw new Error('AMQP connection is already (being) established');
    if (this.state === AmqpConnectionState.Disposed)
      throw new Error('AMQP connection cannot be reused after being disposed');
    this.state = AmqpConnectionState.Connected;

    this.amqpConnectionInitializer.on('error', this.handleError);

    let amqpConnection;

    try {
      amqpConnection =
        await this.amqpConnectionInitializer.initializeConnection();
    } catch (error) {
      this.state = AmqpConnectionState.Disposed;
      throw error;
    }

    if (amqpConnection && String(this.state) === AmqpConnectionState.Disposed) {
      // rollback
      await amqpConnection.dispose();
      return;
    }

    this.amqpConnectionContainer.set(amqpConnection);

    this.amqpConnectionContainer.on('error', this.handleError);
    this.amqpConnectionContainer.on('closed', this.handleConnectionClosed);
    this.amqpConnectionContainer.on('return', this.handleConnectionReturn);
    this.amqpConnectionContainer.on(
      'channelRecreated',
      this.handleChannelRecreated,
    );

    this.amqpConnectionExecutor.on(
      'connectionBecameUnavailable',
      this.handleConnectionBecameUnavailable,
    );
  }

  private handleError(error: Error) {
    this.emitter.emit('error', error);
  }

  private handleConnectionClosed() {
    /** no await */ this.reconnect();
  }

  private handleConnectionBecameUnavailable() {
    /** no await */ this.reconnect();
  }

  /** @private */
  async reconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;

    const oldConnection = this.amqpConnectionContainer.get();
    this.amqpConnectionContainer.set(null);
    if (oldConnection) {
      await oldConnection.dispose();
    }

    try {
      const amqpConnection =
        await this.amqpConnectionInitializer.initializeConnection();
      if (this.state === AmqpConnectionState.Disposed && amqpConnection) {
        // rollback
        await amqpConnection.dispose();
        return;
      }

      this.amqpConnectionContainer.set(amqpConnection);
      this.amqpConnectionExecutor.resumeAll();
      this.emitter.emit('reconnected');
    } catch (error) {
      if (this.state === AmqpConnectionState.Disposed) return;
      this.emitter.emit('error', error);
      this.emitter.emit('closed');
      await this.dispose();
    } finally {
      this.isReconnecting = false;
    }
  }

  private handleConnectionReturn(correlationId: string) {
    this.emitter.emit('return', correlationId);
  }

  private handleChannelRecreated() {
    this.emitter.emit('channelRecreated');
  }

  async dispose() {
    if (this.state === AmqpConnectionState.Ready) return;
    if (this.state === AmqpConnectionState.Disposed) return;
    this.state = AmqpConnectionState.Disposed;

    this.amqpConnectionExecutor.removeListener(
      'connectionBecameUnavailable',
      this.handleConnectionBecameUnavailable,
    );
    this.amqpConnectionExecutor.cancelAll(new ConnectionClosedError());

    this.amqpConnectionContainer.removeListener('error', this.handleError);
    this.amqpConnectionContainer.removeListener(
      'closed',
      this.handleConnectionClosed,
    );
    this.amqpConnectionContainer.removeListener(
      'return',
      this.handleConnectionReturn,
    );
    this.amqpConnectionContainer.removeListener(
      'channelRecreated',
      this.handleChannelRecreated,
    );
    this.amqpConnectionInitializer.removeListener('error', this.handleError);

    const amqpConnection = this.amqpConnectionContainer.get();
    this.amqpConnectionContainer.set(null);

    this.amqpConnectionInitializer.cancel();

    if (amqpConnection) {
      await amqpConnection.dispose();
    }
  }

  async assertQueue({
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
  }) {
    return this.amqpConnectionExecutor.execute({
      command: 'assertQueue',
      args: [
        {
          queue,
          durable,
          exclusive,
          autoDelete,
          disuseExpireMs,
          deadLetterExchange,
          deadLetterRoutingKey,
          singleActiveConsumer,
        },
      ],
      retryOnError: true,
    });
  }

  async deleteQueue(queue: string) {
    await this.amqpConnectionExecutor.execute({
      command: 'deleteQueue',
      args: [queue],
      retryOnError: true,
    });
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
    await this.amqpConnectionExecutor.execute({
      command: 'assertExchange',
      args: [
        {
          exchange,
          type,
          durable,
          autoDelete,
        },
      ],
      retryOnError: true,
    });
  }

  async setChannelPrefetchCount(count: number) {
    await this.amqpConnectionExecutor.execute({
      command: 'setChannelPrefetchCount',
      args: [count],
      retryOnError: true,
    });
  }

  async setConsumerPrefetchCount(count: number) {
    await this.amqpConnectionExecutor.execute({
      command: 'setConsumerPrefetchCount',
      args: [count],
      retryOnError: true,
    });
  }

  async bindQueue({
    queue,
    exchange,
    routingKey,
  }: {
    queue: string;
    exchange: string;
    routingKey?: string;
  }) {
    await this.amqpConnectionExecutor.execute({
      command: 'bindQueue',
      args: [
        {
          queue,
          exchange,
          routingKey,
        },
      ],
      retryOnError: true,
    });
  }

  /**
   * NOTE: Handler will be executed with "null" argument when the consumer is cancelled.
   * See: http://www.squaremobius.net/amqp.node/channel_api.html#channelconsume
   */
  async consumeQueue(
    queue: string,
    handler: (...args: any[]) => void,
    {
      requiresAcknowledgement = false,
    }: { requiresAcknowledgement?: boolean } = {},
  ) {
    return this.amqpConnectionExecutor.execute({
      command: 'consumeQueue',
      args: [queue, handler, { requiresAcknowledgement }],
      retryOnError: true,
    });
  }

  /**
   * NOTE: Delivery tag is unique for the current channel,
   *       therefore retrying is not supported for this command.
   *       You should wrap this method in a try-catch statement!
   */
  async acknowledge(deliveryTag: number) {
    await this.amqpConnectionExecutor.execute({
      command: 'acknowledge',
      args: [deliveryTag],
      retryOnError: false,
    });
  }

  /**
   * NOTE: Delivery tag is unique for the current channel,
   *       therefore retrying is not supported for this command.
   *       You should wrap this method in a try-catch statement!
   */
  async negativeAcknowledge(deliveryTag: number) {
    await this.amqpConnectionExecutor.execute({
      command: 'negativeAcknowledge',
      args: [deliveryTag],
      retryOnError: false,
    });
  }

  /**
   * NOTE: Consumer tag is unique for the current channel,
   *       therefore retrying is not supported for this command.
   *       You should wrap this method in a try-catch statement!
   */
  async cancelConsumption(consumerTag: string) {
    await this.amqpConnectionExecutor.execute({
      command: 'cancelConsumption',
      args: [consumerTag],
      retryOnError: false,
    });
  }

  async publishToExchange(
    exchange: string,
    dataBuffer: Buffer,
    {
      correlationId,
      routingKey,
      persistent,
      mandatory,
      expireMs,
    }: {
      routingKey?: string;
      correlationId?: string;
      persistent?: boolean;
      mandatory?: boolean;
      expireMs?: number;
    } = {},
  ) {
    await this.amqpConnectionExecutor.execute({
      command: 'publishToExchange',
      args: [
        exchange,
        dataBuffer,
        {
          correlationId,
          routingKey,
          persistent,
          mandatory,
          expireMs,
        },
      ],
      retryOnError: true,
    });
  }

  async sendToQueue(
    queue: string,
    dataBuffer: Buffer,
    {
      correlationId,
      replyQueue,
      persistent,
      mandatory,
      expireMs,
    }: {
      correlationId?: string;
      replyQueue?: string;
      mandatory?: boolean;
      persistent?: boolean;
      expireMs?: number;
    } = {},
  ) {
    await this.amqpConnectionExecutor.execute({
      command: 'sendToQueue',
      args: [
        queue,
        dataBuffer,
        {
          correlationId,
          replyQueue,
          persistent,
          mandatory,
          expireMs,
        },
      ],
      retryOnError: true,
    });
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: (...args: any[]) => void) {
    this.emitter.removeListener(event, listener);
  }
}
