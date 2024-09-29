import { AmqpConnection, JsonBufferSerializer } from '../../../core';
import { ErrorCode } from '../../../core/errors/types';
import { FactoryFor } from '../../../utils/SimpleFactory';
import { CommandError } from '../../errors/CommandError';
import { ErrorSerializer } from '../../errors/ErrorSerializer';
import { CommandContainer } from '../../rpc-server/CommandContainer';
import { Command } from './Command';
import { CommandManager } from './CommandManager';
import { ProblemReporter } from '../ProblemReporter';
import { ReplyQueueConsumer } from './ReplyQueueConsumer';
import { IdGenerator } from '../../../types';

type CommandSenderOptions = {
  queue: string;
  timeoutMs: number;
  replyQueueDisuseExpireMs: number;
  staleCommandDurationMs: number;
};

type CommandSenderDependencies = {
  commandManagerFactory: FactoryFor<CommandManager>;
  commandContainerFactory: FactoryFor<CommandContainer>;
  commandFactory: FactoryFor<Command>;
  problemReporter: ProblemReporter;
  replyQueueConsumerFactory: FactoryFor<ReplyQueueConsumer>;
  amqpConnection: AmqpConnection;
  jsonBufferSerializer: JsonBufferSerializer;
  errorSerializer: ErrorSerializer;
  idGenerator: IdGenerator;
};

export class CommandSender {
  private readonly queue: string;
  private readonly timeoutMs: number;
  private readonly staleCommandDurationMs: number;

  private readonly amqpConnection: AmqpConnection;
  private readonly problemReporter: ProblemReporter;
  private readonly jsonBufferSerializer: JsonBufferSerializer;
  private readonly errorSerializer: ErrorSerializer;
  private readonly commandManager: CommandManager;
  private readonly replyQueueConsumer: ReplyQueueConsumer;

  private isInitialized = false;
  private isDisposed: boolean;

  constructor(
    {
      queue,
      timeoutMs,
      replyQueueDisuseExpireMs,
      staleCommandDurationMs,
    }: CommandSenderOptions,
    {
      commandManagerFactory,
      commandContainerFactory,
      commandFactory,
      problemReporter,
      replyQueueConsumerFactory,
      amqpConnection,
      jsonBufferSerializer,
      errorSerializer,
      idGenerator,
    }: CommandSenderDependencies,
  ) {
    this.queue = queue;
    this.timeoutMs = timeoutMs;
    this.staleCommandDurationMs = staleCommandDurationMs;

    this.amqpConnection = amqpConnection;
    this.problemReporter = problemReporter;
    this.jsonBufferSerializer = jsonBufferSerializer;
    this.errorSerializer = errorSerializer;
    this.isDisposed = false;

    this.commandManager = commandManagerFactory.create({
      commandFactory,
      commandContainerFactory,
      idGenerator,
    });

    this.replyQueueConsumer = replyQueueConsumerFactory.create(
      {
        queue,
        disuseExpireMs: replyQueueDisuseExpireMs,
      },
      {
        amqpConnection,
        idGenerator,
      },
    );

    this.handleReplyQueueMessage = this.handleReplyQueueMessage.bind(this);
    this.handleCommandMessageReturn =
      this.handleCommandMessageReturn.bind(this);
    this.handleAmqpChannelRecreated =
      this.handleAmqpChannelRecreated.bind(this);
    this.handleAmqpReconnected = this.handleAmqpReconnected.bind(this);
  }

  async sendCommand(commandName: string, ...args: any[]) {
    const commandInterruptedError = new CommandError({
      code: ErrorCode.CommandInterrupted,
      queue: this.queue,
      commandName,
      args,
    });

    await this.initialize();

    if (this.isDisposed) {
      throw commandInterruptedError;
    }

    const correlationId = this.commandManager.create({
      queue: this.queue,
      commandName,
      args,
    });

    let hasTimedOut = false;
    const timeoutId = setTimeout(() => {
      hasTimedOut = true;
      this.commandManager.failOneWithCode(
        correlationId,
        ErrorCode.CommandTimedOut,
      );
    }, this.timeoutMs);

    const sentAt = Date.now();

    try {
      await this.amqpConnection.sendToQueue(
        this.queue,
        this.jsonBufferSerializer.serialize({ command: commandName, args }),
        {
          correlationId,
          replyQueue: this.replyQueueConsumer.replyQueue,
          mandatory: true,
          expireMs: this.timeoutMs,
        },
      );

      if (this.isDisposed) {
        throw commandInterruptedError;
      }

      return await this.commandManager.wait(correlationId);
    } finally {
      const durationMs = Date.now() - sentAt;
      if (durationMs >= this.staleCommandDurationMs) {
        this.problemReporter.reportStaleCommand({
          durationMs,
          hasTimedOut,
          queue: this.queue,
          commandName,
          args,
        });
      }

      clearTimeout(timeoutId);
    }
  }

  async dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.commandManager.failAllWithCode(ErrorCode.CommandCancelled);

    this.replyQueueConsumer.removeListener(
      'message',
      this.handleReplyQueueMessage,
    );
    this.amqpConnection.removeListener(
      'return',
      this.handleCommandMessageReturn,
    );
    this.amqpConnection.removeListener(
      'reconnected',
      this.handleAmqpReconnected,
    );
    this.amqpConnection.removeListener(
      'channelRecreated',
      this.handleAmqpChannelRecreated,
    );

    await this.replyQueueConsumer.dispose();
  }

  /** @private */
  async initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.replyQueueConsumer.on('message', this.handleReplyQueueMessage);
    this.amqpConnection.on('return', this.handleCommandMessageReturn);
    this.amqpConnection.on('reconnected', this.handleAmqpReconnected);
    this.amqpConnection.on('channelRecreated', this.handleAmqpChannelRecreated);

    await this.replyQueueConsumer.consume();
  }

  private async handleAmqpReconnected() {
    await this.replyQueueConsumer.consume();
  }

  private async handleAmqpChannelRecreated() {
    await this.replyQueueConsumer.consume();
  }

  private handleCommandMessageReturn(correlationId: string) {
    this.commandManager.failOneWithCode(
      correlationId,
      ErrorCode.CommandDismissed,
    );
  }

  private async handleReplyQueueMessage({
    content,
    correlationId,
    deliveryTag,
  }: {
    content: Buffer;
    correlationId: string;
    deliveryTag: number;
  }) {
    const { queue, commandName, args } =
      this.commandManager.getInfo(correlationId) || {};

    try {
      const { state, data } = this.jsonBufferSerializer.deserialize(content);

      if (state === 'success') {
        this.commandManager.succeed(correlationId, data);
      } else {
        this.commandManager.failOneWithError(
          correlationId,
          this.errorSerializer.deserialize(data),
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        this.commandManager.failOneWithError(correlationId, error);
      }
    }

    try {
      await this.amqpConnection.acknowledge(deliveryTag);
    } catch (error) {
      this.problemReporter.reportAcknowledgeError({
        error,
        queue,
        commandName,
        args,
      });
    }
  }
}
