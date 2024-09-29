import { Context, JobHandler, Scheduler } from '../../main';

export class JobHandlerExample implements JobHandler {
  async handle(context: Context) {
    const { data } = context;

    // Simulating some work by sleeping for 1-10 seconds
    await new Promise((resolve) =>
      setTimeout(resolve, Math.floor(Math.max(1000, Math.random() * 10000))),
    );

    if (Math.random() > 0.5) {
      console.log('Job succeeded!', data);
    } else {
      console.log('Throwing an error...');
      throw new Error('Job failed!');
    }
  }

  async handleError(context: Context, error: Error, scheduler: Scheduler) {
    console.log('Received an error: ', error);
    console.log('Context', context);

    // By default the job will be retried 'maxAttemptCount' times using 'ExponentialRetryDelayCalculator'
    // but we can also retry the job manually by calling 'retry' method on the scheduler

    // Examples:
    // scheduler.retry(); // Will retry with the default options

    // We can also retry the job with a custom delay and other options
    // scheduler.retry({
    //     timeoutMs: 5000,
    //     retryContext: {
    //         name: 'Jon Snow'
    //     },
    //     resetAttempts: true
    // });
    // will retry job in 5 seconds with the context:
    // { data: <inherited>, retryContext: { name: 'Jon Snow' }, attempt: 2 }

    // It also possible to discard the job if we don't want to retry it
    // scheduler.discard();

    // For now let's retry the job with the default options
    scheduler.retry();
  }

  // Default maxAttemptCount is 25 but we can specify it here for the job as well
  get maxAttemptCount() {
    return 10;
  }

  // By default job handlers do not time out, but if you expect
  // the job to perform within certain duration, you can use timeoutMs
  get timeoutMs() {
    return 5 * 60 * 1000; // 5 minutes
  }
}
