type CommandOptions = {
  queue: string;
  commandName: string;
  args: any[];
};

enum CommandStatus {
  Ready = 'ready',
  Succeeded = 'succeeded',
  Failed = 'failed',
}

export class Command {
  public readonly queue: string;
  public readonly commandName: string;
  public readonly args: any[];

  private status: CommandStatus = CommandStatus.Ready;
  private response: any;
  private error: any;
  private resolve: null | ((response: any) => void) = null;
  private reject: null | ((reason?: any) => void) = null;

  constructor({ queue, commandName, args }: CommandOptions) {
    this.queue = queue;
    this.commandName = commandName;
    this.args = args;
  }

  succeed(response: any) {
    if (this.status !== CommandStatus.Ready) return;
    this.status = CommandStatus.Succeeded;
    this.response = response;

    if (this.resolve) {
      this.resolve(response);
    }
  }

  fail(error: any) {
    if (this.status !== CommandStatus.Ready) return;
    this.status = CommandStatus.Failed;
    this.error = error;

    if (this.reject) {
      this.reject(error);
    }
  }

  wait() {
    if (this.status === CommandStatus.Failed) {
      return Promise.reject(this.error);
    }

    if (this.status === CommandStatus.Succeeded) {
      return Promise.resolve(this.response);
    }

    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
