import type { Jest } from '@jest/environment';

export type FactoryMock<T> = { create: jest.MockedFunction<() => T> };
export class FactoryMockHelper {
  private jest: Jest;

  constructor(jest: Jest) {
    this.jest = jest;
  }

  create<T>(instance: T): FactoryMock<T> {
    return {
      create: this.jest.fn(() => instance) as jest.MockedFunction<() => T>,
    };
  }
}
