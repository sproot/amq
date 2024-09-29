export class ConnectionClosingError extends Error {
  constructor() {
    super('AMQP connection is closing');
  }
}
