import { RetryDelayCalculator } from './types';

export class ConstantRetryDelayCalculator implements RetryDelayCalculator {
  private readonly timeout: number;

  constructor(timeout: number) {
    this.timeout = timeout;
  }

  calculate(_: number) {
    return this.timeout;
  }
}
