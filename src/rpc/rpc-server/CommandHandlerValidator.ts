export class CommandHandlerValidator {
  validate(value: any, context: string) {
    if (!value) {
      throw new Error(`Command handler is invalid: ${value} (${context})`);
    }

    if (typeof value === 'object') {
      if (typeof value.handle !== 'function') {
        throw new Error(
          `Command handler is invalid: must have a #handle method (${context})`,
        );
      }
    } else if (typeof value !== 'function') {
      throw new Error(
        `Command handler is invalid: must be an object or a function (${context})`,
      );
    }
  }
}
