export * from './core/types';
export * from './rpc/rpc-server/types';
export * from './jobs/job-server/types';

export interface IdGenerator {
  generate(): string;
}
