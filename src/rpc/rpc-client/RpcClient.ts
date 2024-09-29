import { EventEmitter } from 'events';
import { CommandSenderManager } from './command-sender/CommandSenderManager';
import { FactoryFor } from '../../utils/SimpleFactory';
import { CommandContainer } from '../rpc-server/CommandContainer';
import { AmqpConnectionInterface, JsonBufferSerializer } from '../../core';
import { ErrorSerializer } from '../errors/ErrorSerializer';
import { Command } from './command-sender/Command';
import { CommandManager } from './command-sender/CommandManager';
import { CommandSender } from './command-sender/CommandSender';
import { ProblemReporter } from './ProblemReporter';
import { ReplyQueueConsumer } from './command-sender/ReplyQueueConsumer';
import { IdGenerator } from './../../types';

type RpcClientOptions = {
  commandTimeoutMs: number;
  replyQueueDisuseExpireMs: number;
  staleCommandDurationMs: number;
};

type RpcClientDependencies = {
  commandSenderManagerFactory: FactoryFor<CommandSenderManager>;
  commandContainerFactory: FactoryFor<CommandContainer>;
  commandSenderFactory: FactoryFor<CommandSender>;
  commandManagerFactory: FactoryFor<CommandManager>;
  commandFactory: FactoryFor<Command>;
  problemReporterFactory: FactoryFor<ProblemReporter>;
  replyQueueConsumerFactory: FactoryFor<ReplyQueueConsumer>;
  amqpConnection: AmqpConnectionInterface;
  jsonBufferSerializer: JsonBufferSerializer;
  errorSerializer: ErrorSerializer;
  idGenerator: IdGenerator;
};

export class RpcClient {
  private readonly emitter: EventEmitter;
  private readonly commandTimeoutMs: number;
  private readonly replyQueueDisuseExpireMs: number;
  private readonly staleCommandDurationMs: number;
  private readonly commandSenderManager: CommandSenderManager;
  private readonly commandContainerFactory: FactoryFor<CommandContainer>;
  private readonly commandSenderFactory: FactoryFor<CommandSender>;
  private readonly commandManagerFactory: FactoryFor<CommandManager>;
  private readonly commandFactory: FactoryFor<Command>;
  private readonly replyQueueConsumerFactory: FactoryFor<ReplyQueueConsumer>;
  private readonly amqpConnection: AmqpConnectionInterface;
  private readonly jsonBufferSerializer: JsonBufferSerializer;
  private readonly errorSerializer: ErrorSerializer;
  private readonly idGenerator: IdGenerator;

  private problemReporter: ProblemReporter;
  private isDisposed = false;

  constructor(
    {
      commandTimeoutMs,
      replyQueueDisuseExpireMs,
      staleCommandDurationMs,
    }: RpcClientOptions,
    {
      commandSenderManagerFactory,
      commandContainerFactory,
      commandSenderFactory,
      commandManagerFactory,
      commandFactory,
      problemReporterFactory,
      replyQueueConsumerFactory,
      amqpConnection,
      jsonBufferSerializer,
      errorSerializer,
      idGenerator,
    }: RpcClientDependencies,
  ) {
    if (typeof commandTimeoutMs !== 'number' || commandTimeoutMs < 1)
      throw new Error('"options.commandTimeoutMs" must be a positive number');
    if (
      typeof replyQueueDisuseExpireMs !== 'number' ||
      replyQueueDisuseExpireMs < 1
    )
      throw new Error(
        '"options.replyQueueDisuseExpireMs" must be a positive number',
      );
    if (
      typeof staleCommandDurationMs !== 'number' ||
      staleCommandDurationMs < 1
    )
      throw new Error(
        '"options.staleCommandDurationMs" must be a positive number',
      );
    if (!amqpConnection)
      throw new Error('"dependencies.amqpConnection" is required');

    this.emitter = new EventEmitter();

    this.commandTimeoutMs = commandTimeoutMs;
    this.replyQueueDisuseExpireMs = replyQueueDisuseExpireMs;
    this.staleCommandDurationMs = staleCommandDurationMs;

    this.commandSenderFactory = commandSenderFactory;
    this.commandManagerFactory = commandManagerFactory;
    this.commandContainerFactory = commandContainerFactory;
    this.commandFactory = commandFactory;
    this.replyQueueConsumerFactory = replyQueueConsumerFactory;
    this.amqpConnection = amqpConnection;
    this.jsonBufferSerializer = jsonBufferSerializer;
    this.errorSerializer = errorSerializer;
    this.idGenerator = idGenerator;

    this.problemReporter = problemReporterFactory.create();
    this.problemReporter.on('staleCommand', (...args) =>
      this.emitter.emit('staleCommand', ...args),
    );
    this.problemReporter.on('acknowledgeError', (...args) =>
      this.emitter.emit('acknowledgeError', ...args),
    );

    this.commandSenderManager = commandSenderManagerFactory.create();
  }

  async dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;

    await this.commandSenderManager.disposeAll();
  }

  async executeRemoteCommand(
    queue: string,
    commandName: string,
    ...args: any[]
  ) {
    if (this.isDisposed)
      throw new Error(
        `Cannot send "${commandName}" command, because RPC client is disposed`,
      );
    if (typeof queue !== 'string' || queue.length === 0)
      throw new Error(
        `"queue" must be a non-empty string (provided: "${String(queue)}")`,
      );
    if (typeof commandName !== 'string' || commandName.length === 0)
      throw new Error(
        `"commandName" must be a non-empty string (provided: "${String(
          commandName,
        )}")`,
      );

    let commandSender = this.commandSenderManager.get(queue);

    if (!commandSender) {
      commandSender = this.commandSenderFactory.create(
        {
          queue,
          timeoutMs: this.commandTimeoutMs,
          replyQueueDisuseExpireMs: this.replyQueueDisuseExpireMs,
          staleCommandDurationMs: this.staleCommandDurationMs,
        },
        {
          commandManagerFactory: this.commandManagerFactory,
          commandContainerFactory: this.commandContainerFactory,
          commandFactory: this.commandFactory,
          problemReporter: this.problemReporter,
          replyQueueConsumerFactory: this.replyQueueConsumerFactory,
          amqpConnection: this.amqpConnection,
          jsonBufferSerializer: this.jsonBufferSerializer,
          errorSerializer: this.errorSerializer,
          idGenerator: this.idGenerator,
        },
      );

      this.commandSenderManager.set(queue, commandSender);
    }

    return commandSender.sendCommand(commandName, ...args);
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: (...args: any[]) => void) {
    this.emitter.removeListener(event, listener);
  }
}
