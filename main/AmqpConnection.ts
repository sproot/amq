import { connect as amqplibConnect } from 'amqplib';

import { SimpleFactory } from '../src/utils/SimpleFactory';
import {
  AmqpConnectionWrapper,
  AmqpConnectionWrapperOptions,
} from '../src/core/AmqpConnectionWrapper';

import {
  AmqpConnection as AmqpConnectionBase,
  AmqpConnectionOptions as AmqpConnectionOptionsBase,
} from '../src/core/AmqpConnection';

import {
  AmqpChannelProvider,
  AmqpChannelExecutor,
  AmqpChannelContainer,
  AmqpDisposer,
  AmqpConnectionContainer,
  AmqpConnectionInitializer,
  AmqpConnectionProvider,
  AmqpConnectionExecutor,
} from '../src/core';

type AmqpConnectionOptions = Partial<AmqpConnectionOptionsBase> &
  Partial<AmqpConnectionWrapperOptions> & { disposeTimeoutMs?: number };

/** Default values */
const DEFAULT_PROTOCOL = 'amqp';
const DEFAULT_HOSTNAME = 'localhost';
const DEFAULT_PORT = 5672;
const DEFAULT_USERNAME = 'guest';
const DEFAULT_PASSWORD = 'guest';
const DEFAULT_VHOST = '/';

/**
 * Some commands cause channel and/or connection to close when failed,
 * therefore we shouldn't retry them endlessly.
 * Default values (below) will cause amqp executors to retry 60000/200 = 300 times
 */
const COMMAND_TIMEOUT_MS = 60 * 1000; // 60 seconds
const COMMAND_RETRY_INTERVAL_MS = 200; // 200 ms
const STALE_COMMAND_DURATION_MS = 10 * 1000; // 10 seconds
const DISPOSE_TIMEOUT_MS = 10 * 1000; // 10 seconds

/**
 * First attempt to reconnect will be performed immediately.
 * Intervals between further attempts (in seconds): [1, 1.3, 1.6, 2.1, 2.7, 3.5, 4.5, 5.8, 7.5, 9.7]
 * In total: 39.7 seconds for reconnection, after which connection will be closed
 */
const MAX_CONNECTION_ATTEMPTS = 10;
const CONNECTION_ATTEMPT_TIMEOUT_BASE = 1.275;
const CONNECTION_ATTEMPT_TIMEOUT_MULTIPLIER = 1000; // 1 second

export class AmqpConnection extends AmqpConnectionWrapper {
  constructor({
    protocol = DEFAULT_PROTOCOL,
    hostname = DEFAULT_HOSTNAME,
    port = DEFAULT_PORT,
    username = DEFAULT_USERNAME,
    password = DEFAULT_PASSWORD,
    vhost = DEFAULT_VHOST,
    commandTimeoutMs = COMMAND_TIMEOUT_MS,
    commandRetryIntervalMs = COMMAND_RETRY_INTERVAL_MS,
    staleCommandDurationMs = STALE_COMMAND_DURATION_MS,
    maxConnectionAttempts = MAX_CONNECTION_ATTEMPTS,
    connectionAttemptTimeoutBase = CONNECTION_ATTEMPT_TIMEOUT_BASE,
    connectionAttemptTimeoutMultiplier = CONNECTION_ATTEMPT_TIMEOUT_MULTIPLIER,
    disposeTimeoutMs = DISPOSE_TIMEOUT_MS,
  }: AmqpConnectionOptions) {
    super(
      {
        maxConnectionAttempts,
        commandTimeoutMs,
        commandRetryIntervalMs,
        staleCommandDurationMs,
        connectionAttemptTimeoutBase,
        connectionAttemptTimeoutMultiplier,
      },
      {
        amqpConnectionContainerFactory: SimpleFactory.for(
          AmqpConnectionContainer,
        ),
        amqpConnectionInitializerFactory: SimpleFactory.for(
          AmqpConnectionInitializer,
        ),
        amqpConnectionExecutorFactory: SimpleFactory.for(
          AmqpConnectionExecutor,
        ),
        amqpConnectionProvider: new AmqpConnectionProvider(
          {
            protocol,
            hostname,
            port,
            username,
            password,
            vhost,
            commandTimeoutMs,
            commandRetryIntervalMs,
          },
          {
            amqplibConnect,
            amqpDisposer: new AmqpDisposer({
              disposeTimeoutMs,
            }),
            amqpChannelContainer: new AmqpChannelContainer(),
            amqpChannelProviderFactory: SimpleFactory.for(AmqpChannelProvider),
            amqpChannelExecutorFactory: SimpleFactory.for(AmqpChannelExecutor),
            amqpConnectionFactory: SimpleFactory.for(AmqpConnectionBase),
          },
        ),
      },
    );
  }
}
