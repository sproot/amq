import { JsonBufferSerializer, AmqpConnectionInterface } from '../../core';
import { IdGenerator } from '../../types';
import { ObjectUtil } from '../../utils/ObjectUtil';
import { FactoryFor } from '../../utils/SimpleFactory';
import { JobQueueInitializer } from '../job-queue/JobQueueInitializer';

type JobClientOptions = {
  exchange: string;
};

type JobClientDependencies = {
  jobQueueInitializerFactory: FactoryFor<JobQueueInitializer>;
  jsonBufferSerializer: JsonBufferSerializer;
  amqpConnection: AmqpConnectionInterface;
  idGenerator: IdGenerator;
};

export class JobClient {
  private readonly exchange: string;
  private readonly jsonBufferSerializer: JsonBufferSerializer;
  private readonly amqpConnection: AmqpConnectionInterface;
  private readonly idGenerator: IdGenerator;
  private readonly jobQueueInitializerFactory: FactoryFor<JobQueueInitializer>;

  private readonly jobQueueInitializers: Map<string, JobQueueInitializer> =
    new Map();

  private isDisposed = false;

  constructor(
    { exchange }: JobClientOptions,
    {
      jobQueueInitializerFactory,
      jsonBufferSerializer,
      amqpConnection,
      idGenerator,
    }: JobClientDependencies,
  ) {
    if (!exchange) throw new Error('"options.exchange" is required');
    if (!amqpConnection)
      throw new Error('"dependencies.amqpConnection" is required');

    this.exchange = exchange;
    this.jsonBufferSerializer = jsonBufferSerializer;
    this.amqpConnection = amqpConnection;
    this.idGenerator = idGenerator;
    this.jobQueueInitializerFactory = jobQueueInitializerFactory;

    this.handleAmqpReconnected = this.handleAmqpReconnected.bind(this);
    this.amqpConnection.on('reconnected', this.handleAmqpReconnected);
  }

  private handleAmqpReconnected() {
    this.disposeJobQueueInitializers();
  }

  dispose() {
    this.isDisposed = true;
    this.amqpConnection.removeListener(
      'reconnected',
      this.handleAmqpReconnected,
    );
    this.disposeJobQueueInitializers();
  }

  private disposeJobQueueInitializers() {
    const jobQueueInitializers = [...this.jobQueueInitializers.values()];
    this.jobQueueInitializers.clear();

    for (const jobQueueInitializer of jobQueueInitializers) {
      jobQueueInitializer.dispose();
    }
  }

  async performInBackground(
    queue: string,
    {
      job,
      data,
      expireMs,
      transient = false,
    }: {
      job: string;
      data?: any;
      expireMs?: number;
      transient?: boolean;
    },
  ) {
    if (this.isDisposed) throw new Error('Cannot use disposed JobClient');
    if (typeof queue !== 'string' || queue.length === 0)
      throw new Error(
        `"queue" must be a non-empty string (provided: "${String(queue)}")`,
      );
    if (typeof job !== 'string' || job.length === 0)
      throw new Error(
        `"context.job" must be a non-empty string (provided: "${String(job)}")`,
      );
    if (data !== undefined && !ObjectUtil.isPlainObject(data))
      throw new Error(
        `"context.data" must be a plain object (provided: "${String(data)}")`,
      );
    if (expireMs !== undefined && (!Number.isInteger(expireMs) || expireMs < 1))
      throw new Error(
        `"context.expireMs" must be a positive integer (provided: "${String(
          expireMs,
        )}")`,
      );

    if (!this.jobQueueInitializers.has(queue)) {
      this.jobQueueInitializers.set(
        queue,
        this.jobQueueInitializerFactory.create(
          { exchange: this.exchange, queue },
          { amqpConnection: this.amqpConnection },
        ),
      );
    }

    await (
      this.jobQueueInitializers.get(queue) as JobQueueInitializer
    ).initialize();

    if (this.isDisposed) return;

    const messageContent = this.jsonBufferSerializer.serialize({
      job,
      data,
      retryContext: {},
      attempt: 1,
    });

    await this.amqpConnection.publishToExchange(
      this.exchange,
      messageContent,
      ObjectUtil.removeBlankFields({
        correlationId: this.idGenerator.generate(),
        routingKey: queue,
        persistent: !transient,
        expireMs,
      }),
    );
  }
}
