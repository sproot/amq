export function isAsyncFunction(func: any): boolean {
  return func && (
    func.constructor.name === 'AsyncFunction' ||
    typeof func.then === 'function'
  );
}
