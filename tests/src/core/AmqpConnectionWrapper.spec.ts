import 'jest-extended';
import { ConnectionClosedError } from '../../../src/core/errors';
import {
  eventEmitterHelper,
  factoryMockHelper,
  FactoryMock,
} from '../../helpers';
import { AsyncEventEmitter } from '../../helpers/AsyncEventEmitter';
import {
  AmqpConnection,
  AmqpConnectionContainer,
  AmqpConnectionExecutor,
  AmqpConnectionInitializer,
  AmqpConnectionWrapper,
  AmqpConnectionWrapperOptions,
} from '../../../src/core';
import { ExchangeType } from '../../../src/core/types';

describe('AmqpConnectionWrapper', () => {
  const MAX_CONNECTION_ATTEMPTS = 46;
  const CONNECTION_ATTEMPT_TIMEOUT_BASE = 1.46;
  const CONNECTION_ATTEMPT_TIMEOUT_MULTIPLIER = 1460;
  const COMMAND_TIMEOUT_MS = 146;
  const COMMAND_RETRY_INTERVAL_MS = 6456;
  const STALE_COMMAND_DURATION_MS = 1335;

  const amqpConnectionWrapperOptions = {
    maxConnectionAttempts: MAX_CONNECTION_ATTEMPTS,
    connectionAttemptTimeoutBase: CONNECTION_ATTEMPT_TIMEOUT_BASE,
    connectionAttemptTimeoutMultiplier: CONNECTION_ATTEMPT_TIMEOUT_MULTIPLIER,
    commandTimeoutMs: COMMAND_TIMEOUT_MS,
    commandRetryIntervalMs: COMMAND_RETRY_INTERVAL_MS,
    staleCommandDurationMs: STALE_COMMAND_DURATION_MS,
  };

  let amqpConnectionWrapperDependencies: any;

  let amqpConnectionWrapper: AmqpConnectionWrapper;

  let amqpConnection: jest.Mocked<AmqpConnection>;
  let amqpConnectionProvider: any;

  let amqpConnectionContainer: jest.Mocked<AmqpConnectionContainer>;
  let amqpConnectionContainerEmitter: AsyncEventEmitter;
  let amqpConnectionContainerFactory: FactoryMock<AmqpConnectionContainer>;

  let amqpConnectionInitializer: jest.Mocked<AmqpConnectionInitializer>;
  let amqpConnectionInitializerEmitter: AsyncEventEmitter;
  let amqpConnectionInitializerFactory: FactoryMock<AmqpConnectionInitializer>;

  let amqpConnectionExecutor: jest.Mocked<AmqpConnectionExecutor>;
  let amqpConnectionExecutorEmitter: AsyncEventEmitter;
  let amqpConnectionExecutorFactory: FactoryMock<AmqpConnectionExecutor>;

  beforeEach(() => {
    jest.useFakeTimers();

    amqpConnection = createAmqpConnectionMock();
    amqpConnectionProvider = { dummy: 'amqpConnectionProvider' };

    amqpConnectionContainer = {
      on: jest.fn(),
      removeListener: jest.fn(),
      get: jest.fn(() => null),
      set: jest.fn(),
    } as unknown as jest.Mocked<AmqpConnectionContainer>;

    amqpConnectionContainerEmitter = eventEmitterHelper.install(
      amqpConnectionContainer,
      { ignoreUnhandledErrors: true },
    );

    amqpConnectionContainerFactory = factoryMockHelper.create(
      amqpConnectionContainer,
    );

    amqpConnectionInitializer = {
      on: jest.fn(),
      removeListener: jest.fn(),
      initializeConnection: jest.fn(async () => amqpConnection),
      cancel: jest.fn(),
    } as unknown as jest.Mocked<AmqpConnectionInitializer>;

    amqpConnectionInitializerEmitter = eventEmitterHelper.install(
      amqpConnectionInitializer,
      { ignoreUnhandledErrors: true },
    );
    amqpConnectionInitializerFactory = factoryMockHelper.create(
      amqpConnectionInitializer,
    );

    amqpConnectionExecutor = {
      on: jest.fn(),
      removeListener: jest.fn(),
      execute: jest.fn(),
      executeOnce: jest.fn(),
      resumeAll: jest.fn(),
      cancelAll: jest.fn(),
    } as unknown as jest.Mocked<AmqpConnectionExecutor>;

    amqpConnectionExecutorFactory = factoryMockHelper.create(
      amqpConnectionExecutor,
    );
    amqpConnectionExecutorEmitter = eventEmitterHelper.install(
      amqpConnectionExecutor,
    );

    amqpConnectionWrapperDependencies = {
      amqpConnectionProvider,
      amqpConnectionContainerFactory,
      amqpConnectionInitializerFactory,
      amqpConnectionExecutorFactory,
    };

    amqpConnectionWrapper = createAmqpConnectionWrapperInstance();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor()', () => {
    it('should validate maxConnectionAttempts option', () => {
      for (const maxConnectionAttempts of [
        undefined,
        null,
        -999,
        -1,
        0,
        0.99,
      ]) {
        expect(() =>
          // @ts-ignore: ignore invalid maxConnectionAttempts
          createAmqpConnectionWrapperInstance({ maxConnectionAttempts }),
        ).toThrowError('"options.maxConnectionAttempts" must be 1 or greater');
      }
    });

    it('should validate commandTimeoutMs option', () => {
      for (const commandTimeoutMs of [undefined, null, -999, -1, 0, 0.99]) {
        expect(() =>
          // @ts-ignore: ignore invalid commandTimeoutMs
          createAmqpConnectionWrapperInstance({ commandTimeoutMs }),
        ).toThrowError('"options.commandTimeoutMs" must be 1 or greater');
      }
    });

    it('should validate commandRetryIntervalMs option', () => {
      for (const commandRetryIntervalMs of [
        undefined,
        null,
        -999,
        -1,
        0,
        0.99,
      ]) {
        expect(() =>
          // @ts-ignore: ignore invalid commandRetryIntervalMs
          createAmqpConnectionWrapperInstance({ commandRetryIntervalMs }),
        ).toThrowError('"options.commandRetryIntervalMs" must be 1 or greater');
      }
    });

    it('should validate staleCommandDurationMs option', () => {
      for (const staleCommandDurationMs of [
        undefined,
        null,
        -999,
        -1,
        0,
        0.99,
      ]) {
        expect(() =>
          // @ts-ignore: ignore invalid staleCommandDurationMs
          createAmqpConnectionWrapperInstance({ staleCommandDurationMs }),
        ).toThrowError('"options.staleCommandDurationMs" must be 1 or greater');
      }
    });

    it('should validate connectionAttemptTimeoutBase option', () => {
      for (const connectionAttemptTimeoutBase of [
        undefined,
        null,
        -999,
        -1,
        0,
        0.99,
      ]) {
        expect(() =>
          // @ts-ignore: ignore invalid connectionAttemptTimeoutBase
          createAmqpConnectionWrapperInstance({ connectionAttemptTimeoutBase }),
        ).toThrowError(
          '"options.connectionAttemptTimeoutBase" must be 1 or greater',
        );
      }
    });

    it('should validate connectionAttemptTimeoutMultiplier option', () => {
      for (const connectionAttemptTimeoutMultiplier of [
        undefined,
        null,
        -999,
        -1,
        0,
      ]) {
        expect(() =>
          createAmqpConnectionWrapperInstance({
            // @ts-ignore: ignore invalid connectionAttemptTimeoutMultiplier
            connectionAttemptTimeoutMultiplier,
          }),
        ).toThrowError(
          '"options.connectionAttemptTimeoutMultiplier" must be a positive number',
        );
      }
    });

    it('should create AmqpConnectionInitializer', () => {
      expect(
        amqpConnectionInitializerFactory.create,
      ).toHaveBeenCalledExactlyOnceWith(
        {
          maxAttempts: MAX_CONNECTION_ATTEMPTS,
          attemptTimeoutBase: CONNECTION_ATTEMPT_TIMEOUT_BASE,
          attemptTimeoutMultiplier: CONNECTION_ATTEMPT_TIMEOUT_MULTIPLIER,
        },
        {
          amqpConnectionProvider,
        },
      );
    });

    it('should create AmqpConnectionExecutor', () => {
      expect(
        amqpConnectionExecutorFactory.create,
      ).toHaveBeenCalledExactlyOnceWith(
        {
          commandTimeoutMs: COMMAND_TIMEOUT_MS,
          commandRetryIntervalMs: COMMAND_RETRY_INTERVAL_MS,
          staleCommandDurationMs: STALE_COMMAND_DURATION_MS,
        },
        {
          amqpConnectionContainer,
        },
      );
    });
  });

  describe('connect()', () => {
    it('should initialize connection', async () => {
      await amqpConnectionWrapper.connect();

      expect(amqpConnectionContainer.set).toHaveBeenCalledExactlyOnceWith(
        amqpConnection,
      );
      expect(
        amqpConnectionInitializer.initializeConnection,
      ).toHaveBeenCalledTimes(1);
    });

    it('should throw connection initialization error on fail', async () => {
      const error = new Error('Fake connection initialization error');
      amqpConnectionInitializer.initializeConnection.mockRejectedValue(error);

      await expect(amqpConnectionWrapper.connect()).rejects.toThrow(error);

      expect(amqpConnectionContainer.set).not.toHaveBeenCalled();
      await expect(amqpConnectionWrapper.connect()).rejects.toThrow(
        'AMQP connection cannot be reused after being disposed',
      );
    });

    it('should throw an error when already connected', async () => {
      /** no await */ amqpConnectionWrapper.connect();

      await expect(amqpConnectionWrapper.connect()).rejects.toThrow(
        new Error('AMQP connection is already (being) established'),
      );
    });

    it('should rollback when disposed after initializing a connection', async () => {
      amqpConnectionInitializer.initializeConnection.mockImplementation(
        async () => {
          /** no await */ amqpConnectionWrapper.dispose();
          return amqpConnection;
        },
      );

      await amqpConnectionWrapper.connect();

      expect(amqpConnectionContainer.set).not.toHaveBeenCalledExactlyOnceWith(
        amqpConnection,
      );
      expect(amqpConnection.dispose).toHaveBeenCalledTimes(1);
    });

    executeWhenConnected(() => {
      it('should throw an error when disposed', async () => {
        /** no await */ amqpConnectionWrapper.dispose();

        await expect(amqpConnectionWrapper.connect()).rejects.toThrow(
          new Error('AMQP connection cannot be reused after being disposed'),
        );
      });
    });
  });

  describe('reconnect()', () => {
    executeWhenConnected(() => {
      let reconnectedEventSpy: jest.Mock;
      let errorEventSpy: jest.Mock;
      let closedEventSpy: jest.Mock;
      let newConnection: jest.Mocked<AmqpConnection>;

      beforeEach(() => {
        reconnectedEventSpy = jest.fn();
        amqpConnectionWrapper.on('reconnected', reconnectedEventSpy);

        errorEventSpy = jest.fn();
        amqpConnectionWrapper.on('error', errorEventSpy);

        closedEventSpy = jest.fn();
        amqpConnectionWrapper.on('closed', closedEventSpy);

        newConnection = createAmqpConnectionMock();
        amqpConnectionInitializer.initializeConnection.mockResolvedValue(
          newConnection,
        );
        amqpConnectionContainer.set.mockClear();
        amqpConnectionInitializer.initializeConnection.mockClear();
      });

      describe('[current connection is present]', () => {
        let oldConnection: any;

        beforeEach(() => {
          oldConnection = createAmqpConnectionMock();
          // simulate container's logic to enforce correct call order
          let currentConnection = oldConnection;
          amqpConnectionContainer.get.mockImplementation(
            () => currentConnection,
          );
          amqpConnectionContainer.set.mockImplementation(
            (newConnection) => (currentConnection = newConnection),
          );
        });

        it('should dispose current connection after deleting it from the container', async () => {
          oldConnection.dispose.mockImplementation(async () => {
            expect(amqpConnectionContainer.set).toHaveBeenCalledExactlyOnceWith(
              null,
            );
          });
          await amqpConnectionWrapper.reconnect();
          expect(oldConnection.dispose).toHaveBeenCalledExactlyOnceWith();
        });
      });

      it('should create new connection and store it', async () => {
        await amqpConnectionWrapper.reconnect();
        expect(
          amqpConnectionInitializer.initializeConnection,
        ).toHaveBeenCalledWith();
        expect(amqpConnectionContainer.set).toHaveBeenCalledWith(newConnection);
      });

      it('should resume all connection executions', async () => {
        await amqpConnectionWrapper.reconnect();
        expect(
          amqpConnectionExecutor.resumeAll,
        ).toHaveBeenCalledExactlyOnceWith();
      });

      it('should emit "reconnected" event', async () => {
        await amqpConnectionWrapper.reconnect();
        expect(reconnectedEventSpy).toHaveBeenCalledExactlyOnceWith();
      });

      it('should not emit "reconnected" event when unsubscribed', async () => {
        amqpConnectionWrapper.removeListener(
          'reconnected',
          reconnectedEventSpy,
        );
        await amqpConnectionWrapper.reconnect();
        expect(reconnectedEventSpy).not.toHaveBeenCalled();
      });

      it('should rollback when disposed while creating new connection', async () => {
        amqpConnectionInitializer.initializeConnection.mockImplementation(
          async () => {
            /** no await */ amqpConnectionWrapper.dispose();
            return newConnection;
          },
        );
        await amqpConnectionWrapper.reconnect();
        expect(amqpConnectionContainer.set).not.toHaveBeenCalledExactlyOnceWith(
          newConnection,
        );
        expect(amqpConnectionExecutor.resumeAll).not.toHaveBeenCalled();
        expect(reconnectedEventSpy).not.toHaveBeenCalled();
        expect(newConnection.dispose).toHaveBeenCalledExactlyOnceWith();
      });

      it("should not re-create connection when it's already being re-created", async () => {
        await Promise.all([
          amqpConnectionWrapper.reconnect(),
          amqpConnectionWrapper.reconnect(),
          amqpConnectionWrapper.reconnect(),
        ]);
        expect(
          amqpConnectionInitializer.initializeConnection,
        ).toHaveBeenCalledTimes(1);
        await amqpConnectionWrapper.reconnect();
        expect(
          amqpConnectionInitializer.initializeConnection,
        ).toHaveBeenCalledTimes(2);
      });

      describe('[connection creation error]', () => {
        let connectionCreationError: Error;
        let disposeSpy: jest.SpyInstance;

        beforeEach(() => {
          connectionCreationError = new Error('Fake connection creation error');
          amqpConnectionInitializer.initializeConnection.mockRejectedValue(
            connectionCreationError,
          );
          disposeSpy = jest.spyOn(amqpConnectionWrapper, 'dispose');
        });

        it('should emit "error" & "closed" events on error', async () => {
          await amqpConnectionWrapper.reconnect();

          expect(errorEventSpy).toHaveBeenCalledExactlyOnceWith(
            connectionCreationError,
          );
          expect(closedEventSpy).toHaveBeenCalledExactlyOnceWith();
        });

        it('should not emit any events event on error when unsubscribed', async () => {
          amqpConnectionWrapper.removeListener('error', errorEventSpy);
          amqpConnectionWrapper.removeListener('closed', closedEventSpy);
          await amqpConnectionWrapper.reconnect();
          expect(errorEventSpy).not.toHaveBeenCalled();
          expect(closedEventSpy).not.toHaveBeenCalled();
        });

        it('should dispose', async () => {
          await amqpConnectionWrapper.reconnect();
          expect(
            amqpConnectionWrapper.dispose,
          ).toHaveBeenCalledExactlyOnceWith();
        });

        it('should not emit any errors and dispose when disposed while creating new connection', async () => {
          amqpConnectionInitializer.initializeConnection.mockImplementation(
            async () => {
              amqpConnectionWrapper.dispose();
              disposeSpy.mockClear();
              throw connectionCreationError;
            },
          );
          await amqpConnectionWrapper.reconnect();
          expect(errorEventSpy).not.toHaveBeenCalled();
          expect(closedEventSpy).not.toHaveBeenCalled();
          expect(amqpConnectionWrapper.dispose).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('dispose()', () => {
    executeWhenConnected(() => {
      beforeEach(() => {
        amqpConnectionContainer.set.mockClear();
      });

      it('should cancel all channel command executions', async () => {
        await amqpConnectionWrapper.dispose();

        expect(
          amqpConnectionExecutor.cancelAll,
        ).toHaveBeenCalledExactlyOnceWith(new ConnectionClosedError());
      });

      it('should not dispose when already disposed', async () => {
        amqpConnectionContainer.get.mockReturnValue(amqpConnection);

        await Promise.all([
          amqpConnectionWrapper.dispose(),
          amqpConnectionWrapper.dispose(),
        ]);
        await amqpConnectionWrapper.dispose();

        expect(amqpConnection.dispose).toHaveBeenCalledTimes(1);
        expect(amqpConnectionContainer.set).toHaveBeenCalledTimes(1);
      });

      it('should dispose current amqp connection when present', async () => {
        amqpConnectionContainer.get.mockReturnValue(amqpConnection);

        await amqpConnectionWrapper.dispose();

        expect(amqpConnectionContainer.set).toHaveBeenCalledTimes(1);
        expect(amqpConnectionContainer.set).toHaveBeenCalledWith(null);
        expect(amqpConnectionContainer.set).toHaveBeenCalledBefore(
          amqpConnection.dispose,
        );

        expect(amqpConnection.dispose).toHaveBeenCalledTimes(1);
      });

      it('should not dispose amqp connection if not present', async () => {
        await expect(amqpConnectionWrapper.dispose()).toResolve();
      });

      it('should cancel amqp connection initialization', async () => {
        expect(amqpConnectionInitializer.cancel).not.toHaveBeenCalled();

        await amqpConnectionWrapper.dispose();

        expect(amqpConnectionInitializer.cancel).toHaveBeenCalledTimes(1);
      });
    });

    it('should do nothing when not connected', async () => {
      await amqpConnectionWrapper.dispose();

      expect(amqpConnectionContainer.set).not.toHaveBeenCalled();
      expect(amqpConnection.dispose).not.toHaveBeenCalled();
    });
  });

  describe('assertQueue()', () => {
    executeWhenConnected(() => {
      it('should assert queue (without optional params)', async () => {
        await amqpConnectionWrapper.assertQueue({
          durable: false,
          exclusive: false,
          autoDelete: false,
        });

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'assertQueue',
          args: [
            {
              durable: false,
              exclusive: false,
              autoDelete: false,
              queue: undefined,
              disuseExpireMs: undefined,
              deadLetterExchange: undefined,
              deadLetterRoutingKey: undefined,
              singleActiveConsumer: undefined,
            },
          ],
          retryOnError: true,
        });
      });

      it('should assert queue (with optional params)', async () => {
        await amqpConnectionWrapper.assertQueue({
          queue: 'fake-queue',
          durable: true,
          exclusive: true,
          autoDelete: true,
          disuseExpireMs: 16160,
          deadLetterExchange: 'fake-dead-letter-exchange',
          deadLetterRoutingKey: 'fake-dead-letter-routing-key',
          singleActiveConsumer: true,
        });

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'assertQueue',
          args: [
            {
              queue: 'fake-queue',
              durable: true,
              exclusive: true,
              autoDelete: true,
              disuseExpireMs: 16160,
              deadLetterExchange: 'fake-dead-letter-exchange',
              deadLetterRoutingKey: 'fake-dead-letter-routing-key',
              singleActiveConsumer: true,
            },
          ],
          retryOnError: true,
        });
      });

      it('should return asserted queue name', async () => {
        const assertedQueue = 'fake-asserted-queue';

        amqpConnectionExecutor.execute.mockImplementation(
          async () => assertedQueue,
        );

        await expect(
          amqpConnectionWrapper.assertQueue({
            durable: false,
            exclusive: false,
            autoDelete: false,
          }),
        ).resolves.toBe(assertedQueue);
      });
    });
  });

  describe('deleteQueue()', () => {
    executeWhenConnected(() => {
      it('should delete queue', async () => {
        await amqpConnectionWrapper.deleteQueue('fake-queue');

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'deleteQueue',
          args: ['fake-queue'],
          retryOnError: true,
        });
      });
    });
  });

  describe('assertExchange()', () => {
    executeWhenConnected(() => {
      it('should assert exchange (case 1)', async () => {
        await amqpConnectionWrapper.assertExchange({
          exchange: 'fake-exchange',
          durable: false,
          type: ExchangeType.DIRECT,
          autoDelete: false,
        });

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'assertExchange',
          args: [
            {
              exchange: 'fake-exchange',
              durable: false,
              type: ExchangeType.DIRECT,
              autoDelete: false,
            },
          ],
          retryOnError: true,
        });
      });

      it('should assert exchange (case 2)', async () => {
        await amqpConnectionWrapper.assertExchange({
          exchange: 'fake-exchange',
          type: ExchangeType.FANOUT,
          durable: true,
          autoDelete: false,
        });

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'assertExchange',
          args: [
            {
              exchange: 'fake-exchange',
              type: ExchangeType.FANOUT,
              durable: true,
              autoDelete: false,
            },
          ],
          retryOnError: true,
        });
      });
    });
  });

  describe('setChannelPrefetchCount()', () => {
    executeWhenConnected(() => {
      it('should set prefetch count', async () => {
        await amqpConnectionWrapper.setChannelPrefetchCount(146);

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'setChannelPrefetchCount',
          args: [146],
          retryOnError: true,
        });
      });
    });
  });

  describe('setConsumerPrefetchCount()', () => {
    executeWhenConnected(() => {
      it('should set prefetch count', async () => {
        await amqpConnectionWrapper.setConsumerPrefetchCount(146);

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'setConsumerPrefetchCount',
          args: [146],
          retryOnError: true,
        });
      });
    });
  });

  describe('bindQueue()', () => {
    executeWhenConnected(() => {
      it('should bind queue (1)', async () => {
        await amqpConnectionWrapper.bindQueue({
          exchange: 'fake-exchange',
          queue: 'fake-queue',
        });

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'bindQueue',
          args: [
            {
              routingKey: undefined,
              exchange: 'fake-exchange',
              queue: 'fake-queue',
            },
          ],
          retryOnError: true,
        });
      });

      it('should bind queue (2)', async () => {
        await amqpConnectionWrapper.bindQueue({
          exchange: 'fake-exchange',
          queue: 'fake-queue',
          routingKey: 'fake-routing-key',
        });

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'bindQueue',
          args: [
            {
              exchange: 'fake-exchange',
              queue: 'fake-queue',
              routingKey: 'fake-routing-key',
            },
          ],
          retryOnError: true,
        });
      });
    });
  });

  describe('consumeQueue()', () => {
    executeWhenConnected(() => {
      it('should consume queue (1)', async () => {
        const handler = () => {
          'fake-handler';
        };

        await amqpConnectionWrapper.consumeQueue('fake-queue', handler);

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'consumeQueue',
          args: ['fake-queue', handler, { requiresAcknowledgement: false }],
          retryOnError: true,
        });
      });

      it('should consume queue (3)', async () => {
        const handler = () => {
          'fake-handler';
        };

        await amqpConnectionWrapper.consumeQueue('fake-queue', handler, {
          requiresAcknowledgement: true,
        });

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'consumeQueue',
          args: ['fake-queue', handler, { requiresAcknowledgement: true }],
          retryOnError: true,
        });
      });

      it('should return the consumer tag', async () => {
        amqpConnectionExecutor.execute.mockResolvedValue('fake-consumer-tag');

        await expect(
          amqpConnectionWrapper.consumeQueue(
            'fake-queue',
            () => {
              'fake handler';
            },
            { requiresAcknowledgement: true },
          ),
        ).resolves.toBe('fake-consumer-tag');
      });
    });
  });

  describe('acknowledge()', () => {
    executeWhenConnected(() => {
      it('should cancel channel consumption', async () => {
        await amqpConnectionWrapper.acknowledge(12345);

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'acknowledge',
          args: [12345],
          retryOnError: false,
        });
      });
    });
  });

  describe('negativeAcknowledge()', () => {
    executeWhenConnected(() => {
      it('should cancel channel consumption', async () => {
        await amqpConnectionWrapper.negativeAcknowledge(12345);

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'negativeAcknowledge',
          args: [12345],
          retryOnError: false,
        });
      });
    });
  });

  describe('cancelConsumption()', () => {
    executeWhenConnected(() => {
      it('should cancel channel consumption', async () => {
        await amqpConnectionWrapper.cancelConsumption('fake-consumer-tag');

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'cancelConsumption',
          args: ['fake-consumer-tag'],
          retryOnError: false,
        });
      });
    });
  });

  describe('publishToExchange()', () => {
    executeWhenConnected(() => {
      it('should publish data to the exchange (without optional params)', async () => {
        const dataBuffer = Buffer.from('Hello world');

        await amqpConnectionWrapper.publishToExchange(
          'fake-exchange',
          dataBuffer,
        );

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'publishToExchange',
          args: [
            'fake-exchange',
            dataBuffer,
            {
              correlationId: undefined,
              routingKey: undefined,
              persistent: undefined,
              mandatory: undefined,
              expireMs: undefined,
            },
          ],
          retryOnError: true,
        });
      });

      it('should publish data to the exchange (with optional params)', async () => {
        const dataBuffer = Buffer.from('Hello world');

        await amqpConnectionWrapper.publishToExchange(
          'fake-exchange',
          dataBuffer,
          {
            correlationId: 'fake-correlation-id',
            routingKey: 'fake-routing-key',
            persistent: true,
            mandatory: true,
            expireMs: 14600,
          },
        );

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'publishToExchange',
          args: [
            'fake-exchange',
            dataBuffer,
            {
              correlationId: 'fake-correlation-id',
              routingKey: 'fake-routing-key',
              persistent: true,
              mandatory: true,
              expireMs: 14600,
            },
          ],
          retryOnError: true,
        });
      });
    });
  });

  describe('sendToQueue()', () => {
    executeWhenConnected(() => {
      it('should send data to the queue (without optional params)', async () => {
        const dataBuffer = Buffer.from('Hello world');

        await amqpConnectionWrapper.sendToQueue('fake-queue', dataBuffer);

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'sendToQueue',
          args: [
            'fake-queue',
            dataBuffer,
            {
              replyQueue: undefined,
              correlationId: undefined,
              persistent: undefined,
              mandatory: undefined,
              expireMs: undefined,
            },
          ],
          retryOnError: true,
        });
      });

      it('should send data to the queue (with optional params)', async () => {
        const dataBuffer = Buffer.from('Hello world');

        await amqpConnectionWrapper.sendToQueue('fake-queue', dataBuffer, {
          replyQueue: 'fake-reply-queue',
          correlationId: 'fake-correlation-id',
          persistent: true,
          mandatory: true,
          expireMs: 14600,
        });

        expect(amqpConnectionExecutor.execute).toHaveBeenCalledExactlyOnceWith({
          command: 'sendToQueue',
          args: [
            'fake-queue',
            dataBuffer,
            {
              replyQueue: 'fake-reply-queue',
              correlationId: 'fake-correlation-id',
              persistent: true,
              mandatory: true,
              expireMs: 14600,
            },
          ],
          retryOnError: true,
        });
      });
    });
  });

  // --- events

  describe('[handle connection\'s "closed" event]', () => {
    beforeEach(() => {
      jest.spyOn(amqpConnectionWrapper, 'reconnect').mockResolvedValue();
    });

    executeWhenConnected(() => {
      it('should reconnect', async () => {
        await amqpConnectionContainerEmitter.emitAsync('closed');

        expect(
          amqpConnectionWrapper.reconnect,
        ).toHaveBeenCalledExactlyOnceWith();
      });
    });

    executeWhenNotConnected(() => {
      it('should not reconnect', async () => {
        await amqpConnectionContainerEmitter.emitAsync('closed');

        expect(amqpConnectionWrapper.reconnect).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle connection\'s "channelRecreated" event]', () => {
    executeWhenConnected(() => {
      let channelRecreatedEventSpy: jest.Mock;

      beforeEach(() => {
        channelRecreatedEventSpy = jest.fn();
        amqpConnectionWrapper.on('channelRecreated', channelRecreatedEventSpy);
      });

      it('should emit "channelRecreated" event', async () => {
        await amqpConnectionContainerEmitter.emitAsync('channelRecreated');

        expect(channelRecreatedEventSpy).toHaveBeenCalledTimes(1);
      });

      it('should not emit "channelRecreated" event when unsubscribed', async () => {
        amqpConnectionWrapper.removeListener(
          'channelRecreated',
          channelRecreatedEventSpy,
        );

        await amqpConnectionContainerEmitter.emitAsync('channelRecreated');

        expect(channelRecreatedEventSpy).not.toHaveBeenCalled();
      });
    });

    executeWhenNotConnected(() => {
      it('should not emit "channelRecreated" event', async () => {
        const channelRecreatedEventSpy = jest.fn();
        amqpConnectionWrapper.on('channelRecreated', channelRecreatedEventSpy);

        await amqpConnectionContainerEmitter.emitAsync('channelRecreated');

        expect(channelRecreatedEventSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle connection\'s "return" event]', () => {
    executeWhenConnected(() => {
      let returnEventSpy: jest.Mock;

      beforeEach(() => {
        returnEventSpy = jest.fn();
        amqpConnectionWrapper.on('return', returnEventSpy);
      });

      it('should emit "return" event', () => {
        amqpConnectionContainerEmitter.emit('return', 'fake-correlation-id');

        expect(returnEventSpy).toHaveBeenCalledTimes(1);
        expect(returnEventSpy).toHaveBeenCalledExactlyOnceWith(
          'fake-correlation-id',
        );
      });

      it('should not emit "return" event when unsubscribed', () => {
        amqpConnectionWrapper.removeListener('return', returnEventSpy);

        amqpConnectionContainerEmitter.emit('return', 'fake-correlation-id');

        expect(returnEventSpy).not.toHaveBeenCalled();
      });
    });

    executeWhenNotConnected(() => {
      it('should not emit "return" event', () => {
        const returnEventSpy = jest.fn();
        amqpConnectionWrapper.on('return', returnEventSpy);

        amqpConnectionContainerEmitter.emit('return', 'fake-correlation-id');

        expect(returnEventSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle connection\'s "error" event]', () => {
    executeWhenConnected(() => {
      let errorEventSpy: jest.Mock;

      beforeEach(() => {
        errorEventSpy = jest.fn();
        amqpConnectionWrapper.on('error', errorEventSpy);
      });

      it('should emit "error" event', () => {
        const error = new Error('Fake error');
        amqpConnectionContainerEmitter.emit('error', error);

        expect(errorEventSpy).toHaveBeenCalledTimes(1);
        expect(errorEventSpy).toHaveBeenCalledExactlyOnceWith(error);
      });

      it('should not emit "error" event when unsubscribed', () => {
        amqpConnectionWrapper.removeListener('error', errorEventSpy);

        amqpConnectionContainerEmitter.emit('error', new Error('Fake error'));

        expect(errorEventSpy).not.toHaveBeenCalled();
      });
    });

    executeWhenNotConnected(() => {
      it('should not emit "error" event', () => {
        const errorEventSpy = jest.fn();
        amqpConnectionWrapper.on('error', errorEventSpy);

        amqpConnectionContainerEmitter.emit('error', new Error('Fake error'));

        expect(errorEventSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle amqp connection initializer\'s "error" event]', () => {
    executeWhenConnected(() => {
      let errorEventSpy: jest.Mock;

      beforeEach(() => {
        errorEventSpy = jest.fn();
        amqpConnectionWrapper.on('error', errorEventSpy);
      });

      it('should emit "error" event', () => {
        const error = new Error('Fake error');
        amqpConnectionInitializerEmitter.emit('error', error);

        expect(errorEventSpy).toHaveBeenCalledTimes(1);
        expect(errorEventSpy).toHaveBeenCalledExactlyOnceWith(error);
      });

      it('should not emit "error" event when unsubscribed', () => {
        amqpConnectionWrapper.removeListener('error', errorEventSpy);

        amqpConnectionInitializerEmitter.emit('error', new Error('Fake error'));

        expect(errorEventSpy).not.toHaveBeenCalled();
      });
    });

    executeWhenNotConnected(() => {
      it('should not emit "error" event', () => {
        const errorEventSpy = jest.fn();
        amqpConnectionWrapper.on('error', errorEventSpy);

        amqpConnectionInitializerEmitter.emit('error', new Error('Fake error'));

        expect(errorEventSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('[handle executor\'s "connectionBecameUnavailable" event]', () => {
    beforeEach(() => {
      jest.spyOn(amqpConnectionWrapper, 'reconnect').mockResolvedValue();
    });

    executeWhenConnected(() => {
      it('should re-create the channel', async () => {
        await amqpConnectionExecutorEmitter.emitAsync(
          'connectionBecameUnavailable',
        );

        expect(
          amqpConnectionWrapper.reconnect,
        ).toHaveBeenCalledExactlyOnceWith();
      });
    });

    executeWhenNotConnected(() => {
      it('should do nothing', async () => {
        await amqpConnectionExecutorEmitter.emitAsync(
          'connectionBecameUnavailable',
        );

        expect(amqpConnectionWrapper.reconnect).not.toHaveBeenCalled();
      });
    });
  });

  describe('[AmqpConnectionExecutor\'s "staleCommand" event]', () => {
    let staleCommandEventSpy: jest.Mock;

    const args = [123, 'hello world', { hey: 'there' }];

    beforeEach(() => {
      staleCommandEventSpy = jest.fn();
      amqpConnectionWrapper.on('staleCommand', staleCommandEventSpy);
    });

    it('should emit "staleCommand" event', async () => {
      await amqpConnectionExecutorEmitter.emit('staleCommand', ...args);

      expect(staleCommandEventSpy).toHaveBeenCalledExactlyOnceWith(...args);
    });

    it('should not emit "staleCommand" event when unsubscribed', async () => {
      amqpConnectionWrapper.removeListener(
        'staleCommand',
        staleCommandEventSpy,
      );

      await amqpConnectionExecutorEmitter.emit('staleCommand', ...args);

      expect(staleCommandEventSpy).not.toHaveBeenCalled();
    });
  });

  // --- helpers

  function executeWhenConnected(tests: () => void) {
    describe('[connected]', () => {
      beforeEach(async () => {
        await amqpConnectionWrapper.connect();
      });

      tests();
    });
  }

  function executeWhenNotConnected(tests: () => void) {
    describe('[ready]', () => {
      tests();
    });

    describe('[disposed]', () => {
      beforeEach(async () => {
        await amqpConnectionWrapper.connect();
        await amqpConnectionWrapper.dispose();
      });

      tests();
    });
  }

  function createAmqpConnectionWrapperInstance(
    options: Partial<AmqpConnectionWrapperOptions> = {},
  ) {
    return new AmqpConnectionWrapper(
      {
        ...amqpConnectionWrapperOptions,
        ...options,
      },
      amqpConnectionWrapperDependencies,
    );
  }
});

function createAmqpConnectionMock() {
  const amqpConnection = {
    dispose: jest.fn(async () => {}),
  } as unknown as jest.Mocked<AmqpConnection>;

  return amqpConnection;
}
