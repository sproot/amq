import { RetryDelayCalculator } from './types';

type LinearRetryDelayCalculatorOptions = {
  base: number;
  min?: number;
  max?: number;
};

export class LinearRetryDelayCalculator implements RetryDelayCalculator {
  private readonly base: number;
  private readonly min: number;
  private readonly max: number;

  constructor({ base, min, max }: LinearRetryDelayCalculatorOptions) {
    this.base = base;
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
    const result = this.base * attempt;

    return Math.min(this.max, Math.max(this.min, result));
  }
}
