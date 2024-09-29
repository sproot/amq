export class ConnectionBecameUnavailableError extends Error {
  constructor() {
    super('AMQP connection became unavailable while executing a command');
  }
}
