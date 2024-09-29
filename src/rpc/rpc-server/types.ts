export type CommandHandlerFunction = (...args: any[]) => Promise<any>;

export interface CommandHandler {
  handle(...args: any[]): Promise<any>;
}
