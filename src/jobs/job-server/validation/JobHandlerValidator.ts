import { PositiveNumberValidator } from './PositiveNumberValidator';
import { RetryDelayCalculatorValidator } from './RetryDelayCalculatorValidator';

type JobHandlerValidatorOptions = {
  positiveNumberValidator: PositiveNumberValidator;
  retryDelayCalculatorValidator: RetryDelayCalculatorValidator;
};

export class JobHandlerValidator {
  private readonly positiveNumberValidator: PositiveNumberValidator;
  private readonly retryDelayCalculatorValidator: RetryDelayCalculatorValidator;

  constructor({
    positiveNumberValidator,
    retryDelayCalculatorValidator,
  }: JobHandlerValidatorOptions) {
    this.positiveNumberValidator = positiveNumberValidator;
    this.retryDelayCalculatorValidator = retryDelayCalculatorValidator;
  }

  /**
   * NOTE: Job handler must be an async function because it's easier to catch
   *       errors and manage timeouts.
   */
  validate(value: any, context: string) {
    if (!value) {
      throw new Error(`Job handler is invalid: ${value} (${context})`);
    }

    if (typeof value === 'object') {
      if (typeof value.handle !== 'function') {
        throw new Error(
          `Job handler is invalid: must have #handle method (${context})`,
        );
      }

      if (
        value.handleError !== undefined &&
        typeof value.handleError !== 'function'
      ) {
        throw new Error(
          `Job handler is invalid: #handleError must be a method (${context})`,
        );
      }

      if (value.retryDelayCalculator !== undefined) {
        this.retryDelayCalculatorValidator.validate(
          value.retryDelayCalculator,
          context,
        );
      }

      if (value.maxAttemptCount !== undefined) {
        this.positiveNumberValidator.validate(
          value.maxAttemptCount,
          `${context}.maxAttemptCount`,
        );
      }

      if (value.timeoutMs !== undefined) {
        this.positiveNumberValidator.validate(
          value.timeoutMs,
          `${context}.timeoutMs`,
        );
      }
    } else if (typeof value !== 'function') {
      throw new Error(
        `Job handler is invalid: must be an object or a function (${context})`,
      );
    }
  }
}
