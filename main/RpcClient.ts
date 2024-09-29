import { v4 as uuidv4 } from 'uuid';

import { SimpleFactory } from '../src/utils/SimpleFactory';
import { UuidIdGenerator } from '../src/UuidIdGenerator';
import { JsonBufferSerializer } from '../src/core';
import { ErrorSerializer } from '../src/rpc/errors/ErrorSerializer';
import { ProblemReporter } from '../src/rpc/rpc-client/ProblemReporter';
import { Command } from '../src/rpc/rpc-client/command-sender/Command';
import { CommandManager } from '../src/rpc/rpc-client/command-sender/CommandManager';
import { CommandSender } from '../src/rpc/rpc-client/command-sender/CommandSender';
import { CommandSenderManager } from '../src/rpc/rpc-client/command-sender/CommandSenderManager';
import { ReplyQueueConsumer } from '../src/rpc/rpc-client/command-sender/ReplyQueueConsumer';
import { CommandContainer } from '../src/rpc/rpc-server/CommandContainer';

import { AmqpConnection } from './AmqpConnection';
import { RpcClient as RpcClientBase } from '../src/rpc/rpc-client/RpcClient';

const COMMAND_TIMEOUT_MS = 60 * 1000; // 1 minute
const REPLY_QUEUE_DISUSE_EXPIRE_MS = 60 * 1000; // 1 minute
const STALE_COMMAND_DURATION_MS = 10 * 1000; // 10 seconds

type RpcClientOptions = {
  amqpConnection: AmqpConnection;
  commandTimeoutMs?: number;
  replyQueueDisuseExpireMs?: number;
  staleCommandDurationMs?: number;
};

export class RpcClient extends RpcClientBase {
  constructor({
    amqpConnection,
    commandTimeoutMs = COMMAND_TIMEOUT_MS,
    replyQueueDisuseExpireMs = REPLY_QUEUE_DISUSE_EXPIRE_MS,
    staleCommandDurationMs = STALE_COMMAND_DURATION_MS,
  }: RpcClientOptions) {
    super(
      {
        commandTimeoutMs,
        replyQueueDisuseExpireMs,
        staleCommandDurationMs,
      },
      {
        amqpConnection,
        commandSenderManagerFactory: SimpleFactory.for(CommandSenderManager),
        commandContainerFactory: SimpleFactory.for(CommandContainer),
        commandSenderFactory: SimpleFactory.for(CommandSender),
        commandManagerFactory: SimpleFactory.for(CommandManager),
        commandFactory: SimpleFactory.for(Command),
        problemReporterFactory: SimpleFactory.for(ProblemReporter),
        replyQueueConsumerFactory: SimpleFactory.for(ReplyQueueConsumer),
        jsonBufferSerializer: new JsonBufferSerializer(),
        errorSerializer: new ErrorSerializer(),
        idGenerator: new UuidIdGenerator(uuidv4),
      },
    );
  }
}
