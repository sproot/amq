/** Creates a simple factory for the provided class */
type Creator<T extends new (...args: any[]) => any> = (
  ...args: ConstructorParameters<T>
) => InstanceType<T>;

export class SimpleFactory {
  static for<T extends new (...args: any[]) => any>(
    class$: T,
  ): { create: Creator<T> } {
    return {
      create: (...args: ConstructorParameters<T>): InstanceType<T> =>
        new class$(...args),
    };
  }
}

export type FactoryFor<T> = {
  create: (...args: ConstructorParameters<new (...args: any) => T>) => T;
};
