import { AppError } from '../../core/errors/AppError';
import { ErrorCode, ErrorName } from '../../core/errors/types';

export class UnknownCommandError extends AppError {
  commandName: string;

  constructor(commandName: string) {
    super({
      name: ErrorName.UnknownCommandError,
      code: ErrorCode.UnknownCommand,
      message: `Handler for command "${commandName}" is not registered`,
    });

    this.commandName = commandName;
  }

  toJson() {
    return {
      ...super.toJson(),
      commandName: this.commandName,
    };
  }
}
