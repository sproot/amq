import { CommandHandler } from '../../main';

export class CommandHandlerExample implements CommandHandler {
  async handle(name: string, company: string) {
    return `Hello, ${name} from ${company}!`;
  }
}
