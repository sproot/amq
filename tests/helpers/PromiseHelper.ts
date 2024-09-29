export class PromiseHelper {
  isPending(promise: Promise<any>): Promise<boolean> {
    return Promise.race([
      promise.then(
        () => false,
        () => false,
      ),
      Promise.resolve(true),
    ]);
  }
}
