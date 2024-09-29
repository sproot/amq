import { EventEmitter } from 'events';

export class DiscardedJobReporter {
  private readonly emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
  }

  report({
    job,
    data,
    attempt,
    reason,
  }: {
    job: string;
    data: any;
    attempt: number;
    reason: any;
  }) {
    this.emitter.emit('jobDiscarded', { job, data, attempt, reason });
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: (...args: any[]) => void) {
    this.emitter.removeListener(event, listener);
  }
}
