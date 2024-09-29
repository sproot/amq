import { AmqpConnection, JsonBufferSerializer } from '../../core';
import { FactoryFor } from '../../utils/SimpleFactory';
import { MaxAttemptCountReachedError } from '../errors';
import { JobRetryQueueProvider } from '../job-queue/JobRetryQueueProvider';
import { DiscardedJobReporter } from './DiscardedJobReporter';
import { JobHandlerManager } from './JobHandlerManager';

type SchedulerOptions = {
  exchange: string;
  queue: string;
  job: string;
  data: any;
  attempt: number;
  correlationId: string;
};

type SchedulerDependencies = {
  jobRetryQueueProviderFactory: FactoryFor<JobRetryQueueProvider>;
  discardedJobReporter: DiscardedJobReporter;
  jobHandlerManager: JobHandlerManager;
  jsonBufferSerializer: JsonBufferSerializer;
  amqpConnection: AmqpConnection;
};

export class Scheduler {
  private readonly job: string;
  private readonly data: any;
  private readonly attempt: number;
  private readonly correlationId: string;

  private readonly discardedJobReporter: DiscardedJobReporter;
  private readonly jobHandlerManager: JobHandlerManager;
  private readonly jsonBufferSerializer: JsonBufferSerializer;
  private readonly amqpConnection: AmqpConnection;
  private readonly jobRetryQueueProvider: JobRetryQueueProvider;

  private isDiscarded = false;

  constructor(
    { exchange, queue, job, data, attempt, correlationId }: SchedulerOptions,
    {
      jobRetryQueueProviderFactory,
      discardedJobReporter,
      jobHandlerManager,
      jsonBufferSerializer,
      amqpConnection,
    }: SchedulerDependencies,
  ) {
    this.job = job;
    this.data = data;
    this.attempt = attempt;
    this.correlationId = correlationId;

    this.discardedJobReporter = discardedJobReporter;
    this.jobHandlerManager = jobHandlerManager;
    this.jsonBufferSerializer = jsonBufferSerializer;
    this.amqpConnection = amqpConnection;

    this.jobRetryQueueProvider = jobRetryQueueProviderFactory.create(
      {
        exchange,
        queue,
      },
      { amqpConnection },
    );
  }

  async retry({
    retryDelayMs,
    retryContext,
    resetAttempts,
  }: {
    retryDelayMs?: number;
    retryContext?: any;
    resetAttempts?: boolean;
  } = {}) {
    if (this.isDiscarded) return;

    const currentAttempt = resetAttempts ? 1 : this.attempt;
    const nextAttempt = currentAttempt + 1;

    if (
      this.jobHandlerManager.isExceedingMaxAttemptCount(this.job, nextAttempt)
    ) {
      this.discard(new MaxAttemptCountReachedError());
      return;
    }

    retryDelayMs =
      retryDelayMs !== undefined
        ? retryDelayMs
        : this.jobHandlerManager.calculateRetryDelayMs(
            this.job,
            currentAttempt,
          );

    const retryQueueName = await this.jobRetryQueueProvider.create(
      retryDelayMs,
    );

    await this.amqpConnection.sendToQueue(
      retryQueueName,
      this.jsonBufferSerializer.serialize({
        job: this.job,
        data: this.data,
        attempt: nextAttempt,
        retryContext: retryContext || {},
      }),
      {
        correlationId: this.correlationId,
        expireMs: retryDelayMs,
        persistent: true,
      },
    );
  }

  discard(reason: any) {
    if (this.isDiscarded) return;
    this.isDiscarded = true;

    this.discardedJobReporter.report({
      job: this.job,
      data: this.data,
      attempt: this.attempt,
      reason,
    });
  }
}
