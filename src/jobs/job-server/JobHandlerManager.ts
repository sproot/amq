import { JobHandlerValidator } from './validation/JobHandlerValidator';
import { Scheduler } from './Scheduler';
import { Context, JobHandler, JobHandlerFunction } from './types';
import { RetryDelayCalculator } from './retry-delay-calculators';

type JobHandlerManagerOptions = {
  defaultRetryDelayCalculator: RetryDelayCalculator;
  defaultMaxAttemptCount: number;
  jobHandlerValidator: JobHandlerValidator;
};

export class JobHandlerManager {
  private readonly defaultRetryDelayCalculator: RetryDelayCalculator;
  private readonly defaultMaxAttemptCount: number;
  private readonly jobHandlerValidator: JobHandlerValidator;

  private readonly jobHandlers: Map<string, JobHandler | JobHandlerFunction> =
    new Map();

  constructor({
    defaultRetryDelayCalculator,
    defaultMaxAttemptCount,
    jobHandlerValidator,
  }: JobHandlerManagerOptions) {
    this.defaultRetryDelayCalculator = defaultRetryDelayCalculator;
    this.defaultMaxAttemptCount = defaultMaxAttemptCount;
    this.jobHandlerValidator = jobHandlerValidator;

    this.jobHandlers = new Map();
  }

  set(job: string, handler: any) {
    if (this.jobHandlers.has(job)) {
      throw new Error(`Job handler already exists for "${job}"`);
    }

    this.jobHandlerValidator.validate(handler, job);
    this.jobHandlers.set(job, handler);
  }

  async handle(
    job: string,
    { data, retryContext, attempt }: Context,
    scheduler: Scheduler,
  ) {
    const jobHandler = this.jobHandlers.get(job);

    if (!jobHandler) {
      throw new Error(`Job handler not found for "${job}"`);
    }

    if (typeof jobHandler === 'function') {
      await jobHandler({ data, retryContext, attempt }, scheduler);
    } else {
      await jobHandler.handle({ data, retryContext, attempt }, scheduler);
    }
  }

  async handleError(
    job: string,
    { data, retryContext, attempt }: Context,
    error: Error,
    scheduler: Scheduler,
  ) {
    const jobHandler = this.jobHandlers.get(job);

    if (
      jobHandler &&
      typeof jobHandler !== 'function' &&
      jobHandler.handleError !== undefined
    ) {
      await jobHandler.handleError(
        { data, retryContext, attempt },
        error,
        scheduler,
      );
      return;
    }

    throw error;
  }

  calculateRetryDelayMs(job: string, attempt: number) {
    const jobHandler = this.jobHandlers.get(job);

    const customRetryDelayCalculator =
      jobHandler &&
      typeof jobHandler !== 'function' &&
      jobHandler.retryDelayCalculator;

    const retryDelayCalculator = customRetryDelayCalculator
      ? customRetryDelayCalculator
      : this.defaultRetryDelayCalculator;

    const retryDelayMs = retryDelayCalculator.calculate(attempt);

    if (!Number.isInteger(retryDelayMs) || retryDelayMs < 1) {
      throw new Error(
        `Invalid calculated attempt retry delay: ${retryDelayMs} (must be a positive integer)`,
      );
    }

    return retryDelayMs;
  }

  isExceedingMaxAttemptCount(job: string, attempt: number) {
    return attempt > this.getMaxAttemptCount(job);
  }

  getMaxAttemptCount(job: string): number {
    const jobHandler = this.jobHandlers.get(job);
    if (
      !jobHandler ||
      typeof jobHandler === 'function' ||
      !jobHandler.maxAttemptCount
    )
      return this.defaultMaxAttemptCount;

    return jobHandler.maxAttemptCount;
  }

  getTimeoutMs(job: string): number | null {
    const jobHandler = this.jobHandlers.get(job);
    if (
      !jobHandler ||
      typeof jobHandler === 'function' ||
      !jobHandler.timeoutMs
    )
      return null;

    return jobHandler.timeoutMs;
  }

  deleteAll() {
    this.jobHandlers.clear();
  }
}
