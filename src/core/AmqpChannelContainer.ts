import EventEmitter from 'events';
import type { ConfirmChannel } from 'amqplib';
type callbackFunction = (...args: any) => void;
type listenerFunction = (...args: any) => void;

/**
 * Useful for wrapping channel's events such as "error" and "close".
 * When channel is set or replaced, its events are being automatically redirected.
 * You can get current channel instance by using `container.get()`.
 *
 * @emits AmqpChannelContainer#error
 * @emits AmqpChannelContainer#close
 * @emits AmqpChannelContainer#return
 */
export class AmqpChannelContainer {
  private readonly emitter = new EventEmitter().on('error', () => {}); // ignore unhandled "error" events
  private availableCallbacks: callbackFunction[] = [];
  private channel: ConfirmChannel | null = null;

  constructor() {
    this.handleClose = this.handleClose.bind(this);
    this.handleError = this.handleError.bind(this);
    this.handleReturn = this.handleReturn.bind(this);
  }

  set(channel: ConfirmChannel | null) {
    this.detachChannel();

    this.channel = channel;

    if (channel) {
      this.attachChannel();
      this.handleBecameAvailable();
    }
  }

  get() {
    return this.channel;
  }

  getWhenAvailable(): Promise<ConfirmChannel> {
    if (this.channel) {
      return Promise.resolve(this.channel);
    }

    return new Promise((resolve) => this.availableCallbacks.push(resolve));
  }

  on(event: string, listener: listenerFunction) {
    this.emitter.on(event, listener);
  }

  removeListener(event: string, listener: listenerFunction) {
    this.emitter.removeListener(event, listener);
  }

  private handleBecameAvailable() {
    for (const callback of this.availableCallbacks) {
      callback(this.channel);
    }

    this.availableCallbacks = [];
  }

  private attachChannel() {
    if (!this.channel) return;
    this.channel.on('error', this.handleError);
    this.channel.on('close', this.handleClose);
    this.channel.on('return', this.handleReturn);
  }

  private detachChannel() {
    if (!this.channel) return;
    this.channel.removeListener('error', this.handleError);
    this.channel.removeListener('close', this.handleClose);
    this.channel.removeListener('return', this.handleReturn);
  }

  private handleClose() {
    this.emitter.emit('close');
  }

  private handleError(error: Error) {
    this.emitter.emit('error', error);
  }

  private handleReturn(correlationId: string) {
    this.emitter.emit('return', correlationId);
  }
}
