import { AppError } from '../../core/errors/AppError';
import { ErrorCode, ErrorName } from '../../core/errors/types';

type CommandErrorParams = {
  code: ErrorCode;
  queue: string;
  commandName: string;
  args: any;
};

export class CommandError extends AppError {
  public readonly queue: string;
  public readonly commandName: string;
  public readonly args: any;

  constructor({ code, queue, commandName, args }: CommandErrorParams) {
    super({
      code,
      name: ErrorName.CommandError,
      message: `Command "${commandName}" to "${queue}" has failed (code: ${code})`,
    });

    this.queue = queue;
    this.commandName = commandName;
    this.args = args;
  }

  toPlain() {
    return {
      ...super.toJson(),
      queue: this.queue,
      commandName: this.commandName,
      args: this.args,
    };
  }
}
