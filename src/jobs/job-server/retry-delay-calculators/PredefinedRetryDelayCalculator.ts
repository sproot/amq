import { RetryDelayCalculator } from './types';

export class PredefinedRetryDelayCalculator implements RetryDelayCalculator {
  private readonly timeouts: number[];

  constructor(timeouts: number[]) {
    this.timeouts = timeouts;
  }

  calculate(attempt: number) {
    return this.timeouts[Math.min(attempt, this.timeouts.length) - 1];
  }
}
