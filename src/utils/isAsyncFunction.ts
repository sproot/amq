export function isAsyncFunction(func: (...args: any[]) => any) {
  return func.constructor.name === 'AsyncFunction' || func instanceof Promise;
}
