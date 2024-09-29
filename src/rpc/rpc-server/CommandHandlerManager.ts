import { UnknownCommandError } from '../errors';
import type { CommandHandlerValidator } from './CommandHandlerValidator';
import { CommandHandler, CommandHandlerFunction } from './types';

type CommandHandlerOptions = {
  commandHandlerValidator: CommandHandlerValidator;
};

export class CommandHandlerManager {
  private readonly commandHandlerValidator: CommandHandlerValidator;
  private readonly commandHandlers: Map<
    string,
    CommandHandler | CommandHandlerFunction
  >;

  constructor({ commandHandlerValidator }: CommandHandlerOptions) {
    this.commandHandlerValidator = commandHandlerValidator;
    this.commandHandlers = new Map();
  }

  set(commandName: string, handler: any) {
    if (this.commandHandlers.has(commandName)) {
      throw new Error(`Command handler already exists: ${commandName}`);
    }

    this.commandHandlerValidator.validate(handler, commandName);
    this.commandHandlers.set(commandName, handler);
  }

  async handle(commandName: string, ...args: any[]) {
    const handler = this.commandHandlers.get(commandName);

    if (!handler) {
      throw new UnknownCommandError(commandName);
    }

    if (typeof handler === 'function') {
      return handler(...args);
    } else {
      return handler.handle(...args);
    }
  }

  deleteAll() {
    this.commandHandlers.clear();
  }
}
