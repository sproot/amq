/**
 * Asynchronous version of EventEmitter which allows you
 *   to wait for all asynchronous event listeners to be fulfilled.
 */
type Listener = ((...args: any[]) => any) | ((...args: any[]) => Promise<any>);
type ListenerObject = {
  listener: Listener;
  once?: boolean;
};

export class AsyncEventEmitter {
  private listenerObjects: Map<string, Set<ListenerObject>> = new Map();

  emit(event: string, ...args: any[]) {
    if (!this.listenerObjects.has(event)) {
      // https://nodejs.org/api/events.html#events_error_events
      if (event === 'error') {
        throw args[0];
      }

      return Promise.resolve();
    }

    const promises = [];

    // make a copy so changes in listeners won't affect this emit() execution
    const listenersToExecute = Array.from(
      this.listenerObjects.get(event) ?? [],
    );

    for (const listenerObject of listenersToExecute) {
      const result = listenerObject.listener(...args);

      if (result && typeof result.then === 'function') {
        promises.push(result);
      }

      if (listenerObject.once) {
        this._removeListener(event, listenerObject);
      }
    }

    return Promise.all(promises).then(() => {
      return undefined;
    });
  }

  async emitAsync(event: string, ...args: any[]) {
    await this.emit(event, ...args);
  }

  on(event: string, listener: Listener) {
    if (!this.listenerObjects.has(event))
      this.listenerObjects.set(event, new Set());

    this.removeListener(event, listener);
    this.listenerObjects.get(event)?.add({ listener });
  }

  once(event: string, listener: Listener) {
    if (!this.listenerObjects.has(event))
      this.listenerObjects.set(event, new Set());

    this.removeListener(event, listener);
    this.listenerObjects.get(event)?.add({ listener, once: true });
  }

  removeListener(event: string, listener: Listener) {
    if (!this.listenerObjects.has(event)) return;

    for (const listenerObject of this.listenerObjects.get(event) ?? []) {
      if (listenerObject.listener === listener) {
        this._removeListener(event, listenerObject);
      }
    }
  }

  private _removeListener(event: string, listenerObject: ListenerObject) {
    this.listenerObjects.get(event)?.delete(listenerObject);

    if (this.listenerObjects.get(event)?.size === 0) {
      this.listenerObjects.delete(event);
    }
  }

  removeAllListeners(event?: string) {
    if (event) {
      this.listenerObjects.delete(event);
    } else {
      this.listenerObjects.clear();
    }
  }

  listenerCount(event: string) {
    return this.listenerObjects.get(event)?.size ?? 0;
  }
}
