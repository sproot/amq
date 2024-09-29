import { Scheduler } from './Scheduler';
export { Scheduler } from './Scheduler';
import { RetryDelayCalculator } from './retry-delay-calculators';

export type Context = {
  data: any;
  retryContext: any;
  attempt: number;
};

export type SerializedContext = Context & { job: string };

export type JobHandlerFunction = (
  context: Context,
  scheduler: Scheduler,
) => Promise<void>;

export interface JobHandler {
  handle(context: Context, scheduler: Scheduler): Promise<void>;
  handleError(
    context: Context,
    error: Error,
    scheduler: Scheduler,
  ): Promise<void>;

  maxAttemptCount?: number;
  retryDelayCalculator?: RetryDelayCalculator;
  timeoutMs?: number;
}
