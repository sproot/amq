import { AmqpConnection, JobServer, RpcServer } from '../main';
import { connectToAmqp } from './connectToAmqp';

import { JobHandlerExample } from './server/JobHandlerExample';
import { CommandHandlerExample } from './server/CommandHandlerExample';

const config = {
  jobs: {
    exchange: process.env.RABBITMQ_JOBS_EXCHANGE || 'jobs',
    queue: process.env.RABBITMQ_JOBS_QUEUE || 'jobs:demo-app',
  },
  rpc: {
    exchange: process.env.RABBITMQ_RPC_EXCHANGE || 'rpc',
    queue: process.env.RABBITMQ_RPC_QUEUE || 'rpc:demo-app',
  },
};

let amqpConnection: AmqpConnection;
let rpcServer: RpcServer;
let jobServer: JobServer;

async function start() {
  amqpConnection = await connectToAmqp();
  rpcServer = await initializeRpcServer(amqpConnection);
  jobServer = await initializeJobServer(amqpConnection);
}

async function shutdown(error?: Error) {
  if (error) {
    console.error('Fatal error, shutting down:', error);
  } else {
    console.info('Shutting down the application...');
  }

  if (rpcServer) await rpcServer.dispose();
  if (jobServer) await jobServer.dispose();
  if (amqpConnection) await amqpConnection.dispose();

  process.exit(error ? 1 : 0);
}

start().catch((error) => shutdown(error));

async function initializeRpcServer(amqpConnection: AmqpConnection) {
  const rpcServer = new RpcServer({
    amqpConnection,
    exchange: config.rpc.exchange,
    queue: config.rpc.queue,
    commandTimeoutMs: 60 * 1000, // optional
    staleCommandDurationMs: 10 * 1000, // optional
  });

  // Emitted when a command takes longer than expected to execute
  // Emitted only if 'staleCommandDurationMs' is set
  // Useful for debugging
  rpcServer.on(
    'staleCommand',
    ({ durationMs, hasTimedOut, queue, commandName, args }) => {
      console.warn('Stale command:', {
        durationMs,
        hasTimedOut,
        queue,
        commandName,
        args,
      });
    },
  );

  // Emitted when there a problem with acknowledging the command
  rpcServer.on('acknowledgeError', ({ error, queue, commandName, args }) => {
    console.warn('Acknowledge error:', { error, queue, commandName, args });
  });

  // Setting up command handlers
  // First argument is the command name, second is the handler instance or a function
  rpcServer.setCommandHandler('runExampleCommand', new CommandHandlerExample());

  await rpcServer.listen();

  return rpcServer;
}

async function initializeJobServer(amqpConnection: AmqpConnection) {
  const jobServer = new JobServer({
    amqpConnection,
    exchange: config.jobs.exchange,
    queue: config.jobs.queue,
  });

  // Emitted when there is a problem with deserializing job content
  jobServer.on('deserializationError', (error, content) => {
    console.warn('Could not deserialize content:', String(content), error);
  });

  // Emitted when job has thrown an error (which will be handled and retried)
  // if job handler has a #handleError method, only errors thrown by this method
  // will be emitted via this event
  jobServer.on('jobError', (error, { job, data, retryContext, attempt }) => {
    console.warn(
      'Could not handle a job:',
      { job, data, retryContext, attempt },
      error,
    );
  });

  // Emitted when max attempt count for the job is exceeded
  // or scheduler.discard() has been called directly
  jobServer.on('jobDiscarded', ({ job, data, attempt, reason }) => {
    console.warn('Job has been discarded:', {
      job,
      data,
      attempt,
      reason,
    });
  });

  // Emitted when there a problem with acknowledging the job
  jobServer.on(
    'acknowledgeError',
    ({ error, job, data, retryContext, attempt }) => {
      console.warn(
        'Acknowledge error:',
        { job, data, retryContext, attempt },
        error,
      );
    },
  );

  // Emitted when job takes longer than expected
  // Useful for debugging
  jobServer.on(
    'staleJob',
    ({ durationMs, hasTimedOut, job, data, retryContext, attempt }) => {
      console.warn('Stale job:', {
        durationMs,
        hasTimedOut,
        job,
        data,
        retryContext,
        attempt,
      });
    },
  );

  // Registering job handlers
  // First argument is the job name, second is the job handler instance or a function
  jobServer.setJobHandler('doExampleJob', new JobHandlerExample());

  await jobServer.listen();

  return jobServer;
}
