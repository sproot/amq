import EventEmitter from 'events';
import { FactoryFor } from '../../../utils/SimpleFactory';
import { AmqpConnection } from '../../../core';
import { CommandQueueConsumer } from './CommandQueueConsumer';
import { CommandQueueInitializer } from './CommandQueueInitializer';

type CommandReceiverOptions = {
  exchange: string;
  queue: string;
};

type CommandReceiverDependencies = {
  amqpConnection: AmqpConnection;
  commandQueueInitializerFactory: FactoryFor<CommandQueueInitializer>;
  commandQueueConsumerFactory: FactoryFor<CommandQueueConsumer>;
};

export class CommandReceiver {
  private readonly emitter: EventEmitter;
  private readonly amqpConnection: AmqpConnection;
  private readonly commandQueueInitializer: CommandQueueInitializer;
  private readonly commandQueueConsumer: CommandQueueConsumer;

  private isDisposed = false;

  constructor(
    { exchange, queue }: CommandReceiverOptions,
    {
      amqpConnection,
      commandQueueInitializerFactory,
      commandQueueConsumerFactory,
    }: CommandReceiverDependencies,
  ) {
    this.emitter = new EventEmitter();

    this.amqpConnection = amqpConnection;

    this.commandQueueInitializer = commandQueueInitializerFactory.create(
      {
        exchange,
        queue,
      },
      {
        amqpConnection,
      },
    );

    this.commandQueueConsumer = commandQueueConsumerFactory.create(
      {
        queue,
      },
      {
        amqpConnection,
      },
    );

    this.handleAmqpReconnected = this.handleAmqpReconnected.bind(this);
    this.handleAmqpChannelRecreated =
      this.handleAmqpChannelRecreated.bind(this);
    this.handleCommandMessage = this.handleCommandMessage.bind(this);
  }

  async listen() {
    this.amqpConnection.on('reconnected', this.handleAmqpReconnected);
    this.amqpConnection.on('channelRecreated', this.handleAmqpChannelRecreated);
    this.commandQueueConsumer.on('message', this.handleCommandMessage);

    await this.initializeAndConsume();
  }

  async dispose() {
    this.isDisposed = true;

    this.amqpConnection.removeListener(
      'reconnected',
      this.handleAmqpReconnected,
    );
    this.amqpConnection.removeListener(
      'channelRecreated',
      this.handleAmqpChannelRecreated,
    );
    this.commandQueueConsumer.removeListener(
      'message',
      this.handleCommandMessage,
    );

    this.commandQueueInitializer.dispose();
    await this.commandQueueConsumer.dispose();
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: (...args: any[]) => void) {
    this.emitter.removeListener(event, listener);
  }

  setIsExclusive(value: boolean) {
    this.commandQueueInitializer.setIsExclusive(value);
    return this;
  }

  get isExclusive() {
    return this.commandQueueInitializer.isExclusive;
  }

  private async handleAmqpReconnected() {
    await this.initializeAndConsume();
  }

  private async handleAmqpChannelRecreated() {
    await this.initializeAndConsume();
  }

  private async initializeAndConsume() {
    await this.commandQueueInitializer.initialize();
    if (this.isDisposed) return;
    await this.commandQueueConsumer.consume();
  }

  private handleCommandMessage(message: any) {
    this.emitter.emit('message', message);
  }
}
