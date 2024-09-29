import { v4 as uuidv4 } from 'uuid';

import { SimpleFactory } from '../src/utils/SimpleFactory';
import { UuidIdGenerator } from '../src/UuidIdGenerator';
import { JsonBufferSerializer } from '../src/core';
import { JobQueueInitializer } from '../src/jobs/job-queue/JobQueueInitializer';

import { AmqpConnection } from './AmqpConnection';
import { JobClient as JobClientBase } from '../src/jobs/job-client/JobClient';

type JobClientOptions = {
  amqpConnection: AmqpConnection;
  exchange: string;
};

export class JobClient extends JobClientBase {
  constructor({ amqpConnection, exchange }: JobClientOptions) {
    super(
      {
        exchange,
      },
      {
        amqpConnection,
        jobQueueInitializerFactory: SimpleFactory.for(JobQueueInitializer),
        jsonBufferSerializer: new JsonBufferSerializer(),
        idGenerator: new UuidIdGenerator(uuidv4),
      },
    );
  }
}
