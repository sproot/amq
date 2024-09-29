import { SimpleFactory } from '../src/utils/SimpleFactory';
import { JsonBufferSerializer } from '../src/core';
import { MessageRelevancyChecker } from '../src/MessageRelevancyChecker';
import { JobQueueConsumer } from '../src/jobs/job-queue/JobQueueConsumer';
import { DiscardedJobReporter } from '../src/jobs/job-server/DiscardedJobReporter';
import { JobHandlerManager } from '../src/jobs/job-server/JobHandlerManager';
import { Scheduler } from '../src/jobs/job-server/Scheduler';
import {
  ExponentialRetryDelayCalculator,
  RetryDelayCalculator,
} from '../src/jobs/job-server/retry-delay-calculators';
import { JobHandlerValidator } from '../src/jobs/job-server/validation/JobHandlerValidator';
import { PositiveNumberValidator } from '../src/jobs/job-server/validation/PositiveNumberValidator';
import { RetryDelayCalculatorValidator } from '../src/jobs/job-server/validation/RetryDelayCalculatorValidator';
import { JobQueueInitializer } from '../src/jobs/job-queue/JobQueueInitializer';
import { JobRetryQueueProvider } from '../src/jobs/job-queue/JobRetryQueueProvider';

import { AmqpConnection } from './AmqpConnection';
import { JobServer as JobServerBase } from '../src/jobs/job-server/JobServer';

// Will make 25 attempts in a span of ~21 days
const DEFAULT_MAX_ATTEMPT_COUNT = 25;
const DEFAULT_RETRY_DELAY_CALCULATOR = new ExponentialRetryDelayCalculator({
  multiplier: 5000, // 5 seconds
  base: 1.677,
});

const STALE_JOB_DURATION_MS = 10 * 1000;

type JobServerOptions = {
  amqpConnection: AmqpConnection;
  exchange: string;
  queue: string;
  defaultMaxAttemptCount?: number;
  staleJobDurationMs?: number;
  defaultRetryDelayCalculator?: RetryDelayCalculator;
};

export class JobServer extends JobServerBase {
  constructor({
    amqpConnection,
    exchange,
    queue,
    defaultMaxAttemptCount = DEFAULT_MAX_ATTEMPT_COUNT,
    staleJobDurationMs = STALE_JOB_DURATION_MS,
    defaultRetryDelayCalculator = DEFAULT_RETRY_DELAY_CALCULATOR,
  }: JobServerOptions) {
    super(
      {
        exchange,
        queue,
        defaultMaxAttemptCount,
        staleJobDurationMs,
        defaultRetryDelayCalculator,
      },
      {
        amqpConnection,
        schedulerFactory: SimpleFactory.for(Scheduler),
        discardedJobReporterFactory: SimpleFactory.for(DiscardedJobReporter),
        jobHandlerManagerFactory: SimpleFactory.for(JobHandlerManager),
        jobHandlerValidatorFactory: SimpleFactory.for(JobHandlerValidator),
        retryDelayCalculatorValidator: new RetryDelayCalculatorValidator(),
        positiveNumberValidator: new PositiveNumberValidator(),
        jobQueueConsumerFactory: SimpleFactory.for(JobQueueConsumer),
        jobQueueInitializerFactory: SimpleFactory.for(JobQueueInitializer),
        jobRetryQueueProviderFactory: SimpleFactory.for(JobRetryQueueProvider),
        messageRelevancyCheckerFactory: SimpleFactory.for(
          MessageRelevancyChecker,
        ),
        jsonBufferSerializer: new JsonBufferSerializer(),
      },
    );
  }
}
