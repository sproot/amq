import { RetryDelayCalculator } from './types';

type ExponentialRetryDelayCalculatorOptions = {
  base: number;
  multiplier: number;
  min?: number;
  max?: number;
};

export class ExponentialRetryDelayCalculator implements RetryDelayCalculator {
  private readonly base: number;
  private readonly multiplier: number;
  private readonly min: number;
  private readonly max: number;

  constructor({
    base,
    multiplier,
    min,
    max,
  }: ExponentialRetryDelayCalculatorOptions) {
    this.base = base;
    this.multiplier = multiplier;
    this.min =
      typeof min === 'number' && Number.isFinite(min)
        ? min
        : Number.MIN_SAFE_INTEGER;
    this.max =
      typeof max === 'number' && Number.isFinite(max)
        ? max
        : Number.MAX_SAFE_INTEGER;
  }

  calculate(attempt: number) {
    const result = this.base ** (attempt - 1) * this.multiplier;

    return Math.floor(Math.min(this.max, Math.max(this.min, result)));
  }
}
