import { EventEmitter } from 'events';
import { AmqpConnectionInterface, JsonBufferSerializer } from '../../core';
import { CommandHandlerManager } from './CommandHandlerManager';
import { CommandHandlerValidator } from './CommandHandlerValidator';
import { MessageRelevancyChecker } from '../../MessageRelevancyChecker';
import { CommandReceiver } from './command-receiver/CommandReceiver';
import { FactoryFor } from '../../utils/SimpleFactory';
import { ErrorSerializer } from '../errors/ErrorSerializer';
import { CommandQueueConsumer } from './command-receiver/CommandQueueConsumer';
import { CommandQueueInitializer } from './command-receiver/CommandQueueInitializer';

type RpcServerOptions = {
  queue: string;
  exchange: string;
  commandTimeoutMs: number;
  staleCommandDurationMs: number;
};

type RpcServerDependencies = {
  messageRelevancyCheckerFactory: FactoryFor<MessageRelevancyChecker>;
  commandHandlerManagerFactory: FactoryFor<CommandHandlerManager>;
  commandHandlerValidator: CommandHandlerValidator;
  commandReceiverFactory: FactoryFor<CommandReceiver>;
  commandQueueConsumerFactory: FactoryFor<CommandQueueConsumer>;
  commandQueueInitializerFactory: FactoryFor<CommandQueueInitializer>;
  amqpConnection: AmqpConnectionInterface;
  jsonBufferSerializer: JsonBufferSerializer;
  errorSerializer: ErrorSerializer;
};

enum RpcServerState {
  Ready = 'ready',
  Listening = 'listening',
  Disposed = 'disposed',
}

type CommandMessageContent = {
  command: string;
  args: any[];
};

type CommandMessage = {
  content: Buffer;
  correlationId: string;
  replyQueue: string;
  deliveryTag: number;
};

export class RpcServer {
  private readonly emitter = new EventEmitter();
  private readonly amqpConnection: AmqpConnectionInterface;
  private readonly jsonBufferSerializer: JsonBufferSerializer;
  private readonly errorSerializer: ErrorSerializer;
  private readonly queue: string;
  private readonly commandTimeoutMs: number;
  private readonly staleCommandDurationMs: number;
  private readonly commandHandlerManager: CommandHandlerManager;
  private readonly messageRelevancyChecker: MessageRelevancyChecker;
  private readonly commandReceiver: CommandReceiver;

  private state: RpcServerState = RpcServerState.Ready;

  constructor(
    {
      queue,
      exchange,
      commandTimeoutMs,
      staleCommandDurationMs,
    }: RpcServerOptions,
    {
      messageRelevancyCheckerFactory,
      commandHandlerManagerFactory,
      commandHandlerValidator,
      commandReceiverFactory,
      commandQueueConsumerFactory,
      commandQueueInitializerFactory,
      amqpConnection,
      jsonBufferSerializer,
      errorSerializer,
    }: RpcServerDependencies,
  ) {
    if (!queue) throw new Error('"options.queue" is required');
    if (!exchange) throw new Error('"options.exchange" is required');
    if (typeof commandTimeoutMs !== 'number' || commandTimeoutMs < 1)
      throw new Error('"options.commandTimeoutMs" must be a positive number');
    if (
      typeof staleCommandDurationMs !== 'number' ||
      staleCommandDurationMs < 1
    )
      throw new Error(
        '"options.staleCommandDurationMs" must be a positive number',
      );
    if (!amqpConnection)
      throw new Error('"dependencies.amqpConnection" is required');

    this.amqpConnection = amqpConnection;
    this.jsonBufferSerializer = jsonBufferSerializer;
    this.errorSerializer = errorSerializer;

    this.queue = queue;
    this.commandTimeoutMs = commandTimeoutMs;
    this.staleCommandDurationMs = staleCommandDurationMs;

    this.commandHandlerManager = commandHandlerManagerFactory.create({
      commandHandlerValidator,
    });

    this.messageRelevancyChecker = messageRelevancyCheckerFactory.create();

    this.commandReceiver = commandReceiverFactory.create(
      {
        exchange,
        queue,
      },
      {
        amqpConnection,
        commandQueueConsumerFactory,
        commandQueueInitializerFactory,
      },
    );

    this.handleCommandMessage = this.handleCommandMessage.bind(this);
    this.handleAmqpReconnected = this.handleAmqpReconnected.bind(this);
    this.handleAmqpChannelRecreated =
      this.handleAmqpChannelRecreated.bind(this);
  }

  async listen() {
    if (this.state === RpcServerState.Listening)
      throw new Error('RPC node is already listening');
    if (this.state === RpcServerState.Disposed)
      throw new Error('Cannot reuse disposed RPC node');
    this.state = RpcServerState.Listening;

    this.commandReceiver.on('message', this.handleCommandMessage);
    this.amqpConnection.on('reconnected', this.handleAmqpReconnected);
    this.amqpConnection.on('channelRecreated', this.handleAmqpChannelRecreated);

    await this.commandReceiver.listen();
  }

  async dispose() {
    if (this.state === RpcServerState.Ready) return;
    if (this.state === RpcServerState.Disposed) return;
    this.state = RpcServerState.Disposed;

    this.commandReceiver.removeListener('message', this.handleCommandMessage);
    this.amqpConnection.removeListener(
      'reconnected',
      this.handleAmqpReconnected,
    );
    this.amqpConnection.removeListener(
      'channelRecreated',
      this.handleAmqpChannelRecreated,
    );

    this.commandHandlerManager.deleteAll();
    await this.commandReceiver.dispose();
  }

  private handleAmqpReconnected() {
    this.messageRelevancyChecker.unlockAll();
  }

  private handleAmqpChannelRecreated() {
    this.messageRelevancyChecker.unlockAll();
  }

  private async handleCommandMessage({
    content,
    correlationId,
    replyQueue,
    deliveryTag,
  }: CommandMessage) {
    if (!this.messageRelevancyChecker.lock(correlationId, deliveryTag)) {
      return;
    }

    const { command: commandName, args } =
      this.jsonBufferSerializer.deserialize<CommandMessageContent>(content);

    let timeoutId: NodeJS.Timeout;
    let hasTimedOut = false;

    const executedAt = Date.now();

    const { state, data } = await Promise.race([
      this.commandHandlerManager.handle(commandName, ...args),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          hasTimedOut = true;
          reject(null);
        }, this.commandTimeoutMs);
      }),
    ])
      .then((result) => ({ state: 'success', data: result }))
      .catch((error) => ({
        state: 'error',
        data: this.errorSerializer.serialize(error),
      }))
      .finally(() => clearTimeout(timeoutId));

    const durationMs = Date.now() - executedAt;
    if (durationMs >= this.staleCommandDurationMs) {
      this.emitter.emit('staleCommand', {
        durationMs,
        hasTimedOut,
        queue: this.queue,
        commandName,
        args,
      });
    }

    if (String(this.state) === RpcServerState.Disposed) return;

    // client doesn't care about response anymore
    if (!hasTimedOut) {
      await this.amqpConnection.sendToQueue(
        replyQueue,
        this.jsonBufferSerializer.serialize({ state, data }),
        { correlationId },
      );
    }

    if (String(this.state) === RpcServerState.Disposed) return;

    const actualDeliveryTag =
      this.messageRelevancyChecker.getDeliveryTag(correlationId);
    if (actualDeliveryTag) {
      try {
        await this.amqpConnection.acknowledge(actualDeliveryTag);
      } catch (error) {
        this.emitter.emit('acknowledgeError', {
          error,
          queue: this.queue,
          commandName,
          args,
        });
      }
    }

    this.messageRelevancyChecker.unlock(correlationId);
  }

  setCommandHandler(commandName: string, handler: any) {
    this.commandHandlerManager.set(commandName, handler);
  }

  on(event: string, listener: (...args: any[]) => any) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: (...args: any[]) => any) {
    this.emitter.removeListener(event, listener);
  }

  setIsExclusive(value: boolean) {
    this.commandReceiver.setIsExclusive(value);
    return this;
  }

  get isExclusive() {
    return this.commandReceiver.isExclusive;
  }
}
