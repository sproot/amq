export class PositiveNumberValidator {
  validate(value: number, context: string) {
    if (typeof value !== 'number') {
      throw new Error(`"${context}" must be a number`);
    }

    if (value < 1) {
      throw new Error(`"${context}" must be a positive number`);
    }
  }
}
