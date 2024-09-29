import { EventEmitter } from 'events';

import { JobTimedOutError, MaxAttemptCountReachedError } from '../errors';
import { Scheduler } from './Scheduler';
import { DiscardedJobReporter } from './DiscardedJobReporter';
import { FactoryFor } from '../../utils/SimpleFactory';
import { JobHandlerValidator } from './validation/JobHandlerValidator';
import { RetryDelayCalculatorValidator } from './validation/RetryDelayCalculatorValidator';
import { PositiveNumberValidator } from './validation/PositiveNumberValidator';
import { JobQueueConsumer } from '../job-queue/JobQueueConsumer';
import { JobQueueInitializer } from '../job-queue/JobQueueInitializer';
import { MessageRelevancyChecker } from '../../MessageRelevancyChecker';
import { AmqpConnectionInterface, JsonBufferSerializer } from '../../core';
import { JobHandlerManager } from './JobHandlerManager';
import { RetryDelayCalculator } from './retry-delay-calculators';
import { Context, SerializedContext } from './types';
import { JobRetryQueueProvider } from '../job-queue/JobRetryQueueProvider';

type JobServerOptions = {
  exchange: string;
  queue: string;
  defaultMaxAttemptCount: number;
  staleJobDurationMs?: number;
  defaultRetryDelayCalculator: RetryDelayCalculator;
};

type JobServerDependencies = {
  schedulerFactory: FactoryFor<Scheduler>;
  jobRetryQueueProviderFactory: FactoryFor<JobRetryQueueProvider>;
  discardedJobReporterFactory: FactoryFor<DiscardedJobReporter>;
  jobHandlerManagerFactory: FactoryFor<JobHandlerManager>;
  jobHandlerValidatorFactory: FactoryFor<JobHandlerValidator>;
  retryDelayCalculatorValidator: RetryDelayCalculatorValidator;
  positiveNumberValidator: PositiveNumberValidator;
  jobQueueConsumerFactory: FactoryFor<JobQueueConsumer>;
  jobQueueInitializerFactory: FactoryFor<JobQueueInitializer>;
  messageRelevancyCheckerFactory: FactoryFor<MessageRelevancyChecker>;
  amqpConnection: AmqpConnectionInterface;
  jsonBufferSerializer: JsonBufferSerializer;
};

enum JobServerState {
  Ready = 'ready',
  Listening = 'listening',
  Disposed = 'disposed',
}

export class JobServer {
  private readonly emitter = new EventEmitter();

  private readonly queue: string;
  private readonly exchange: string;
  private readonly staleJobDurationMs?: number;

  private readonly amqpConnection: AmqpConnectionInterface;
  private readonly jsonBufferSerializer: JsonBufferSerializer;
  private readonly schedulerFactory: FactoryFor<Scheduler>;
  private readonly discardedJobReporter: DiscardedJobReporter;
  private readonly jobHandlerManager: JobHandlerManager;
  private readonly jobQueueConsumer: JobQueueConsumer;
  private readonly jobQueueInitializer: JobQueueInitializer;
  private readonly messageRelevancyChecker: MessageRelevancyChecker;
  private readonly jobRetryQueueProviderFactory: FactoryFor<JobRetryQueueProvider>;

  private state: JobServerState = JobServerState.Ready;

  constructor(
    {
      exchange,
      queue,
      defaultMaxAttemptCount,
      staleJobDurationMs,
      defaultRetryDelayCalculator,
    }: JobServerOptions,
    {
      schedulerFactory,
      jobRetryQueueProviderFactory,
      discardedJobReporterFactory,
      jobHandlerManagerFactory,
      jobHandlerValidatorFactory,
      retryDelayCalculatorValidator,
      positiveNumberValidator,
      jobQueueConsumerFactory,
      jobQueueInitializerFactory,
      messageRelevancyCheckerFactory,
      amqpConnection,
      jsonBufferSerializer,
    }: JobServerDependencies,
  ) {
    if (!exchange) throw new Error('"options.exchange" is required');
    if (!queue) throw new Error('"options.queue" is required');
    if (!amqpConnection)
      throw new Error('"dependencies.amqpConnection" is required');

    retryDelayCalculatorValidator.validate(
      defaultRetryDelayCalculator,
      'options.defaultRetryDelayCalculator,',
    );

    positiveNumberValidator.validate(
      defaultMaxAttemptCount,
      'options.defaultMaxAttemptCount',
    );

    if (typeof staleJobDurationMs == 'number') {
      positiveNumberValidator.validate(
        staleJobDurationMs,
        'options.staleJobDurationMs',
      );
    }

    this.emitter = new EventEmitter();

    this.queue = queue;
    this.exchange = exchange;
    this.staleJobDurationMs = staleJobDurationMs;

    this.amqpConnection = amqpConnection;
    this.jsonBufferSerializer = jsonBufferSerializer;
    this.schedulerFactory = schedulerFactory;
    this.jobRetryQueueProviderFactory = jobRetryQueueProviderFactory;

    this.discardedJobReporter = discardedJobReporterFactory.create();

    this.jobHandlerManager = jobHandlerManagerFactory.create({
      defaultRetryDelayCalculator,
      defaultMaxAttemptCount,
      jobHandlerValidator: jobHandlerValidatorFactory.create({
        retryDelayCalculatorValidator,
        positiveNumberValidator,
      }),
    });

    this.jobQueueConsumer = jobQueueConsumerFactory.create(
      {
        queue,
      },
      {
        amqpConnection,
      },
    );

    this.jobQueueInitializer = jobQueueInitializerFactory.create(
      {
        exchange,
        queue,
      },
      { amqpConnection },
    );

    this.messageRelevancyChecker = messageRelevancyCheckerFactory.create();

    this.handleAmqpReconnected = this.handleAmqpReconnected.bind(this);
    this.handleAmqpChannelRecreated =
      this.handleAmqpChannelRecreated.bind(this);
    this.handleJobMessage = this.handleJobMessage.bind(this);
    this.handleJobDiscarded = this.handleJobDiscarded.bind(this);
  }

  async listen() {
    if (this.state === JobServerState.Listening)
      throw new Error('Job server is already listening');
    if (this.state === JobServerState.Disposed)
      throw new Error('Cannot reuse disposed job server');
    this.state = JobServerState.Listening;

    this.amqpConnection.on('reconnected', this.handleAmqpReconnected);
    this.amqpConnection.on('channelRecreated', this.handleAmqpChannelRecreated);
    this.jobQueueConsumer.on('message', this.handleJobMessage);
    this.discardedJobReporter.on('jobDiscarded', this.handleJobDiscarded);

    await this.jobQueueInitializer.initialize();
    if (String(this.state) === JobServerState.Disposed) return;
    await this.jobQueueConsumer.consume();
  }

  private async handleAmqpReconnected() {
    this.jobQueueInitializer.reset();
    this.messageRelevancyChecker.unlockAll();

    await this.jobQueueInitializer.initialize();
    if (String(this.state) === JobServerState.Disposed) return;
    await this.jobQueueConsumer.consume();
  }

  private async handleAmqpChannelRecreated() {
    this.messageRelevancyChecker.unlockAll();
    await this.jobQueueConsumer.consume();
  }

  private async handleJobMessage({
    content,
    deliveryTag,
    correlationId,
  }: {
    content: Buffer;
    deliveryTag: number;
    correlationId: string;
  }) {
    if (!this.messageRelevancyChecker.lock(correlationId, deliveryTag)) {
      return;
    }

    let job, data, retryContext, attempt;
    try {
      ({ job, data, retryContext, attempt } =
        this.jsonBufferSerializer.deserialize<SerializedContext>(content));
    } catch (error) {
      this.emitter.emit('deserializationError', error, content);
      return;
    }

    const scheduler = this.schedulerFactory.create(
      {
        exchange: this.exchange,
        queue: this.queue,
        job,
        data,
        attempt,
        correlationId,
      },
      {
        jobRetryQueueProviderFactory: this.jobRetryQueueProviderFactory,
        discardedJobReporter: this.discardedJobReporter,
        jobHandlerManager: this.jobHandlerManager,
        amqpConnection: this.amqpConnection,
        jsonBufferSerializer: this.jsonBufferSerializer,
      },
    );

    try {
      if (this.jobHandlerManager.isExceedingMaxAttemptCount(job, attempt)) {
        scheduler.discard(new MaxAttemptCountReachedError());
      } else {
        await this.handleJob(job, { data, retryContext, attempt }, scheduler);
      }
    } catch (error) {
      if (this.state === JobServerState.Disposed) return;

      try {
        await this.jobHandlerManager.handleError(
          job,
          { data, retryContext, attempt },
          error as Error,
          scheduler,
        );
      } catch (error) {
        if (String(this.state) === JobServerState.Disposed) return;

        this.emitter.emit('jobError', error, {
          job,
          data,
          retryContext,
          attempt,
        });

        await scheduler.retry();
      }
    }

    if (String(this.state) === JobServerState.Disposed) return;

    const actualDeliveryTag =
      this.messageRelevancyChecker.getDeliveryTag(correlationId);
    if (actualDeliveryTag) {
      try {
        await this.amqpConnection.acknowledge(actualDeliveryTag);
      } catch (error) {
        this.emitter.emit('acknowledgeError', {
          error,
          job,
          data,
          retryContext,
          attempt,
        });
      }
    }

    this.messageRelevancyChecker.unlock(correlationId);
  }

  /** @private */
  async handleJob(
    job: string,
    { data, retryContext, attempt }: Context,
    scheduler: Scheduler,
  ) {
    const timeoutMs = this.jobHandlerManager.getTimeoutMs(job);
    const executedAt = Date.now();

    let hasTimedOut = false;
    let timeoutId: NodeJS.Timeout;

    await Promise.race(
      [
        this.jobHandlerManager.handle(
          job,
          { data, retryContext, attempt },
          scheduler,
        ),
        timeoutMs &&
          Number.isFinite(timeoutMs) &&
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              hasTimedOut = true;
              reject(new JobTimedOutError());
            }, timeoutMs);
          }),
      ].filter(Boolean),
    ).finally(() => {
      clearTimeout(timeoutId);

      const durationMs = Date.now() - executedAt;
      if (
        typeof this.staleJobDurationMs == 'number' &&
        durationMs >= this.staleJobDurationMs
      ) {
        this.emitter.emit('staleJob', {
          durationMs,
          hasTimedOut,
          job,
          data,
          retryContext,
          attempt,
        });
      }
    });
  }

  private handleJobDiscarded(data: any) {
    this.emitter.emit('jobDiscarded', data);
  }

  async dispose() {
    if (this.state === JobServerState.Ready) return;
    if (this.state === JobServerState.Disposed) return;
    this.state = JobServerState.Disposed;

    this.amqpConnection.removeListener(
      'reconnected',
      this.handleAmqpReconnected,
    );
    this.amqpConnection.removeListener(
      'channelRecreated',
      this.handleAmqpChannelRecreated,
    );
    this.jobQueueConsumer.removeListener('message', this.handleJobMessage);
    this.discardedJobReporter.removeListener(
      'jobDiscarded',
      this.handleJobDiscarded,
    );

    this.jobHandlerManager.deleteAll();
    this.jobQueueInitializer.dispose();
    await this.jobQueueConsumer.dispose();
  }

  setJobHandler(job: string, handler: any) {
    this.jobHandlerManager.set(job, handler);
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: (...args: any[]) => void) {
    this.emitter.removeListener(event, listener);
  }
}
