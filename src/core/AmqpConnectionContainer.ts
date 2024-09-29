import { EventEmitter } from 'events';
import { AmqpConnection } from './AmqpConnection';

/**
 * Useful for wrapping connection's events such as "error" and "closed".
 * When connection is set or replaced, its events are being automatically redirected.
 * You can get current connection instance by using `container.get()`.
 *
 * @emits AmqpConnectionContainer#error
 * @emits AmqpConnectionContainer#closed
 * @emits AmqpConnectionContainer#return
 * @emits AmqpConnectionContainer#channelRecreated
 */

type callbackFunction = (...args: any) => void;
type listenerFunction = (...args: any) => void;

export class AmqpConnectionContainer {
  private readonly emitter = new EventEmitter().on('error', () => {}); // ignore unhandled "error" events
  private availableCallbacks: callbackFunction[] = [];
  private connection: AmqpConnection | null = null;

  constructor() {
    this.handleError = this.handleError.bind(this);
    this.handleClosed = this.handleClosed.bind(this);
    this.handleReturn = this.handleReturn.bind(this);
    this.handleChannelRecreated = this.handleChannelRecreated.bind(this);
  }

  set(connection: AmqpConnection | null) {
    this.detachConnection();

    this.connection = connection;

    if (connection) {
      this.attachConnection();
      this.handleBecameAvailable();
    }
  }

  private handleBecameAvailable() {
    for (const callback of this.availableCallbacks) {
      callback(this.connection);
    }

    this.availableCallbacks = [];
  }

  private attachConnection() {
    if (!this.connection) return;
    this.connection.on('error', this.handleError);
    this.connection.on('closed', this.handleClosed);
    this.connection.on('return', this.handleReturn);
    this.connection.on('channelRecreated', this.handleChannelRecreated);
  }

  private detachConnection() {
    if (!this.connection) return;
    this.connection.removeListener('error', this.handleError);
    this.connection.removeListener('closed', this.handleClosed);
    this.connection.removeListener('return', this.handleReturn);
    this.connection.removeListener(
      'channelRecreated',
      this.handleChannelRecreated,
    );
  }

  get() {
    return this.connection;
  }

  getWhenAvailable(): Promise<AmqpConnection> {
    if (this.connection) {
      return Promise.resolve(this.connection);
    }

    return new Promise((resolve) => this.availableCallbacks.push(resolve));
  }

  on(event: string, listener: listenerFunction) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: listenerFunction) {
    this.emitter.removeListener(event, listener);
  }

  private handleError(error: Error) {
    this.emitter.emit('error', error);
  }

  private handleClosed() {
    this.emitter.emit('closed');
  }

  private handleReturn(correlationId: string) {
    this.emitter.emit('return', correlationId);
  }

  private handleChannelRecreated() {
    this.emitter.emit('channelRecreated');
  }
}
