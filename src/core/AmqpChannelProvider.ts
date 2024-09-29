import type { Connection } from 'amqplib';

export class AmqpChannelProvider {
  private readonly amqplibConnection: Connection;

  constructor(amqplibConnection: Connection) {
    this.amqplibConnection = amqplibConnection;
  }

  async create() {
    const amqplibChannel = await this.amqplibConnection.createConfirmChannel();
    amqplibChannel.on('error', () => {}); // ignore unhandled errors
    return amqplibChannel;
  }
}
