export class CommandTimedOutError extends Error {
  constructor(timeoutMs: number) {
    super(`AMQP command has timed out after being retried for ${timeoutMs} ms`);
  }
}
