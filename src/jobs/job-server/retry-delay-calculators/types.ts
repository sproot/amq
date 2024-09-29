export interface RetryDelayCalculator {
  calculate(attempt: number): number;
}
