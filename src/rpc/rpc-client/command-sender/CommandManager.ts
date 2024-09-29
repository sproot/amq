import { CorrelationIdNotFoundError, CommandError } from '../../errors';

import { Command } from './Command';
import { CommandContainer } from '../../rpc-server/CommandContainer';

import { FactoryFor } from '../../../utils/SimpleFactory';
import { ErrorCode } from '../../../core/errors/types';
import { IdGenerator } from '../../../types';

type CommandDependencies = {
  commandFactory: FactoryFor<Command>;
  commandContainerFactory: FactoryFor<CommandContainer>;
  idGenerator: IdGenerator;
};

export class CommandManager {
  private readonly commandFactory: FactoryFor<Command>;
  private readonly idGenerator: IdGenerator;
  private readonly commandContainer: CommandContainer;

  constructor({
    commandFactory,
    commandContainerFactory,
    idGenerator,
  }: CommandDependencies) {
    this.commandFactory = commandFactory;
    this.commandContainer = commandContainerFactory.create();
    this.idGenerator = idGenerator;
  }

  create({
    queue,
    commandName: commandName,
    args,
  }: {
    queue: string;
    commandName: string;
    args: any[];
  }) {
    const correlationId = this.idGenerator.generate();
    const command = this.commandFactory.create({ queue, commandName, args });

    this.commandContainer.set(correlationId, command);

    return correlationId;
  }

  async wait(correlationId: string) {
    const command = this.commandContainer.get(correlationId);
    if (!command) {
      throw new CorrelationIdNotFoundError(correlationId);
    }

    return command
      .wait()
      .finally(() => this.commandContainer.delete(correlationId));
  }

  succeed(correlationId: string, data: any) {
    const command = this.commandContainer.get(correlationId);
    if (!command) return;

    command.succeed(data);
  }

  failOneWithError(correlationId: string, error: Error) {
    const command = this.commandContainer.get(correlationId);
    if (!command) return;

    command.fail(error);
  }

  failOneWithCode(correlationId: string, code: ErrorCode) {
    const command = this.commandContainer.get(correlationId);
    if (!command) return;

    command.fail(
      new CommandError({
        code,
        queue: command.queue,
        commandName: command.commandName,
        args: command.args,
      }),
    );
  }

  failAllWithCode(code: ErrorCode) {
    for (const command of this.commandContainer.getAll()) {
      command.fail(
        new CommandError({
          code,
          queue: command.queue,
          commandName: command.commandName,
          args: command.args,
        }),
      );
    }
  }

  getInfo(correlationId: string) {
    const command = this.commandContainer.get(correlationId);
    if (!command) return null;

    return {
      queue: command.queue,
      commandName: command.commandName,
      args: command.args,
    };
  }
}
