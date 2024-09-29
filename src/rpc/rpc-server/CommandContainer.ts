export class CommandContainer {
  private commands = new Map();

  set(correlationId: string, command: any): void {
    this.commands.set(correlationId, command);
  }

  get(correlationId: string): any {
    return this.commands.get(correlationId);
  }

  getAll(): any[] {
    return [...this.commands.values()];
  }

  delete(correlationId: string): void {
    this.commands.delete(correlationId);
  }

  clear(): void {
    this.commands.clear();
  }
}
