import { CommandSender } from './CommandSender';

export class CommandSenderManager {
  commandSenders: Map<string, CommandSender> = new Map();

  set(queue: string, commandSender: CommandSender) {
    this.commandSenders.set(queue, commandSender);
  }

  get(queue: string) {
    return this.commandSenders.get(queue) || null;
  }

  async disposeAll() {
    const commandSenders = [...this.commandSenders.values()];
    this.commandSenders.clear();

    await Promise.all(
      commandSenders.map((commandSender) => commandSender.dispose()),
    );
  }
}
