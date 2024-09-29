import { AmqpConnection } from '../main';

const config = {
  username: process.env.RABBITMQ_USERNAME,
  password: process.env.RABBITMQ_PASSWORD,
  hostname: process.env.RABBITMQ_HOSTNAME,
  port: Number(process.env.RABBITMQ_PORT) || 5672,
  prefetchCount: Number(process.env.RABBITMQ_PREFETCH_COUNT) || 100,
};

export async function connectToAmqp() {
  const amqpConnection = new AmqpConnection({
    username: config.username,
    password: config.password,
    hostname: config.hostname,
    port: config.port,
  });

  amqpConnection.on('reconnected', async () => {
    console.log('AMQP connection has reconnected to the server');
    await amqpConnection.setConsumerPrefetchCount(config.prefetchCount);
  });

  amqpConnection.on('channelRecreated', async () => {
    console.log('AMQP channel has been re-created');
    await amqpConnection.setConsumerPrefetchCount(config.prefetchCount);
  });

  amqpConnection.on('error', (error) => {
    console.error('AMQP connection error:', error);
  });

  amqpConnection.on('closed', () => {
    console.error('AMQP connection has closed');
  });

  await amqpConnection.connect();
  await amqpConnection.setConsumerPrefetchCount(config.prefetchCount);

  return amqpConnection;
}
