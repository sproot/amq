import { connect as AmqplibConnect } from 'amqplib';
import { FactoryFor } from '../utils/SimpleFactory';

import {
  AmqpConnection,
  AmqpConnectionOptions,
  AmqpConnectionDependencies,
} from './AmqpConnection';

import {
  AmqpDisposer,
  AmqpChannelContainer,
  AmqpChannelProvider,
  AmqpChannelExecutor,
} from '.';

type AmqpConnectionProviderDependencies = AmqpConnectionDependencies & {
  amqpConnectionFactory: FactoryFor<AmqpConnection>;
};

export class AmqpConnectionProvider {
  private readonly protocol: string;
  private readonly hostname: string;
  private readonly port: number;
  private readonly username: string;
  private readonly password: string;
  private readonly vhost: string;

  private readonly commandTimeoutMs: number;
  private readonly commandRetryIntervalMs: number;

  private readonly amqplibConnect: typeof AmqplibConnect;
  private readonly amqpDisposer: AmqpDisposer;
  private readonly amqpChannelContainer: AmqpChannelContainer;
  private readonly amqpChannelProviderFactory: FactoryFor<AmqpChannelProvider>;
  private readonly amqpChannelExecutorFactory: FactoryFor<AmqpChannelExecutor>;

  private readonly amqpConnectionFactory: FactoryFor<AmqpConnection>;

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
      amqpConnectionFactory,
    }: AmqpConnectionProviderDependencies,
  ) {
    this.protocol = protocol;
    this.hostname = hostname;
    this.port = port;
    this.username = username;
    this.password = password;
    this.vhost = vhost;

    this.commandTimeoutMs = commandTimeoutMs;
    this.commandRetryIntervalMs = commandRetryIntervalMs;

    this.amqplibConnect = amqplibConnect;
    this.amqpDisposer = amqpDisposer;
    this.amqpChannelContainer = amqpChannelContainer;
    this.amqpChannelProviderFactory = amqpChannelProviderFactory;
    this.amqpChannelExecutorFactory = amqpChannelExecutorFactory;

    this.amqpConnectionFactory = amqpConnectionFactory;
  }

  create() {
    return this.amqpConnectionFactory.create(
      {
        protocol: this.protocol,
        hostname: this.hostname,
        port: this.port,
        username: this.username,
        password: this.password,
        vhost: this.vhost,
        commandTimeoutMs: this.commandTimeoutMs,
        commandRetryIntervalMs: this.commandRetryIntervalMs,
      },
      {
        amqplibConnect: this.amqplibConnect,
        amqpDisposer: this.amqpDisposer,
        amqpChannelContainer: this.amqpChannelContainer,
        amqpChannelProviderFactory: this.amqpChannelProviderFactory,
        amqpChannelExecutorFactory: this.amqpChannelExecutorFactory,
      },
    );
  }
}
