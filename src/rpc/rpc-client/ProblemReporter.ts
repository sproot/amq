import { EventEmitter } from 'events';

export class ProblemReporter {
  private readonly emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
  }

  reportStaleCommand({
    durationMs,
    hasTimedOut,
    queue,
    commandName,
    args,
  }: {
    durationMs: number;
    hasTimedOut: boolean;
    queue: string;
    commandName: string;
    args: any[];
  }) {
    this.emitter.emit('staleCommand', {
      durationMs,
      hasTimedOut,
      queue,
      commandName,
      args,
    });
  }

  reportAcknowledgeError({
    error,
    queue,
    commandName,
    args,
  }: {
    error: any;
    queue: string;
    commandName: string;
    args: any[];
  }) {
    this.emitter.emit('acknowledgeError', { error, queue, commandName, args });
  }

  on(event: string, listener: (...args: any) => any) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: (...args: any) => any) {
    this.emitter.removeListener(event, listener);
  }
}
