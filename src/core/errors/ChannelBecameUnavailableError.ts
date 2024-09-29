export class ChannelBecameUnavailableError extends Error {
  constructor() {
    super('AMQP channel became unavailable while executing a command');
  }
}
