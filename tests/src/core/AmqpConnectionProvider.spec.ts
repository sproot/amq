import { FactoryMock, factoryMockHelper } from '../../helpers';
import { AmqpConnection, AmqpConnectionProvider } from '../../../src/core';

describe('AmqpConnectionProvider', () => {
  const PROTOCOL = 'fake-protocol';
  const HOSTNAME = 'fake-hostname';
  const PORT = 1466;
  const USERNAME = 'fake-username';
  const PASSWORD = 'fake-password';
  const VHOST = 'fake-vhost';
  const COMMAND_TIMEOUT_MS = 46;
  const COMMAND_RETRY_INTERVAL_MS = 544;

  let provider: AmqpConnectionProvider;
  let amqplibConnect: any;
  let amqpDisposer: any;
  let amqpConnection: any;
  let amqpChannelContainer: any;

  let amqpConnectionFactory: FactoryMock<AmqpConnection>;
  let amqpChannelProviderFactory: any;
  let amqpChannelExecutorFactory: any;

  beforeEach(() => {
    amqpConnection = { fake: 'AmqpConnection' };
    amqpConnectionFactory = factoryMockHelper.create(amqpConnection);

    amqplibConnect = { dummy: 'AmqplibConnect' };
    amqpDisposer = { dummy: 'AmqpDisposer' };
    amqpChannelProviderFactory = { dummy: 'AmqpChannelProviderFactory' };
    amqpChannelContainer = { dummy: 'amqplibChannelContainerFactory' };
    amqpChannelExecutorFactory = { dummy: 'amqplibChannelExecutorFactory' };

    provider = new AmqpConnectionProvider(
      {
        protocol: PROTOCOL,
        hostname: HOSTNAME,
        port: PORT,
        username: USERNAME,
        password: PASSWORD,
        vhost: VHOST,
        commandTimeoutMs: COMMAND_TIMEOUT_MS,
        commandRetryIntervalMs: COMMAND_RETRY_INTERVAL_MS,
      },
      {
        amqplibConnect,
        amqpDisposer,
        amqpChannelContainer,
        amqpChannelProviderFactory,
        amqpChannelExecutorFactory,
        amqpConnectionFactory,
      },
    );
  });

  describe('create()', () => {
    it('should create AmqplibAmqpConnection instance with specified options', () => {
      const result = provider.create();

      expect(amqpConnectionFactory.create).toHaveBeenCalledWith(
        {
          protocol: PROTOCOL,
          hostname: HOSTNAME,
          port: PORT,
          username: USERNAME,
          password: PASSWORD,
          vhost: VHOST,
          commandTimeoutMs: COMMAND_TIMEOUT_MS,
          commandRetryIntervalMs: COMMAND_RETRY_INTERVAL_MS,
        },
        {
          amqplibConnect,
          amqpDisposer,
          amqpChannelContainer,
          amqpChannelProviderFactory,
          amqpChannelExecutorFactory,
        },
      );

      expect(result).toBe(amqpConnection);
    });
  });
});
