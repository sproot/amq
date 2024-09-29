import { IdGenerator } from './types';

export class UuidIdGenerator implements IdGenerator {
  private readonly uuidv4: () => string;

  constructor(uuidv4: () => string) {
    this.uuidv4 = uuidv4;
  }

  generate(): string {
    return this.uuidv4();
  }
}
