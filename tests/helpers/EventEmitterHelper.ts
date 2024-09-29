import { AsyncEventEmitter } from './AsyncEventEmitter';
import type { Jest } from '@jest/environment';

const SPIED_METHODS = ['on', 'once', 'removeListener', 'removeAllListeners'];

type EventEmitterHelperOptions = {
  ignoreUnhandledErrors?: boolean;
};

export class EventEmitterHelper {
  private jest: Jest;

  constructor(jest: Jest) {
    this.jest = jest;
  }

  install(object: any, options: EventEmitterHelperOptions = {}) {
    const emitter = new AsyncEventEmitter();

    for (const method of SPIED_METHODS) {
      if (typeof object[method] === 'function') {
        object[method] = this.jest.fn(
          emitter[method as keyof AsyncEventEmitter].bind(emitter),
        );
      }
    }

    if (options.ignoreUnhandledErrors) {
      emitter.on('error', () => {});
    }

    return emitter;
  }
}
