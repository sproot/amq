import { MessageRelevancyChecker } from '../src/MessageRelevancyChecker';
import { JsonBufferSerializer } from '../src/core';
import { ErrorSerializer } from '../src/rpc/errors/ErrorSerializer';
import { CommandHandlerManager } from '../src/rpc/rpc-server/CommandHandlerManager';
import { CommandHandlerValidator } from '../src/rpc/rpc-server/CommandHandlerValidator';
import { CommandQueueConsumer } from '../src/rpc/rpc-server/command-receiver/CommandQueueConsumer';
import { CommandQueueInitializer } from '../src/rpc/rpc-server/command-receiver/CommandQueueInitializer';
import { CommandReceiver } from '../src/rpc/rpc-server/command-receiver/CommandReceiver';
import { SimpleFactory } from '../src/utils/SimpleFactory';

import { AmqpConnection } from './AmqpConnection';
import { RpcServer as RpcServerBase } from '../src/rpc/rpc-server/RpcServer';

const COMMAND_TIMEOUT_MS = 60 * 1000; // 1 minute
const STALE_COMMAND_DURATION_MS = 10 * 1000; // 10 seconds

type RpcServerOptions = {
  amqpConnection: AmqpConnection;
  queue: string;
  exchange: string;
  commandTimeoutMs?: number;
  staleCommandDurationMs?: number;
};

export class RpcServer extends RpcServerBase {
  constructor({
    amqpConnection,
    queue,
    exchange,
    commandTimeoutMs = COMMAND_TIMEOUT_MS,
    staleCommandDurationMs = STALE_COMMAND_DURATION_MS,
  }: RpcServerOptions) {
    super(
      {
        queue,
        exchange,
        commandTimeoutMs,
        staleCommandDurationMs,
      },
      {
        amqpConnection,
        messageRelevancyCheckerFactory: SimpleFactory.for(
          MessageRelevancyChecker,
        ),
        commandHandlerManagerFactory: SimpleFactory.for(CommandHandlerManager),
        commandHandlerValidator: new CommandHandlerValidator(),
        commandReceiverFactory: SimpleFactory.for(CommandReceiver),
        commandQueueConsumerFactory: SimpleFactory.for(CommandQueueConsumer),
        commandQueueInitializerFactory: SimpleFactory.for(
          CommandQueueInitializer,
        ),
        jsonBufferSerializer: new JsonBufferSerializer(),
        errorSerializer: new ErrorSerializer(),
      },
    );
  }
}
