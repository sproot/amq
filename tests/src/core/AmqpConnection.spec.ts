import { ConnectionClosedError } from '../../../src/core/errors';
import {
  eventEmitterHelper,
  factoryMockHelper,
  promiseHelper,
  FactoryMock,
} from '../../helpers';

import type { Connection as AmqplibConnection } from 'amqplib';

import {
  AmqpConnection,
  AmqpDisposer,
  AmqpChannelContainer,
  AmqpChannelExecutor,
  AmqpChannelProvider,
  AmqpConnectionOptions,
} from '../../../src/core';

import { AsyncEventEmitter } from '../../helpers/AsyncEventEmitter';
import { ExchangeType } from '../../../src/core/types';

describe('AmqpConnection', () => {
  const PROTOCOL = 'amqp';
  const HOSTNAME = 'fake-hostname';
  const PORT = 1466;
  const USERNAME = 'fake-username';
  const PASSWORD = 'fake-password';
  const VIRTUAL_HOST = 'fake-virtual-host';

  const COMMAND_TIMEOUT_MS = 46;
  const COMMAND_RETRY_INTERVAL_MS = 5657;

  const amqpConnectionOptions = {
    protocol: PROTOCOL,
    hostname: HOSTNAME,
    port: PORT,
    username: USERNAME,
    password: PASSWORD,
    commandTimeoutMs: COMMAND_TIMEOUT_MS,
    commandRetryIntervalMs: COMMAND_RETRY_INTERVAL_MS,
    vhost: VIRTUAL_HOST,
  };

  let amqpConnectionDependencies: any;

  let amqplibConnect: jest.Mock;
  let amqplibConnection: jest.Mocked<AmqplibConnection>;
  let amqplibConnectionEmitter: AsyncEventEmitter;
  let amqpConnection: AmqpConnection;

  let amqpDisposer: jest.Mocked<AmqpDisposer>;

  let amqpChannelContainer: jest.Mocked<AmqpChannelContainer>;
  let amqpChannelContainerEmitter: AsyncEventEmitter;

  let amqpChannelExecutorFactory: FactoryMock<AmqpChannelExecutor>;
  let amqpChannelExecutor: jest.Mocked<AmqpChannelExecutor>;
  let amqpChannelExecutorEmitter: AsyncEventEmitter;

  let amqpChannelProviderFactory: FactoryMock<AmqpChannelProvider>;
  let amqpChannelProvider: any;
  let amqpChannel: any;

  beforeEach(() => {
    amqplibConnection = {
      on: jest.fn(),
      removeListener: jest.fn(),
    } as unknown as jest.Mocked<AmqplibConnection>;
    amqplibConnectionEmitter = eventEmitterHelper.install(amqplibConnection);

    amqplibConnect = jest.fn(async () => amqplibConnection);

    amqpDisposer = {
      disposeChannel: jest.fn(async () => {}),
      disposeConnection: jest.fn(async () => {}),
      flush: jest.fn(async () => {}),
    } as unknown as jest.Mocked<AmqpDisposer>;

    amqpChannel = createAmqpChannelMock();

    amqpChannelProvider = {
      create: jest.fn(async () => amqpChannel),
    };

    amqpChannelProviderFactory = factoryMockHelper.create(amqpChannelProvider);

    amqpChannelContainer = {
      set: jest.fn(),
      get: jest.fn(() => null),
      on: jest.fn(),
      removeListener: jest.fn(),
    } as unknown as jest.Mocked<AmqpChannelContainer>;

    amqpChannelContainerEmitter = eventEmitterHelper.install(
      amqpChannelContainer,
      { ignoreUnhandledErrors: true },
    );

    amqpChannelExecutor = {
      execute: jest.fn(async () => {}),
      resumeAll: jest.fn(async () => {}),
      cancelAll: jest.fn(async () => {}),
      on: jest.fn(),
      removeListener: jest.fn(),
    } as unknown as jest.Mocked<AmqpChannelExecutor>;

    amqpChannelExecutorFactory = factoryMockHelper.create(amqpChannelExecutor);
    amqpChannelExecutorEmitter =
      eventEmitterHelper.install(amqpChannelExecutor);

    amqpConnectionDependencies = {
      amqplibConnect,
      amqpDisposer,
      amqpChannelContainer,
      amqpChannelProviderFactory,
      amqpChannelExecutorFactory,
    };

    amqpConnection = new AmqpConnection(
      amqpConnectionOptions,
      amqpConnectionDependencies,
    );
  });

  describe('constructor()', () => {
    it('should validate hostname option', () => {
      expect(() =>
        createAmqpConnectionInstance({ hostname: undefined }),
      ).toThrowError('"options.hostname" is required');
    });

    it('should validate username option', () => {
      expect(() =>
        createAmqpConnectionInstance({ username: undefined }),
      ).toThrowError('"options.username" is required');
    });

    it('should validate password option', () => {
      expect(() =>
        createAmqpConnectionInstance({ password: undefined }),
      ).toThrowError('"options.password" is required');
    });

    it('should validate vhost option', () => {
      expect(() =>
        createAmqpConnectionInstance({ vhost: undefined }),
      ).toThrowError('"options.vhost" is required');
    });

    it('should validate protocol option', () => {
      expect(() =>
        createAmqpConnectionInstance({ protocol: undefined }),
      ).toThrowError('"options.protocol" is required');

      for (const protocol of ['invalid', 'http', true, -999, -1, 0.99]) {
        expect(() =>
          // @ts-ignore: ignore invalid protocol
          createAmqpConnectionInstance({ protocol }),
        ).toThrowError('"options.protocol" must be "amqp" or "amqps"');
      }

      for (const protocol of ['amqp', 'amqps']) {
        expect(() =>
          createAmqpConnectionInstance({ protocol }),
        ).not.toThrowError();
      }
    });

    it('should validate port option', () => {
      for (const port of ['1234', -1, 0]) {
        expect(() =>
          // @ts-ignore: ignore invalid port
          createAmqpConnectionInstance({ port }),
        ).toThrowError('"options.port" must be 1 or greater');
      }

      for (const port of [1, 1234]) {
        expect(() => createAmqpConnectionInstance({ port })).not.toThrowError();
      }
    });

    it('should validate commandTimeoutMs option', () => {
      for (const commandTimeoutMs of [
        undefined,
        null,
        'hello',
        true,
        -999,
        -1,
        0,
        0.99,
      ]) {
        expect(() =>
          // @ts-ignore: ignore invalid commandTimeoutMs
          createAmqpConnectionInstance({ commandTimeoutMs }),
        ).toThrowError('"options.commandTimeoutMs" must be 1 or greater');
      }

      for (const commandTimeoutMs of [1, 1234]) {
        expect(() =>
          createAmqpConnectionInstance({ commandTimeoutMs }),
        ).not.toThrowError();
      }
    });

    it('should validate commandRetryIntervalMs option', () => {
      for (const commandRetryIntervalMs of [
        undefined,
        null,
        'hello',
        true,
        -999,
        -1,
        0,
        0.99,
      ]) {
        expect(() =>
          // @ts-ignore: ignore invalid commandRetryIntervalMs
          createAmqpConnectionInstance({ commandRetryIntervalMs }),
        ).toThrowError('"options.commandRetryIntervalMs" must be 1 or greater');
      }

      for (const commandRetryIntervalMs of [1, 1234]) {
        expect(() =>
          createAmqpConnectionInstance({ commandRetryIntervalMs }),
        ).not.toThrowError();
      }
    });

    it('should create AmqpChannelExecutor', () => {
      expect(amqpChannelExecutorFactory.create).toHaveBeenCalledTimes(1);
      expect(amqpChannelExecutorFactory.create).toHaveBeenCalledWith(
        {
          commandTimeoutMs: COMMAND_TIMEOUT_MS,
          commandRetryIntervalMs: COMMAND_RETRY_INTERVAL_MS,
        },
        {
          amqpChannelContainer,
        },
      );
    });
  });

  describe('connect()', () => {
    it('should create amqplib connection', async () => {
      await amqpConnection.connect();

      expect(amqplibConnect).toHaveBeenCalledWith({
        protocol: PROTOCOL,
        hostname: HOSTNAME,
        username: USERNAME,
        port: PORT,
        password: PASSWORD,
        vhost: VIRTUAL_HOST,
      });
    });

    it('should create amqp channel', async () => {
      await amqpConnection.connect();

      expect(amqpChannelProvider.create).toHaveBeenCalledTimes(1);
      expect(amqpChannelProvider.create).toHaveBeenCalledWith();
      expect(amqpChannelContainer.set).toHaveBeenCalledWith(amqpChannel);
    });

    it('should dispose the channel when disposed while creating it', async () => {
      amqpChannelProvider.create.mockImplementation(async () => {
        /** no await */ amqpConnection.dispose();
        return amqpChannel;
      });

      await amqpConnection.connect();

      expect(amqpDisposer.disposeChannel).toHaveBeenCalledTimes(1);
      expect(amqpDisposer.disposeChannel).toHaveBeenCalledWith(amqpChannel);
      expect(amqpChannelContainer.set).not.toHaveBeenCalledWith(amqpChannel);
    });

    it('should create AmqpChannelProvider', async () => {
      await amqpConnection.connect();

      expect(amqpChannelProviderFactory.create).toHaveBeenCalledTimes(1);
      expect(amqpChannelProviderFactory.create).toHaveBeenCalledWith(
        amqplibConnection,
      );
    });

    describe('[channel creation failed]', () => {
      let error: Error;

      beforeEach(() => {
        error = new Error('Fake create channel error');

        amqpChannelProvider.create.mockRejectedValue(error);
      });

      it('should mark the connection as closed (ignoring subsequent dispose() calls)', async () => {
        await amqpConnection.connect().catch(() => {});

        await amqpConnection.dispose();

        expect(amqpChannelExecutor.cancelAll).not.toHaveBeenCalled();
        expect(amqpChannelContainer.set).not.toHaveBeenCalled();
        expect(amqpDisposer.disposeChannel).not.toHaveBeenCalled();
      });

      it('should re-throw the error', async () => {
        await expect(amqpConnection.connect()).rejects.toThrow(error);
      });

      it('should dispose the connection', async () => {
        await amqpConnection.connect().catch(() => {});

        expect(amqpDisposer.disposeConnection).toHaveBeenCalledTimes(1);
        expect(amqpDisposer.disposeConnection).toHaveBeenCalledWith(
          amqplibConnection,
        );
      });
    });
  });

  describe('recreateChannel()', () => {
    executeWhenConnected(() => {
      let channelRecreatedEventSpy: jest.Mock;
      let errorEventSpy: jest.Mock;
      let closedEventSpy: jest.Mock;
      let newAmqpChannel: any;

      beforeEach(() => {
        channelRecreatedEventSpy = jest.fn();
        amqpConnection.on('channelRecreated', channelRecreatedEventSpy);

        errorEventSpy = jest.fn();
        amqpConnection.on('error', errorEventSpy);

        closedEventSpy = jest.fn();
        amqpConnection.on('closed', closedEventSpy);

        newAmqpChannel = createAmqpChannelMock();
        amqpChannelProvider.create.mockResolvedValue(newAmqpChannel);

        amqpChannelContainer.set.mockClear();
        amqpChannelProvider.create.mockClear();
      });

      describe('[current channel is present]', () => {
        let oldChannel: any;

        beforeEach(() => {
          oldChannel = createAmqpChannelMock();
          // simulate container's logic to enforce correct call order
          let currentChannel = oldChannel;
          amqpChannelContainer.get.mockImplementation(() => currentChannel);
          amqpChannelContainer.set.mockImplementation(
            (newChannel) => (currentChannel = newChannel),
          );
        });

        it('should dispose old channel after deleting it from the container', async () => {
          amqpDisposer.disposeChannel.mockImplementation(async () => {
            expect(amqpChannelContainer.set).toHaveBeenCalledTimes(1);
            expect(amqpChannelContainer.set).toHaveBeenCalledWith(null);
          });

          await amqpConnection.recreateChannel();

          expect(amqpDisposer.disposeChannel).toHaveBeenCalledTimes(1);
          expect(amqpDisposer.disposeChannel).toHaveBeenCalledWith(oldChannel);
        });
      });

      it('should create new channel and store it', async () => {
        await amqpConnection.recreateChannel();

        expect(amqpChannelProvider.create).toHaveBeenCalledTimes(1);
        expect(amqpChannelProvider.create).toHaveBeenCalledWith();
        expect(amqpChannelContainer.set).toHaveBeenCalledWith(newAmqpChannel);
      });

      it('should resume all channel executions', async () => {
        await amqpConnection.recreateChannel();
        expect(amqpChannelExecutor.resumeAll).toHaveBeenCalledTimes(1);
        expect(amqpChannelExecutor.resumeAll).toHaveBeenCalledWith();
      });

      it('should emit "channelRecreated" event', async () => {
        await amqpConnection.recreateChannel();
        expect(channelRecreatedEventSpy).toHaveBeenCalledTimes(1);
        expect(channelRecreatedEventSpy).toHaveBeenCalledWith();
      });

      it('should not emit "channelRecreated" event when unsubscribed', async () => {
        amqpConnection.removeListener(
          'channelRecreated',
          channelRecreatedEventSpy,
        );

        await amqpConnection.recreateChannel();

        expect(channelRecreatedEventSpy).not.toHaveBeenCalled();
      });

      it('should rollback when disposed while creating new channel', async () => {
        amqpChannelProvider.create.mockImplementation(async () => {
          /** no await */ amqpConnection.dispose();
          return newAmqpChannel;
        });

        await amqpConnection.recreateChannel();

        expect(amqpChannelContainer.set).not.toHaveBeenCalledWith(
          newAmqpChannel,
        );
        expect(amqpChannelExecutor.resumeAll).not.toHaveBeenCalled();
        expect(channelRecreatedEventSpy).not.toHaveBeenCalled();
        expect(amqpDisposer.disposeChannel).toHaveBeenCalledTimes(1);
        expect(amqpDisposer.disposeChannel).toHaveBeenCalledWith(
          newAmqpChannel,
        );
      });

      it("should not re-create channel when it's already being re-created", async () => {
        await Promise.all([
          amqpConnection.recreateChannel(),
          amqpConnection.recreateChannel(),
          amqpConnection.recreateChannel(),
        ]);
        expect(amqpChannelProvider.create).toHaveBeenCalledTimes(1);
        await amqpConnection.recreateChannel();
        expect(amqpChannelProvider.create).toHaveBeenCalledTimes(2);
      });

      describe('[channel creation error]', () => {
        let channelCreationError: Error;
        let disposeSpy: jest.SpyInstance;

        beforeEach(() => {
          channelCreationError = new Error('Fake channel creation error');
          amqpChannelProvider.create.mockRejectedValue(channelCreationError);
          disposeSpy = jest.spyOn(amqpConnection, 'dispose');
        });

        it('should emit "error" & "closed" events on error', async () => {
          await amqpConnection.recreateChannel();
          expect(errorEventSpy).toHaveBeenCalledTimes(1);
          expect(errorEventSpy).toHaveBeenCalledWith(channelCreationError);
          expect(closedEventSpy).toHaveBeenCalledTimes(1);
          expect(closedEventSpy).toHaveBeenCalledWith();
        });

        it('should not emit any events event on error when unsubscribed', async () => {
          amqpConnection.removeListener('error', errorEventSpy);
          amqpConnection.removeListener('closed', closedEventSpy);
          await amqpConnection.recreateChannel();
          expect(errorEventSpy).not.toHaveBeenCalled();
          expect(closedEventSpy).not.toHaveBeenCalled();
        });

        it('should dispose', async () => {
          await amqpConnection.recreateChannel();
          expect(amqpConnection.dispose).toHaveBeenCalledTimes(1);
          expect(amqpConnection.dispose).toHaveBeenCalledWith();
        });

        it('should not emit any errors and dispose when disposed while creating new channel', async () => {
          amqpChannelProvider.create.mockImplementation(async () => {
            amqpConnection.dispose();
            disposeSpy.mockClear();
            throw channelCreationError;
          });

          await amqpConnection.recreateChannel();

          expect(errorEventSpy).not.toHaveBeenCalled();
          expect(closedEventSpy).not.toHaveBeenCalled();
          expect(amqpConnection.dispose).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('dispose()', () => {
    executeWhenConnected(() => {
      beforeEach(() => {
        amqpChannelContainer.set.mockClear();
      });

      it('should not dispose when already disposed', async () => {
        await Promise.all([amqpConnection.dispose(), amqpConnection.dispose()]);
        await amqpConnection.dispose();

        expect(amqpDisposer.disposeConnection).toHaveBeenCalledTimes(1);
        expect(amqpChannelContainer.set).toHaveBeenCalledTimes(1);
      });

      it('should dispose the connection after cancelling all commands', async () => {
        amqpDisposer.disposeConnection.mockImplementation(async () => {
          expect(amqpDisposer.disposeConnection).toHaveBeenCalledTimes(1);
          expect(amqpChannelExecutor.cancelAll).toHaveBeenCalledWith(
            new ConnectionClosedError(),
          );
        });

        await amqpConnection.dispose();

        expect(amqpDisposer.disposeConnection).toHaveBeenCalledTimes(1);
        expect(amqpDisposer.disposeConnection).toHaveBeenCalledWith(
          amqplibConnection,
        );
      });

      it('should wait until all channels and connections are disposed', async () => {
        let resolveFlush: any;
        amqpDisposer.flush.mockReturnValue(
          new Promise((resolve) => (resolveFlush = resolve)),
        );

        const disposePromise = amqpConnection.dispose();

        await expect(promiseHelper.isPending(disposePromise)).resolves.toBe(
          true,
        );

        resolveFlush();

        await expect(disposePromise).resolves.toBe(undefined);
      });
    });
  });

  describe('assertQueue()', () => {
    withMockedExecuteMethod(() => {
      executeWhenConnected(() => {
        beforeEach(() => {
          amqpChannel.assertQueue.mockResolvedValue({
            queue: 'fake-asserted-queue',
          });
        });

        it('should assert queue (without optional params)', async () => {
          await amqpConnection.assertQueue({
            durable: false,
            exclusive: false,
            autoDelete: false,
          });
          expect(amqpChannel.assertQueue).toHaveBeenCalledWith('', {
            expires: undefined,
            durable: false,
            exclusive: false,
            autoDelete: false,
          });
          expect(amqpChannelExecutor.execute).toHaveBeenCalledTimes(1);
          expect(amqpChannelExecutor.execute).toHaveBeenCalledWith(
            expect.any(Function),
            { retryOnError: true },
          );
        });

        it('should assert queue (with optional params)', async () => {
          const queue = 'fake-queue';
          const disuseExpireMs = 16160;
          await amqpConnection.assertQueue({
            queue,
            durable: true,
            exclusive: true,
            autoDelete: true,
            deadLetterExchange: 'fake-dead-letter-exchange',
            deadLetterRoutingKey: 'fake-dead-letter-routing-key',
            singleActiveConsumer: true,
            disuseExpireMs,
          });
          expect(amqpChannel.assertQueue).toHaveBeenCalledWith(queue, {
            durable: true,
            exclusive: true,
            autoDelete: true,
            deadLetterExchange: 'fake-dead-letter-exchange',
            deadLetterRoutingKey: 'fake-dead-letter-routing-key',
            expires: disuseExpireMs,
            arguments: {
              'x-single-active-consumer': true,
            },
          });
        });

        it('should return asserted queue name', async () => {
          await expect(
            amqpConnection.assertQueue({
              exclusive: false,
              durable: false,
              autoDelete: false,
            }),
          ).resolves.toBe('fake-asserted-queue');
        });
      });
    });
  });

  describe('deleteQueue()', () => {
    withMockedExecuteMethod(() => {
      executeWhenConnected(() => {
        it('should delete the queue', async () => {
          await amqpConnection.deleteQueue('fake-queue');

          expect(amqpChannel.deleteQueue).toHaveBeenCalledWith('fake-queue');
          expect(amqpChannelExecutor.execute).toHaveBeenCalledTimes(1);
          expect(amqpChannelExecutor.execute).toHaveBeenCalledWith(
            expect.any(Function),
            { retryOnError: true },
          );
        });
      });
    });
  });

  describe('assertExchange()', () => {
    withMockedExecuteMethod(() => {
      executeWhenConnected(() => {
        it('should assert exchange', async () => {
          await amqpConnection.assertExchange({
            exchange: 'fake-exchange',
            type: ExchangeType.FANOUT,
            durable: false,
            autoDelete: false,
          });

          expect(amqpChannel.assertExchange).toHaveBeenCalledWith(
            'fake-exchange',
            'fanout',
            { durable: false, autoDelete: false },
          );

          expect(amqpChannelExecutor.execute).toHaveBeenCalledWith(
            expect.any(Function),
            { retryOnError: true },
          );
        });

        it('should validate exchange type (valid)', async () => {
          const validExchangeTypes = ['direct', 'fanout', 'topic', 'headers'];

          for (const exchangeType of validExchangeTypes) {
            await expect(
              amqpConnection.assertExchange({
                exchange: 'fake-exchange',
                // @ts-ignore: Fake exchange type
                type: exchangeType,
                durable: true,
                autoDelete: true,
              }),
            ).resolves.toBeUndefined();
          }
        });

        it('should validate exchange type (invalid)', async () => {
          const invalidExchangeTypes = [
            null,
            undefined,
            false,
            'fake-exchange-type',
            0,
            'DiReCt',
            'Topic',
            'HEADERS',
          ];

          for (const exchangeType of invalidExchangeTypes) {
            await expect(
              amqpConnection.assertExchange({
                exchange: 'fake-exchange',
                // @ts-ignore: Fake exchange type
                type: exchangeType,
                durable: true,
                autoDelete: true,
              }),
            ).rejects.toThrowError(`Invalid exchange type: ${exchangeType}`);
          }
        });
      });
    });
  });

  describe('setChannelPrefetchCount()', () => {
    withMockedExecuteMethod(() => {
      executeWhenConnected(() => {
        it('should set prefetch count', async () => {
          await amqpConnection.setChannelPrefetchCount(146);

          expect(amqpChannel.prefetch).toHaveBeenCalledWith(146, true);
          expect(amqpChannelExecutor.execute).toHaveBeenCalledTimes(1);
          expect(amqpChannelExecutor.execute).toHaveBeenCalledWith(
            expect.any(Function),
            { retryOnError: true },
          );
        });
      });
    });
  });

  describe('setConsumerPrefetchCount()', () => {
    withMockedExecuteMethod(() => {
      executeWhenConnected(() => {
        it('should set prefetch count', async () => {
          await amqpConnection.setConsumerPrefetchCount(146);

          expect(amqpChannel.prefetch).toHaveBeenCalledWith(146, false);
          expect(amqpChannelExecutor.execute).toHaveBeenCalledTimes(1);
          expect(amqpChannelExecutor.execute).toHaveBeenCalledWith(
            expect.any(Function),
            { retryOnError: true },
          );
        });
      });
    });
  });

  describe('bindQueue()', () => {
    withMockedExecuteMethod(() => {
      executeWhenConnected(() => {
        it('should bind queue (1)', async () => {
          await amqpConnection.bindQueue({
            queue: 'fake-queue',
            exchange: 'fake-exchange',
          });

          expect(amqpChannel.bindQueue).toHaveBeenCalledWith(
            'fake-queue',
            'fake-exchange',
            '',
          );

          expect(amqpChannelExecutor.execute).toHaveBeenCalledWith(
            expect.any(Function),
            { retryOnError: true },
          );
        });

        it('should bind queue (2)', async () => {
          await amqpConnection.bindQueue({
            queue: 'fake-queue',
            exchange: 'fake-exchange',
            routingKey: 'fake-routing-key',
          });

          expect(amqpChannel.bindQueue).toHaveBeenCalledWith(
            'fake-queue',
            'fake-exchange',
            'fake-routing-key',
          );
        });
      });
    });
  });

  describe('consumeQueue()', () => {
    withMockedExecuteMethod(() => {
      executeWhenConnected(() => {
        beforeEach(() => {
          amqpChannel.consume.mockResolvedValue({
            consumerTag: 'fake-consumer-tag',
          });
        });

        it('should consume queue (1)', async () => {
          await amqpConnection.consumeQueue('fake-queue', () => {
            'fake-handler';
          });

          expect(amqpChannel.consume).toHaveBeenCalledWith(
            'fake-queue',
            expect.any(Function),
            { noAck: true },
          );

          expect(amqpChannelExecutor.execute).toHaveBeenCalledWith(
            expect.any(Function),
            { retryOnError: true },
          );
        });

        it('should consume queue (2)', async () => {
          await amqpConnection.consumeQueue(
            'fake-queue',
            () => {
              'fake-handler';
            },
            { requiresAcknowledgement: false },
          );

          expect(amqpChannel.consume).toHaveBeenCalledWith(
            'fake-queue',
            expect.any(Function),
            { noAck: true },
          );
        });

        it('should consume queue (3)', async () => {
          await amqpConnection.consumeQueue(
            'fake-queue',
            () => {
              'fake-handler';
            },
            { requiresAcknowledgement: true },
          );

          expect(amqpChannel.consume).toHaveBeenCalledWith(
            'fake-queue',
            expect.any(Function),
            { noAck: false },
          );
        });

        it('should return the consumer tag', async () => {
          await expect(
            amqpConnection.consumeQueue(
              'fake-queue',
              () => {
                'fake handler';
              },
              { requiresAcknowledgement: true },
            ),
          ).resolves.toBe('fake-consumer-tag');
        });

        it('should use handler for message contents', async () => {
          const handler = jest.fn();
          const messageContent = Buffer.from('fake-content');
          const messageHeaders = { fake: 'headers' };

          await amqpConnection.consumeQueue('fake-queue', handler, {
            requiresAcknowledgement: true,
          });

          const consumeHandler = amqpChannel.consume.mock.calls.pop()[1];

          consumeHandler({
            content: messageContent,
            properties: {
              correlationId: 'fake-correlation-id',
              replyTo: 'fake-reply-queue',
              headers: messageHeaders,
            },
            fields: {
              deliveryTag: 14660,
            },
          });

          expect(handler).toHaveBeenCalledWith({
            content: messageContent,
            deliveryTag: 14660,
            correlationId: 'fake-correlation-id',
            replyQueue: 'fake-reply-queue',
            headers: messageHeaders,
          });
        });
      });
    });
  });

  describe('acknowledge()', () => {
    withMockedExecuteMethod(() => {
      executeWhenConnected(() => {
        it('should set cancel channel consumption', async () => {
          const deliveryTag = 14660;

          await amqpConnection.acknowledge(deliveryTag);

          expect(amqpChannel.ack).toHaveBeenCalledTimes(1);
          expect(amqpChannel.ack).toHaveBeenCalledWith({
            fields: { deliveryTag },
          });
          expect(amqpChannelExecutor.execute).toHaveBeenCalledTimes(1);
          expect(amqpChannelExecutor.execute).toHaveBeenCalledWith(
            expect.any(Function),
            { retryOnError: false },
          );
        });
      });
    });
  });

  describe('negativeAcknowledge()', () => {
    withMockedExecuteMethod(() => {
      executeWhenConnected(() => {
        it('should set cancel channel consumption', async () => {
          const deliveryTag = 14660;

          await amqpConnection.negativeAcknowledge(deliveryTag);

          expect(amqpChannel.nack).toHaveBeenCalledTimes(1);
          expect(amqpChannel.nack).toHaveBeenCalledWith({
            fields: { deliveryTag },
          });
          expect(amqpChannelExecutor.execute).toHaveBeenCalledTimes(1);
          expect(amqpChannelExecutor.execute).toHaveBeenCalledWith(
            expect.any(Function),
            { retryOnError: false },
          );
        });
      });
    });
  });

  describe('cancelConsumption()', () => {
    withMockedExecuteMethod(() => {
      executeWhenConnected(() => {
        it('should set cancel channel consumption', async () => {
          await amqpConnection.cancelConsumption('fake-consumer-tag');

          expect(amqpChannel.cancel).toHaveBeenCalledWith('fake-consumer-tag');

          expect(amqpChannelExecutor.execute).toHaveBeenCalledWith(
            expect.any(Function),
            { retryOnError: false },
          );
        });
      });
    });
  });

  describe('publishToExchange()', () => {
    withMockedExecuteMethod(() => {
      executeWhenConnected(() => {
        beforeEach(() => {
          amqpChannel.publish.mockImplementation(
            (
              exchange: any,
              routingKey: any,
              dataBuffer: any,
              options: any,
              callback: () => void,
            ) => {
              callback();
            },
          );
        });

        it('should publish data to the exchange (without optional params)', async () => {
          const dataBuffer = Buffer.from('fake-data');

          await amqpConnection.publishToExchange('fake-exchange', dataBuffer);

          expect(amqpChannel.publish).toHaveBeenCalledWith(
            'fake-exchange',
            '',
            dataBuffer,
            {
              correlationId: undefined,
              expiration: undefined,
              persistent: false,
              mandatory: false,
            },
            expect.any(Function),
          );

          expect(amqpChannelExecutor.execute).toHaveBeenCalledWith(
            expect.any(Function),
            { retryOnError: true },
          );
        });

        it('should publish data to the exchange (with optional params)', async () => {
          const dataBuffer = Buffer.from('fake-data');

          await amqpConnection.publishToExchange('fake-exchange', dataBuffer, {
            correlationId: 'fake-correlation-id',
            routingKey: 'fake-routing-key',
            persistent: true,
            mandatory: true,
            expireMs: 14600,
          });

          expect(amqpChannel.publish).toHaveBeenCalledWith(
            'fake-exchange',
            'fake-routing-key',
            dataBuffer,
            {
              correlationId: 'fake-correlation-id',
              persistent: true,
              mandatory: true,
              expiration: '14600',
            },
            expect.any(Function),
          );
        });

        it('should throw error on callback error', async () => {
          const error = new Error('Fake error');

          amqpChannel.publish.mockImplementation(
            (
              exchange: any,
              routingKey: any,
              dataBuffer: any,
              options: any,
              callback: (error?: Error) => void,
            ) => {
              callback(error);
            },
          );

          await expect(
            amqpConnection.publishToExchange(
              'fake-exchange',
              Buffer.from('fake-data'),
            ),
          ).rejects.toThrow(error);
        });
      });
    });
  });

  describe('sendToQueue()', () => {
    withMockedExecuteMethod(() => {
      executeWhenConnected(() => {
        beforeEach(() => {
          amqpChannel.sendToQueue.mockImplementation(
            (
              queue: any,
              dataBuffer: any,
              options: any,
              callback: () => void,
            ) => {
              callback();
            },
          );
        });

        it('should publish data to the exchange (without optional params)', async () => {
          const dataBuffer = Buffer.from('fake-data');

          await amqpConnection.sendToQueue('fake-queue', dataBuffer);

          expect(amqpChannel.sendToQueue).toHaveBeenCalledWith(
            'fake-queue',
            dataBuffer,
            {
              correlationId: undefined,
              replyTo: undefined,
              expiration: undefined,
              persistent: false,
              mandatory: false,
            },
            expect.any(Function),
          );

          expect(amqpChannelExecutor.execute).toHaveBeenCalledWith(
            expect.any(Function),
            { retryOnError: true },
          );
        });

        it('should publish data to the exchange (with optional params)', async () => {
          const dataBuffer = Buffer.from('fake-data');

          await amqpConnection.sendToQueue('fake-queue', dataBuffer, {
            correlationId: 'fake-correlation-id',
            replyQueue: 'fake-reply-queue',
            persistent: true,
            mandatory: true,
            expireMs: 14600,
          });

          expect(amqpChannel.sendToQueue).toHaveBeenCalledWith(
            'fake-queue',
            dataBuffer,
            {
              correlationId: 'fake-correlation-id',
              replyTo: 'fake-reply-queue',
              persistent: true,
              mandatory: true,
              expiration: '14600',
            },
            expect.any(Function),
          );
        });

        it('should throw error on callback error', async () => {
          const error = new Error('Fake error');

          amqpChannel.sendToQueue.mockImplementation(
            (
              queue: any,
              dataBuffer: any,
              options: any,
              callback: (error?: Error) => void,
            ) => {
              callback(error);
            },
          );

          await expect(
            amqpConnection.sendToQueue('fake-queue', Buffer.from('fake-data')),
          ).rejects.toThrow(error);
        });
      });
    });
  });

  //   // --- events

  describe('[handle connection\'s "close" event]', () => {
    executeWhenConnected(() => {
      let closedEventSpy: jest.Mock;

      beforeEach(() => {
        closedEventSpy = jest.fn();
        amqpConnection.on('closed', closedEventSpy);
        jest.spyOn(amqpConnection, 'dispose').mockResolvedValue();
      });

      it('should emit "closed" event', async () => {
        await amqplibConnectionEmitter.emitAsync('close');
        expect(closedEventSpy).toHaveBeenCalledWith();
      });

      it('should dispose', async () => {
        await amqplibConnectionEmitter.emitAsync('close');
        expect(amqpConnection.dispose).toHaveBeenCalledWith();
      });
    });

    executeWhenNotConnected(() => {
      let closedEventSpy: jest.Mock;

      beforeEach(() => {
        closedEventSpy = jest.fn();
        amqpConnection.on('closed', closedEventSpy);

        jest.spyOn(amqpConnection, 'dispose').mockResolvedValue();
      });

      it('should do nothing', async () => {
        await amqplibConnectionEmitter.emitAsync('close');

        expect(closedEventSpy).not.toHaveBeenCalled();
        expect(amqpConnection.dispose).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle connection\'s "error" event]', () => {
    executeWhenConnected(() => {
      let errorEventSpy: jest.Mock;

      beforeEach(() => {
        errorEventSpy = jest.fn();
        amqpConnection.on('error', errorEventSpy);
      });

      it('should emit "error" event', () => {
        const error = new Error('Fake error');
        amqplibConnectionEmitter.emit('error', error);

        expect(errorEventSpy).toHaveBeenCalledWith(error);
      });

      it('should not emit "error" on connection close error when unsubscribed', () => {
        amqpConnection.removeListener('error', errorEventSpy);

        amqplibConnectionEmitter.emit('error', new Error('Fake error'));

        expect(errorEventSpy).not.toHaveBeenCalled();
      });
    });

    executeWhenDisposed(() => {
      it('should not emit "error" event', () => {
        const errorEventSpy = jest.fn();
        amqpConnection.on('error', errorEventSpy);

        amqplibConnectionEmitter.emit('error', new Error('Fake error'));

        expect(errorEventSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle channel\'s "close" event]', () => {
    executeWhenConnected(() => {
      beforeEach(() => {
        jest.spyOn(amqpConnection, 'recreateChannel').mockResolvedValue();
      });

      it('should re-create the channel', async () => {
        await amqpChannelContainerEmitter.emitAsync('close');

        expect(amqpConnection.recreateChannel).toHaveBeenCalledWith();
      });
    });

    executeWhenNotConnected(() => {
      beforeEach(() => {
        jest.spyOn(amqpConnection, 'recreateChannel').mockResolvedValue();
      });

      it('should do nothing', async () => {
        await amqpChannelContainerEmitter.emitAsync('close');

        expect(amqpConnection.recreateChannel).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle channel\'s "error" event]', () => {
    executeWhenConnected(() => {
      let errorEventSpy: jest.Mock;

      beforeEach(() => {
        errorEventSpy = jest.fn();
        amqpConnection.on('error', errorEventSpy);
      });

      it('should emit "error" event', async () => {
        const error = new Error('Fake error');
        await amqpChannelContainerEmitter.emitAsync('error', error);

        expect(errorEventSpy).toHaveBeenCalledWith(error);
      });

      it('should not emit "error" event when unsubscribed', async () => {
        const error = new Error('Fake error');
        await amqpChannelContainerEmitter.emitAsync('error', error);

        expect(errorEventSpy).toHaveBeenCalledWith(error);
      });
    });

    executeWhenDisposed(() => {
      it('should not emit "error" event', async () => {
        const errorEventSpy = jest.fn();
        amqpConnection.on('error', errorEventSpy);

        await amqpChannelContainerEmitter.emitAsync(
          'error',
          new Error('Fake error'),
        );

        expect(errorEventSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle channel\'s "return" event]', () => {
    executeWhenConnected(() => {
      let returnEventSpy: jest.Mock;

      beforeEach(() => {
        returnEventSpy = jest.fn();
        amqpConnection.on('return', returnEventSpy);
      });

      it('should emit "return" event', () => {
        const message = {
          properties: { correlationId: 'fake-correlation-id' },
        };
        amqpChannelContainerEmitter.emit('return', message);

        expect(returnEventSpy).toHaveBeenCalledWith('fake-correlation-id');
      });

      it('should not emit "return" on connection close return when unsubscribed', () => {
        amqpConnection.removeListener('return', returnEventSpy);

        amqpChannelContainerEmitter.emit('return', {
          properties: { correlationId: 'fake-correlation-id' },
        });

        expect(returnEventSpy).not.toHaveBeenCalled();
      });
    });

    executeWhenNotConnected(() => {
      it('should not emit "return" event', () => {
        const returnEventSpy = jest.fn();
        amqpConnection.on('return', returnEventSpy);

        amqpChannelContainerEmitter.emit('return', {
          properties: { correlationId: 'fake-correlation-id' },
        });

        expect(returnEventSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle executor\'s "channelBecameUnavailable" event]', () => {
    executeWhenConnected(() => {
      beforeEach(() => {
        jest.spyOn(amqpConnection, 'recreateChannel').mockResolvedValue();
      });

      it('should re-create the channel', async () => {
        await amqpChannelExecutorEmitter.emitAsync('channelBecameUnavailable');

        expect(amqpConnection.recreateChannel).toHaveBeenCalledWith();
      });
    });

    executeWhenNotConnected(() => {
      beforeEach(() => {
        jest.spyOn(amqpConnection, 'recreateChannel').mockResolvedValue();
      });

      it('should do nothing', async () => {
        await amqpChannelExecutorEmitter.emitAsync('channelBecameUnavailable');

        expect(amqpConnection.recreateChannel).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle executor\'s "connectionClosing" event]', () => {
    executeWhenConnected(() => {
      let closedEventSpy: jest.Mock;

      beforeEach(() => {
        closedEventSpy = jest.fn();
        amqpConnection.on('closed', closedEventSpy);

        jest.spyOn(amqpConnection, 'dispose').mockResolvedValue();
      });

      it('should emit "closed" event', async () => {
        await amqpChannelExecutorEmitter.emitAsync('connectionClosing');

        expect(closedEventSpy).toHaveBeenCalledWith();
      });

      it('should dispose', async () => {
        await amqpChannelExecutorEmitter.emitAsync('connectionClosing');

        expect(amqpConnection.dispose).toHaveBeenCalledWith();
      });
    });

    executeWhenNotConnected(() => {
      let closedEventSpy: jest.Mock;

      beforeEach(() => {
        closedEventSpy = jest.fn();
        amqpConnection.on('closed', closedEventSpy);

        jest.spyOn(amqpConnection, 'dispose').mockResolvedValue();
      });

      it('should do nothing', async () => {
        await amqpChannelExecutorEmitter.emitAsync('connectionClosing');

        expect(closedEventSpy).not.toHaveBeenCalled();
        expect(amqpConnection.dispose).not.toHaveBeenCalled();
      });
    });
  });

  // --- helpers

  function withMockedExecuteMethod(tests: () => void) {
    describe('[with mocked execute() method]', () => {
      beforeEach(() => {
        amqpChannelExecutor.execute.mockImplementation((command) =>
          command(amqpChannel),
        );
      });

      tests();
    });
  }

  function executeWhenConnected(tests: () => void) {
    describe('[connected]', () => {
      beforeEach(async () => {
        await amqpConnection.connect();
      });

      tests();
    });
  }

  function executeWhenNotConnected(tests: () => void) {
    describe('[ready]', () => {
      tests();
    });

    executeWhenDisposed(tests);
  }

  function executeWhenDisposed(tests: () => void) {
    describe('[disposed]', () => {
      beforeEach(async () => {
        await amqpConnection.connect();
        await amqpConnection.dispose();
      });

      tests();
    });
  }

  function createAmqpConnectionInstance(
    options: Partial<AmqpConnectionOptions> = {},
  ) {
    return new AmqpConnection(
      {
        ...amqpConnectionOptions,
        ...options,
      },
      amqpConnectionDependencies,
    );
  }
});

function createAmqpChannelMock() {
  const channel = {
    publish: jest.fn(async () => {}),
    sendToQueue: jest.fn(async () => {}),
    assertQueue: jest.fn(async () => null),
    deleteQueue: jest.fn(async () => {}),
    assertExchange: jest.fn(async () => {}),
    prefetch: jest.fn(async () => {}),
    bindQueue: jest.fn(async () => {}),
    consume: jest.fn(async () => null),
    cancel: jest.fn(async () => {}),
    ack: jest.fn(async () => {}),
    nack: jest.fn(async () => {}),
    on: jest.fn(),
  };

  return channel;
}
