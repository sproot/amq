# amq

This library is intended to address two objectives:

* Increase reliability via the ability to automatically restore the connection and channel. Useful for network failures and when rabbitmq works in cluster mode.
* Simplify interaction with rabbitmq by using simple abstractions: **pub/sub**, **jobs** and **commands (rpc)**

# Get Started

To install the library, use the following command:

```sh
npm install --save amq
```

# Usage

The first thing we need is a connection to amqp (rabbitmq). To do this, simply create an instance of the `AmqpConnection` class and establish a connection:


```ts
import { AmqpConnection } from 'amq';

const amqpConnection = new AmqpConnection({
    protocol: 'amqp' // default: amq
    hostname: 'localhost', // default: localhost
    port: 5672, // default: 5672
    username: 'username', // default: guest
    password: 'p4ssw0rd', // default: guest
    vhost: 'my_vhost', // default: /

    // formula: round(1.8 ^ (attempt - 1) * 1000), where: 1 <= attempt <= 4
    // attempt (immediately) |> 1s |> attempt |> 1.8s |> attempt |> 3.2s |> attempt (total: ~6s)
    maxConnectionAttempts: 4, // optional, default: 10
    connectionAttemptTimeoutBase: 1.8, // optional, default: 1.275
    connectionAttemptTimeoutMultiplier: 1000, // optional, default: 1000

    // Each command is retried until succeeded
    // To prevent infinite loops of failing retries, there is timeout for each
    // command execution, after which command will be rejected with CommandTimedOutError
    commandTimeoutMs: 60 * 1000, // optional

    // Will cause the connection to emit "staleCommand" error when command executes for too long
    staleCommandDurationMs: 10 * 1000 // optional
});

try {
    await amqpConnection.connect();
} catch (error) { // throws the last connection error
    logger.error('Could not establish AMQP connection:', error);
    return;
}
```

To close the connection gracefully, use the `dispose` method:

```ts
await amqpConnection.dispose();
```

## AmqpConnection events

You can subscribe to the events we are interested in. AmqpConnection emits two important events:
* `reconnected``: when connection has closed and new one has been created
* `channelRecreated``: when channel has closed and new one has been created

You should use `reconnected`` event to re-assert your exclusive exchanges and queues, because they're tied to the connection, which has closed.

One of the important events is `channelRecreated`. This event is emitted when the channel is recreated. This can happen when the connection is lost and then restored. In this case, the channel is recreated. You should use `channelRecreated` event to re-consume the queue, because consumption is tied to the channel.


This library uses `ConfirmChannel` for asynchronously publish messages to the queue and exchange.

```ts
// Emits when connection failed
// Doesn't mean that connection is closed though (it might still reconnect eventually)
// To handle permanent connection close, check the "closed" event
amqpConnection.on('error', (error) => {
    logger.warn('AMQP connection error:', error);
});

// Emits when connection failed and could not reconnect
// Does NOT emit on manual #dispose()
// Does NOT emit on first connection attempt (#connect() method)
amqpConnection.on('closed', () => {
    logger.warn('AMQP connection has closed');
});

// Does NOT emit on first connection attempt (#connect() method)
// Once amqp is reconnected, you should execute some commands again,
//   such as #consumeQueue(), #assertQueue (for exclusive queues),
// #setChannelPrefetchCount(), etc.
amqpConnection.on('reconnected', async () => {
    await amqpConnection.setConsumerPrefetchCount(10);
    logger.info('AMQP connection has reconnected to the server');
});

// Once amqp channel is re-created, you should execute some commands again,
//   such as #consumeQueue(), #setChannelPrefetchCount() etc.
// This event DOES NOT emit after "reconnected", since it's scoped to the current connection
// If connection changed (e.g. "reconnected"), the new channel is created for that connection
//   and is not treated as "re-creation"
amqpConnection.on('channelRecreated', async () => {
    await amqpConnection.setConsumerPrefetchCount(10);
    logger.info('AMQP channel has been re-created');
});

// Returns messages with "mandatory: true" flag, that could not be routed
// More info: http://www.squaremobius.net/amqp.node/channel_api.html#channel-events
amqpConnection.on('return', (correlationId) => {
    logger.info('Message has been returned, because it could not be routed:', correlationId);
});

amqpConnection.on('staleCommand', ({ durationMs, hasTimedOut, command, args, attempts }) => {
    logger.warn('Stale command:', { durationMs, hasTimedOut, command, args, attempts });
});
```

## AmqpConnection methods

Although using Jobs and RPC is the recommended way of using the library, we can use `amqpConnection` directly for various purposes, such as creating exchanges, queues, publishing messages and so on. The basic methods of the `amqpConnection` instance are as follows:

### `setChannelPrefetchCount`

Sets the number of messages (https://www.rabbitmq.com/consumer-prefetch.html)[prefetch] for the channel. This value is shared across all consumers on the channel (global: true)


```ts
await amqpConnection.setChannelPrefetchCount(10);
```

### `setConsumerPrefetchCount`

Sets the number of messages (https://www.rabbitmq.com/consumer-prefetch.html)[prefetch] for the consumer. This value is scoped to the current consumer (global: false)

```ts
await amqpConnection.setConsumerPrefetchCount(10);
```

### `assertExchange`

Creates an exchange if it doesn't exist. If it exists, does nothing.

```ts
await amqpConnection.assertExchange({
    exchange: 'my-exchange',
    type: ExchangeType.Direct,
    durable: true, // default: true
    autoDelete: false, // default: false
});
```

* `durable` (boolean): if true, the exchange will survive broker restarts. Defaults to true.
* `autoDelete` (boolean): if true, the exchange will be destroyed once the number of bindings for which it is the source drop to zero. Defaults to false.

### `deleteExchange`

Deletes an exchange if it exists. If it doesn't exist, does nothing.

```ts
await amqpConnection.deleteExchange('my-exchange');
```

### `assertQueue`

Creates a queue if it doesn't exist. If it exists, does nothing.

```ts
await amqpConnection.assertQueue({
    queue: 'my-queue',
    durable: true, // default: true
    exclusive: false, // default: false
    autoDelete: false, // default: false
    disuseExpireMs: 60 * 1000, // optional
    deadLetterExchange: 'my-dead-letter-exchange', // optional
    deadLetterRoutingKey: 'my-dead-letter-routing-key', // optional
    singleActiveConsumer: false, // optional
});
```

* `durable` (boolean): if true, the queue will survive broker restarts. Defaults to true.
* `exclusive` (boolean): if true, scopes the queue to the connection (defaults to false). Exclusive queues may only be consumed from by the current connection. Setting the exclusive property always implies `autoDelete` as well.
* `autoDelete` (boolean): if true, the queue will be destroyed once the number of consumers drops to zero. Defaults to false.
* `disuseExpireMs` (number): if specified, the queue will be deleted after the specified amount of time (in milliseconds) after it has been unused (i.e. no consumers). Defaults to undefined.
* `deadLetterExchange` (string): if specified, messages that are rejected or expire will be routed to this exchange. Defaults to undefined.
* `deadLetterRoutingKey` (string): if specified, messages that are rejected or expire will be routed to this routing key. Defaults to undefined.
* `singleActiveConsumer` (boolean): if true, only one consumer will be able to consume from the queue at a time. Defaults to false.

### `deleteQueue`

Deletes a queue if it exists. If it doesn't exist, does nothing.

```ts
await amqpConnection.deleteQueue('my-queue');
```

### `bindQueue`

Binds a queue to an exchange.

```ts
await amqpConnection.bindQueue({
    queue: 'my-queue',
    exchange: 'my-exchange',
    routingKey: 'my-routing-key', // optional
});
```

* `routingKey` (string): if specified, the queue will be bound to the exchange with the specified routing key. Defaults to undefined.


### `consumeQueue`

Consumes a queue.

```ts
const consumerTag = await amqpConnection.consumeQueue(
    queue,
    /**
     * type AmqpMessage = {
     *     content: Buffer,
     *     deliveryTag: number,
     *     correlationId?: string,
     *     replyQueue?: string,
     * }
     */
    async (message) => {
        logger.info('AMQP message received:', message);

        await amqpConnection.acknowledge(message.deliveryTag);
        // or
        await amqpConnection.negativeAcknowledge(message.deliveryTag);
    },
    { requiresAcknowledgement: true } // default: false
);
```

* `requiresAcknowledgement` (boolean): if true, the message must be acknowledged or negatively acknowledged manually. Otherwise, it will be acknowledged automatically. Defaults to false.

### `cancelConsumption`

Cancels a consumer.

```ts
await amqpConnection.cancelConsumption(consumerTag);
```

* `consumerTag` (string): the consumer tag of the consumer to cancel.

### `acknowledge`

Acknowledges a message.

```ts
await amqpConnection.acknowledge(deliveryTag);
```

* `deliveryTag` (number): the delivery tag of the message to acknowledge.

### `negativeAcknowledge`

Negatively acknowledges a message.

```ts
await amqpConnection.negativeAcknowledge(deliveryTag);
```

* `deliveryTag` (number): the delivery tag of the message to negatively acknowledge.


### `publishToExchange`

Publishes a message to an exchange.

```ts
import { JsonBufferSerializer } from 'amq';

const jsonBufferSerializer = new JsonBufferSerializer();

await amqpConnection.publishToExchange(
    exchange,
    jsonBufferSerializer.serialize({ hello: 'world' }),
    {
        correlationId,
        routingKey,
        persistent,
        mandatory,
        expireMs,
    }
);
```

* `correlationId` (string): if specified, the correlation id of the message will be set to the specified value. Defaults to undefined.
* `routingKey` (string): if specified, the message will be published to the exchange with the specified routing key. Defaults to undefined.
* `persistent` (boolean): if true, the message will be persisted to disk. Defaults to false.
* `mandatory` (boolean): if true, the message will be returned if it cannot be routed to any queue. Defaults to false.
* `expireMs` (number): if specified, the message will be deleted after the specified amount of time (in milliseconds) after it has been published. Defaults to undefined.


### `sendToQueue`

Sends a message to a queue bypassing the exchange.

```ts
import { JsonBufferSerializer } from 'amq';

const jsonBufferSerializer = new JsonBufferSerializer();

await amqpConnection.sendToQueue(
    queue,
    jsonBufferSerializer.serialize({ hello: 'world' }),
    {
        correlationId,
        replyQueue,
        mandatory,
        persistent,
        expireMs,
    }
);
```

* `correlationId` (string): if specified, the correlation id of the message will be set to the specified value. Defaults to undefined.
* `replyQueue` (string): if specified, the reply queue of the message will be set to the specified value. Defaults to undefined.
* `mandatory` (boolean): if true, the message will be returned if it cannot be routed to any queue. Defaults to false.
* `persistent` (boolean): if true, the message will be persisted to disk. Defaults to false.
* `expireMs` (number): if specified, the message will be deleted after the specified amount of time (in milliseconds) after it has been published. Defaults to undefined.

# Publish/Subscribe

This is the most common use case for RabbitMQ. We have a publisher that publishes messages to the exchange, and we have one or more subscribers that consume messages from the exchange.

## Publishing

```ts
    import { PubSub } from 'amq';

    const pubSub = new PubSub({ amqpConnection });

    pubSub.publish('my-topic', { hello: 'world' }, options);
```

Options:
* `exchangeType` (ExchangeType): the type of the exchange to publish to. Defaults to `ExchangeType.Fanout`.
* `routingKey` (string): the routing key to publish with. Defaults to undefined.

## Subscribing

```ts
    import { PubSub } from 'amq';

    const pubSub = new PubSub({
        amqpConnection,
        queueNamePattern: '{topic}:{consumerNumber}', // optional
    });

    pubSub.subscribe('my-topic', (message) => {
        logger.info('Message received:', message);
    }, options);
```

Options:
* `queueName` (string): the name of the queue to consume from. By default it's generated based on `queueNamePattern`.
* `exchangeType` (ExchangeType): the type of the exchange to consume from. Defaults to `ExchangeType.Fanout`.
* `routingKey` (string): the routing key to consume with. Defaults to undefined.
* `singleActiveConsumer` (boolean): if true, only one consumer will be able to consume from the queue at a time. Defaults to true.
* `autoDeleteQueue` (boolean): if true, the queue will be deleted once the number of consumers drops to zero. Defaults to false.

# Remote procedure call (RPC)

- Used when we need to know the status of execution and its result.
- Usually execute in a short time (up to 1 minute or so).
- Commands are not retried and timed out after specified timeout (default: **1 minute**).

> You can create multiple RPC servers and clients using just one `AmqpConnection` instance.
> Ideally you would want to have one server and one client per Node process.

## RpcServer initialization

Initialize an RpcServer to handle commands:
```ts
import { RpcServer } from 'amq';

const rpcServer = new RpcServer({
    amqpConnection,
    exchange: 'rpc-exchange',
    queue: 'my-rpc-server',
    commandTimeoutMs: 60 * 1000, // optional
    staleCommandDurationMs: 10 * 1000, // optional
});

rpcServer.on('staleCommand', ({ durationMs, hasTimedOut, queue, commandName, args }) => {
    logger.warn('Stale command:', { durationMs, hasTimedOut, queue, commandName, args });
});

rpcServer.on('acknowledgeError', ({ error, queue, commandName, args }) => {
    logger.warn('Acknowledge error:', { error, queue, commandName, args });
});

// (optional)
// If you need the RPC queue to be exclusive to the connection,
// execute this method before executing #listen()
rpcServer.setIsExclusive(true);

rpcServer.setCommandHandler(
    'generateGreeting',
    (firstName, lastName) => `Hello, ${firstName} ${lastName}`,
);

await rpcServer.listen();

// execute this before disposing the AMQP connection
await rpcServer.dispose();
```

* `amqpConnection` (AmqpConnection): the AMQP connection to use.
* `exchange` (string): the name of the exchange to publish commands to.
* `queue` (string): the name of the queue to consume commands from.
* `commandTimeoutMs` (number): the timeout of a command in milliseconds. Defaults to 1 minute.
* `staleCommandDurationMs` (number): the duration of a command to be considered stale in milliseconds. Defaults to 10 seconds.

### Command handlers

You can use an object with a `#handle` method or a function as a command handler.

Both options are fine, but it's recommended to use objects instead of functions, since it's more scalable and testable.

> NOTE: `#handle` function MUST be `async`, because it's easier to catch errors and perform timeout logic on asynchronous functions.
>
> Even if your command is synchronous, use `async` keyword – it won't harm your performance.


An example of a class instance as a handler:
```ts
class GreetCommandHandler {
    async handle(name) {
        return `Hello, ${name}`;
    }
}

rpcServer.setCommandHandler(
    'my-command',
    new GreetCommandHandler()
);
```

Or a plain object:
```ts
rpcServer.setCommandHandler(
    'my-command',
    { handle: async (name) => `Hello, ${name}` }
);
```

Or a function:
```ts
rpcServer.setCommandHandler(
    'my-command',
    async name => `Hello, ${name}`
);
```

## RpcClient initialization

Initialize an RpcClient to send commands:
```ts
import { RpcClient } from 'amq';

const rpcClient = new RpcClient({
    amqpConnection,
    commandTimeoutMs: 30 * 1000, // optional
    replyQueueDisuseExpireMs: 60 * 1000, // optional
    staleCommandDurationMs: 10 * 1000, // optional
});

rpcClient.on('staleCommand', ({ durationMs, hasTimedOut, queue, commandName, args }) => {
    logger.warn('Stale command:', { durationMs, hasTimedOut, queue, commandName, args });
});

rpcClient.on('acknowledgeError', ({ error, queue, commandName, args }) => {
    logger.warn('Acknowledge error:', { error, queue, commandName, args });
});

const greeting = await rpcClient.executeRemoteCommand(
    'my-rpc-server', 'generateGreeting', 'Jon', 'Snow'
);

console.log(greeting); // Hello, Jon Snow

// execute this before disposing the AMQP connection
await rpcClient.dispose();
```

* `amqpConnection` (AmqpConnection): the AMQP connection to use.
* `commandTimeoutMs` (number): the timeout of a command in milliseconds. Defaults to 1 minute.
* `replyQueueDisuseExpireMs` (number): the duration of a reply queue to be considered unused in milliseconds. Defaults to 1 minute.
* `staleCommandDurationMs` (number): the duration of a command to be considered stale in milliseconds. Defaults to 10 seconds.

# Jobs

Jobs are similar to `RPC`, but the differences are:
- We use when we don't expect an execution result.
- Usually take some time to perform (from minutes to hours)
- Jobs are retried when failed (either using default options or custom ones per handler).

> You can create multiple job servers and clients using just one `AmqpConnection` instance.
> Ideally you would want to have one server and one client per Node process.

## JobServer Initialization

Initialize a JobServer to handle jobs:
```ts
import { JobServer, ExponentialRetryDelayCalculator } from 'amq';

const jobServer = new JobServer({
    amqpConnection,
    queue: 'jobs:files-api',
    exchange: 'jobs',
    defaultMaxAttemptCount: 100, // Optional. default: 25
    staleJobDurationMs: 1000 * 60 * 10, // Optional
    defaultRetryDelayCalculator: new ExponentialRetryDelayCalculator({
        base: 2,
        multiplier: 1000,
        max: 7 * 24 * 60 * 60 * 1000, // 7 days
    }),
});

// emitted when message from the jobs queue is invalid
jobServer.on('deserializationError', (error, content) => {
    logger.warn('Could not deserialize content:', String(content), error);
});

// emitted when job has thrown an error (which will be handled and retried)
// if job handler has a #handleError method, only errors thrown by this method will be emitted via this event
jobServer.on('jobError', (error, { job, data, retryContext, attempt }) => {
    logger.warn('Could not handle a job:', { job, data, retryContext, attempt }, error);
});

// emitted when max attempt count for the job is exceeded or scheduler.discard() has been called directly
jobServer.on('jobDiscarded', ({ job, data, attempt, reason }) => {
    logger.warn('Job has been discarded:', { job, data, attempt, reason });
});

jobServer.on('acknowledgeError', ({ error, job, data, retryContext, attempt }) => {
    logger.warn('Acknowledge error:', { job, data, retryContext, attempt }, error);
});

jobServer.on('staleJob', ({ durationMs, hasTimedOut, job, data, retryContext, attempt }) => {
    logger.warn('Stale job:', { durationMs, hasTimedOut, job, data, retryContext, attempt });
});

jobServer.setJobHandler(
    'greet',
    {
        async handle({ data: { name } }) {
            console.log('Hello,', name);
        }
    }
);

await jobServer.listen();

// execute this before disposing the AMQP connection
await jobServer.dispose();
```

* `amqpConnection` (AmqpConnection): an instance of `AmqpConnection` class.
* `queue` (string): the name of the queue to listen to.
* `exchange` (string): the name of the exchange to publish jobs to.
* `defaultMaxAttemptCount` (number): the maximum number of attempts to perform a job. Defaults to `25`.
* `defaultTimeoutCalculator` (TimeoutCalculator): the timeout calculator to use for a job. Defaults to an exponential calculator, which is configured to execute these `25` attempts in a span of `~21` days.

## JobClient initialization

Initialize a JobClient to send jobs:
```ts
import { JobClient } from 'amq';

const jobClient = new JobClient({ exchange: 'jobs' }, { amqpConnection });

await jobClient.performInBackground(queue, { job: 'my-job-name' });

await jobClient.performInBackground(queue, {
    job: 'greet',
    expireMs: 1000,
    data: {
        name: 'Jon Snow',
    },
});

// execute this before disposing the AMQP connection
jobClient.dispose();
```

### `JobClient#performInBackground()`

Method declaration:

```ts
performInBackground(
    queue: string,
    context: {
        job: string,
        data?: object,
        expireMs?: number,
        transient?: boolean
    }
);
```

* `queue` (string): the name of the queue to send the job to.
* `context` (object):
    * `job` (string): the name of the job to perform.
    * `data` (object): the data to pass to the job handler.
    * `expireMs` (number): the duration of the job to be considered stale in milliseconds. Defaults to undefined.
    * `transient` (boolean): whether the job should be transient. Defaults to `false`.

## Implementing a job handler

To implement a job handler, you need to provide a function or an object with a `#handle` method.

> NOTE: `#handle` function MUST be `async`, because it's easier to catch errors and perform timeout logic on asynchronous functions.
>
> Even if your job is synchronous, use `async` keyword – it won't harm your performance.

An example of simple job handler:

```ts
class DeleteUserHandler {
    constructor(deleteUserInteractor) {
        this._deleteUserInteractor = deleteUserInteractor;
    }

    async handle({ data: { userId } }) {
        await this._deleteUserInteractor.execute(userId);
    }
}
```

As a function:
```ts
jobServer.setJobHandler(
    'greet',
    async ({ data: { name } }) => console.log(`Hello, ${name}`)
);
```

Each `#handle` execution is provided with two arguments:
- `"context"` object with `data`, `retryContext` and `attempt` fields,
- `Scheduler` instance.

Most of the time you'll only need `data` field.

### Argument: `context.data`

`data` field of `"context"` object is assigned once when job is initially created and cannot be changed afterwards.

That means that initial `data` is always the same, no matter how many times the job was retried.

Example:
```ts
jobClient.performInBackground(
    'files-api:jobs',
    {
        job: 'deleteUser',
        data: {
            userId: 'fake-user-id'
        }
    }
);
```

```ts
class MyJobHandler {
    async handle({ data: { userId } }) {
        this._logger.info('User ID:', userId); // User ID: fake-user-id
    }
}
```

### Argument: `context.retryContext`

`retryContext` field of `"context"` object can be assigned with `scheduler.retry()` method.

That means that `retryContext` is unique for each job execution.

By default its value is `{}` (an empty object).

You can use this field to provide extra context for retry attempts.

Example:
```ts
class DeleteUserHandler {
    constructor(deleteUserInteractor) {
        this._deleteUserInteractor = deleteUserInteractor;
    }

    async handle({ data: { userId }, retryContext: { lastError } }) {
        if (lastError) {
            logger.info('Last "deleteUser" attempt failed with error:', lastError);
        }

        await this._deleteUserInteractor.execute(userId);
    }

    async handleError(context, error, scheduler) {
        await scheduler.retry({
            retryContext: {
                lastError: error.message,
            }
        });
    }
}
```

> Note: If you don't provide `retryContext` specifically, its previous value won't be reused and won't be passed to the next retry attempt.
>
> It means that you need to provide `retryContext` each time you call `scheduler.retry()` (in case you need `retryContext`, of course).

### Argument: `context.attempt`

`attempt` field of `"context"` object is assigned automatically for each execution.

You can reset `context.attempt` using `resetAttempts` option in `scheduler.retry()`.

It will reset **current** attempt to `1` and treat next one as second attempt.

```ts
class MyHandler {
    async handle({ attempt }, scheduler) {
        logger.info('Current attempt:', attempt);

        scheduler.retry({
            resetAttempts: attempt === 5,
        });
    }
}
```

Console output:
```
Current attempt: 1
Current attempt: 2
Current attempt: 3
Current attempt: 4
Current attempt: 5
Current attempt: 2 <- notice that there is no first attempt when reset
Current attempt: 3
Current attempt: 4
Current attempt: 5
...
```

> Note: since first attempt is only executed once, job with `maxAttemptCount: 1` will be handled exactly one time:
> ```ts
> class MyHandler {
>     async handle({ attempt }, scheduler) {
>         logger.info('I will be logged once');
>
>         scheduler.retry({ resetAttempts: true }); // discards the job immediately
>     }
>
>     get maxAttemptCount() {
>         return 1;
>     }
> }
> ```

### Argument: `scheduler`

You can use `scheduler` in both `#handle` and `#handleError` – it'll be the same instance in both cases.

`scheduler` only has two methods:
- `retry()`, which can be used for... retrying :)
- `discard()`, which causes `"discardedJob"` event for the job to be emitted immediately and all further `scheduler.retry()` calls to be ignored.

## `Scheduler.retry()`

It has one optional argument with three optional fields:
- `retryDelayMs` – specify custom delay for retry skipping default & custom retry delay calculation
- `retryContext` – specify custom retry context for the next attempt
- `resetAttempts` – resets current performed attempt count to `1`

Example:
```ts
scheduler.retry(); // executed by default on error

// will retry job in 5 seconds with the context:
// { data: <inherited>, retryContext: { name: 'Jon Snow' }, attempt: 2 }
scheduler.retry({
    retryDelayMs: 5000,
    retryContext: {
        name: 'Jon Snow'
    },
    resetAttempts: true,
});
```

> Note: `retryContext` is not being inherited from current context.
> You need to provide `retryContext` each time (if you need it).

## `Scheduler.discard(reason)`

```ts
jobServer.on('jobDiscarded', ({ job, data, attempt, reason }) => {
    logger.info('Job has been discarded:', job, data, attempt, reason); // 'myJob' { name: 'Jon Snow' } 1 Error "Some error"
});

class MyJobHandler {
    async handle({ data: { name } }, scheduler) {
        if (name === 'Jon Snow') {
            scheduler.discard(new Error('Some error'));
            // return; <- For the sake of example, return has been commented, but ideally you should stop method execution after discarding the job
        }

        scheduler.retry(); // will be ignored
        throw Error('Some error'); // will still call #handleError when present or emit "jobError" otherwise, but won't schedule a retry attempt fo the job
    }

    handleError(context, error, scheduler) {
        scheduler.retry() // will be ignored
        throw Error('Some error'); // will emit "jobError", but won't schedule a retry attempt for the job
    }
}
```

> Note 1: You can discard in the `#handleError` method too.

> Note 2: `"reason"` argument is optional, you can just call `scheduler.discard()` without any arguments.

> Note 3: Only use `scheduler.discard()` when you need to `"jobDiscarded"` event to be emitted. It's useful for "unexpected" job cancellation. For example, when subject of the job is no longer available (e.g. "deleteEvent" job for event that doesn't exist anymore).
>
> When job cancellation is not unexpected, just stop job execution and/or catch all errors without calling `scheduler.discard()`

## Custom error handling

To handle errors in `#handle` method of your job handler, you need to implement `#handleError` method, which is called with 3 arguments:
- `"context"` object (the same as in `#handle`)
- `error` (thrown in `#handle` method)
- `Scheduler` instance

Example:
```ts
class NotAllowedError extends Error {}

class MyJobHandler {
    async handle({ data: { name } }) {
        if (name === 'Jon Snow') {
            throw new NotAllowedError();
        }
    }

    async handleError(context, error, scheduler) {
        if (error instanceof NotAllowedError) {
            await scheduler.retry({
                retryDelayMs: 5000,
            });
        }
    }
}
```

## Custom max attempt count

Add a `maxAttemptCount` getter in your handler to override `defaultMaxAttemptCount`:
```ts
class MyHandler {
    async handle() {
        // ...
    }

    get maxAttemptCount() {
        return 5;
    }
}
```

> Note: `maxAttemptCount` must be 1 or greater

## Custom retry delay calculator

You can use one of provided retry delay calculators from the library:
* `ConstantRetryDelayCalculator`
* `PredefinedRetryDelayCalculator`
* `LinearRetryDelayCalculator`
* `ExponentialRetryDelayCalculator`

### `ConstantRetryDelayCalculator`

Is using a constant delay for each attempt:
```ts
import { ConstantRetryDelayCalculator } from 'amq';

class MyHandler {
    private readonly retryDelayCalculator: ConstantRetryDelayCalculator;

    constructor() {
        this.retryDelayCalculator = new ConstantRetryDelayCalculator(1000);
    }

    async handle() {
        // handle implementation
    }
}
```

### `PredefinedRetryDelayCalculator`

Is using predefined delays for each attempt:
```ts
import { PredefinedRetryDelayCalculator } from 'amq';

class MyHandler {
    private readonly retryDelayCalculator: PredefinedRetryDelayCalculator;

    constructor() {
        this.retryDelayCalculator = new PredefinedRetryDelayCalculator([1000, 2000, 3000]);
    }

    async handle() {
        // handle implementation
    }
}
```

### `LinearRetryDelayCalculator`

Is using linear delay calculation for each attempt:
```ts
import { LinearRetryDelayCalculator } from 'amq';

class MyHandler {
    private readonly retryDelayCalculator: LinearRetryDelayCalculator;

    constructor() {
        this.retryDelayCalculator = new LinearRetryDelayCalculator({
            base: 2,
            min: 1000,
            max: 10000,
        });
    }

    async handle() {
        // handle implementation
    }
}
```

* `base` – multiplier for each attempt
* `min` – minimum delay in milliseconds
* `max` – maximum delay in milliseconds

### `ExponentialRetryDelayCalculator`

Is using exponential delay calculation for each attempt:

```ts
import { ExponentialRetryDelayCalculator } from 'amq';

class MyHandler {
    private readonly retryDelayCalculator: ExponentialRetryDelayCalculator;

    constructor() {
        this.retryDelayCalculator = new ExponentialRetryDelayCalculator({
            base: 2,
            multiplier: 2,
            min: 1000,
            max: 10000,
        });
    }

    async handle() {
        // handle implementation
    }
}
```
The formula is:
```ts
const result = base ** (attempt - 1) * multiplier;
Math.min(max, Math.max(min, result));
```

* `base` – base number for each attempt
* `multiplier` – multiplier for each attempt
* `min` – minimum delay in milliseconds
* `max` – maximum delay in milliseconds

### Custom retry delay calculator

You can implement custom retry delay calculator by creating an object with `calculate(attempt)` method:
```ts
class WeirdRetryDelayCalculator {
    calculate(attempt) {
        return (attempt * 5000 - 1000) ** 2 + 46;
    }
}
```

## Job timeout

By default job handlers do not time out, but if you expect the job to perform within certain duration, you can use `timeoutMs` getter (or variable):
```ts
class MyJobHandler {
    async handle() {
        // ...
    }

    get timeoutMs() {
        return 60 * 1000; // 1 minute
    }
}

// or

jobServer.setJobHandler(
    'myJob',
    { async handle() {}, timeoutMs: 60 * 1000 }
);
```

`#handle` method will fail with `JobTimedOutError` after specified duration and job will be retried as usual.
