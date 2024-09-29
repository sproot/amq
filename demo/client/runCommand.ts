import { RpcClient } from '../../main';
import { connectToAmqp } from '../connectToAmqp';

const rpcQueue = process.env.RABBITMQ_RPC_QUEUE || 'rpc:demo-app';

async function runCommand() {
  const amqpConnection = await connectToAmqp();

  const rpcClient = new RpcClient({ amqpConnection });

  const greeting = await rpcClient.executeRemoteCommand(
    rpcQueue,
    'runExampleCommand',
    'Alex',
    'Universe',
  );

  console.log(greeting);

  await rpcClient.dispose();

  process.exit(0);
}

runCommand().catch((error) => console.error(error));
