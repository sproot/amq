import { JobClient } from '../../main';
import { connectToAmqp } from '../connectToAmqp';

const config = {
  exchange: process.env.RABBITMQ_JOBS_EXCHANGE || 'jobs',
  queue: process.env.RABBITMQ_JOBS_QUEUE || 'jobs:demo-app',
};

async function scheduleJob() {
  const amqpConnection = await connectToAmqp();

  const jobClient = new JobClient({
    amqpConnection,
    exchange: config.exchange,
  });

  await jobClient.performInBackground(config.queue, {
    job: 'doExampleJob',
    data: { name: 'Alex' },
  });

  await jobClient.dispose();

  process.exit(0);
}

scheduleJob();
