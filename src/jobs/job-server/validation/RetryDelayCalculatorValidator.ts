export class RetryDelayCalculatorValidator {
  validate(value: any, context: string) {
    if (!value) {
      throw new Error(
        `Retry delay calculator is invalid: ${value} (${context})`,
      );
    }

    if (typeof value.calculate !== 'function') {
      throw new Error(
        `Retry delay calculator is invalid: must have a #calculate method (${context})`,
      );
    }
  }
}
