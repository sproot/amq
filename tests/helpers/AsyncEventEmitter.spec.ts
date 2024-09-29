import { AsyncEventEmitter } from './AsyncEventEmitter';

describe('AsyncEventEmitter', () => {
  let asyncEventEmitter: AsyncEventEmitter;

  beforeEach(() => {
    asyncEventEmitter = new AsyncEventEmitter();
  });

  describe('emit()', () => {
    it('should throw errors synchronously', () => {
      const error = new Error('Fake error');

      asyncEventEmitter.on('fakeEvent', () => {
        throw error;
      });

      expect(() => asyncEventEmitter.emit('fakeEvent')).toThrow(error);
    });

    it('should throw error when "error" is emitted without listeners', () => {
      const error = new Error('Fake error');

      expect(() => asyncEventEmitter.emit('error', error)).toThrow(error);

      const listener = () => {};
      asyncEventEmitter.on('error', listener);
      asyncEventEmitter.removeListener('error', listener);

      expect(() => asyncEventEmitter.emit('error', error)).toThrow(error);
    });

    it('should not throw error when "error" is emitted with listeners', () => {
      asyncEventEmitter.on('error', () => {});

      expect(() =>
        asyncEventEmitter.emit('error', new Error('Fake error')),
      ).not.toThrow();
    });
  });

  describe('emitAsync()', () => {
    it('should throw errors asynchronously', async () => {
      const error = new Error('Fake error');

      asyncEventEmitter.on('fakeEvent', () => {
        throw error;
      });

      await expect(asyncEventEmitter.emitAsync('fakeEvent')).rejects.toThrow(
        error,
      );
    });

    it('should throw error when "error" is emitted without listeners', async () => {
      const error = new Error('Fake error');

      await expect(asyncEventEmitter.emitAsync('error', error)).rejects.toThrow(
        error,
      );

      const listener = () => {};
      asyncEventEmitter.on('error', listener);
      asyncEventEmitter.removeListener('error', listener);

      await expect(asyncEventEmitter.emitAsync('error', error)).rejects.toThrow(
        error,
      );
    });

    it('should not throw error when "error" is emitted with listeners', async () => {
      asyncEventEmitter.on('error', () => {});

      await expect(
        asyncEventEmitter.emitAsync('error', new Error('Fake error')),
      ).resolves.toBe(undefined);
    });
  });

  describe('on()', () => {
    it('should subscribe to event (sync)', () => {
      const event = 'fakeEvent';
      const args = [123, true, 'hello world'];

      const spy = jest.fn();

      asyncEventEmitter.on(event, spy);
      asyncEventEmitter.emit(event, ...args);

      expect(spy).toHaveBeenCalledTimes(1);

      asyncEventEmitter.emit(event, ...args);

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith(...args);
    });

    it('should subscribe to event (async)', async () => {
      const event = 'fakeEvent';
      const args = [123, true, 'hello world'];

      const { spy, promiseStates } = createAsyncEventSpy();

      asyncEventEmitter.on(event, spy);
      await asyncEventEmitter.emit(event, ...args);

      expect(spy).toHaveBeenCalledTimes(1);

      const promise = Promise.all([
        asyncEventEmitter.emit(event, ...args),
        asyncEventEmitter.emit(event, ...args),
      ]);

      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy).toHaveBeenCalledWith(...args);

      await promise;

      expect(promiseStates.every((state) => state === 'resolved')).toBe(true);
    });
  });

  describe('once()', () => {
    it('should subscribe to event once (sync)', () => {
      const event = 'fakeEvent';
      const args = [123, true, 'hello world'];

      const spy = jest.fn();

      asyncEventEmitter.once(event, spy);
      asyncEventEmitter.emit(event, ...args);

      expect(spy).toHaveBeenCalledTimes(1);

      asyncEventEmitter.emit(event, ...args);

      expect(spy).toHaveBeenCalledWith(...args);
    });

    it('should subscribe to event once (async)', async () => {
      const event = 'fakeEvent';
      const args = [123, true, 'hello world'];

      const { spy, promiseStates } = createAsyncEventSpy();

      asyncEventEmitter.once(event, spy);
      await asyncEventEmitter.emit(event, ...args);

      expect(spy).toHaveBeenCalledTimes(1);

      const promise = Promise.all([
        asyncEventEmitter.emit(event, ...args),
        asyncEventEmitter.emit(event, ...args),
      ]);

      expect(spy).toHaveBeenCalledWith(...args);

      await promise;

      expect(promiseStates.every((state) => state === 'resolved')).toBe(true);
    });

    it('should not interfere with on() listener', () => {
      const event = 'fakeEvent';
      const spy1 = jest.fn();
      const spy2 = jest.fn();

      asyncEventEmitter.once(event, () => {
        spy1();
        asyncEventEmitter.on(event, spy2);
      });

      asyncEventEmitter.emit(event);
      asyncEventEmitter.emit(event);

      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeListener()', () => {
    it('should remove event listener', () => {
      const event1 = 'fakeEvent1';
      const event2 = 'fakeEvent2';
      const args = [123, true, 'hello world'];

      const spy1 = jest.fn();
      const spy2 = jest.fn();
      const spy3 = jest.fn();

      asyncEventEmitter.on(event1, spy1);
      asyncEventEmitter.on(event1, spy2);
      asyncEventEmitter.on(event2, spy3);

      asyncEventEmitter.removeListener(event1, spy2);

      asyncEventEmitter.emit(event1, ...args);
      asyncEventEmitter.emit(event2);

      expect(spy1).toHaveBeenCalledWith(...args);
      expect(spy2).not.toHaveBeenCalled();
      expect(spy3).toHaveBeenCalledWith(); // no arguments
    });
  });

  describe('removeAllListeners()', () => {
    it('should remove all listeners for specific event', () => {
      const event1 = 'fakeEvent1';
      const event2 = 'fakeEvent2';
      const args = [123, true, 'hello world'];

      const spy1 = jest.fn();
      const spy2 = jest.fn();
      const spy3 = jest.fn();

      asyncEventEmitter.on(event1, spy1);
      asyncEventEmitter.on(event1, spy2);
      asyncEventEmitter.on(event2, spy3);

      asyncEventEmitter.removeAllListeners(event1);

      asyncEventEmitter.emit(event1, ...args);
      asyncEventEmitter.emit(event2);

      expect(spy1).not.toHaveBeenCalled();
      expect(spy2).not.toHaveBeenCalled();
      expect(spy3).toHaveBeenCalledWith(); // no arguments
    });

    it('should remove all listeners', () => {
      const event1 = 'fakeEvent1';
      const event2 = 'fakeEvent2';
      const args = [123, true, 'hello world'];

      const spy1 = jest.fn();
      const spy2 = jest.fn();
      const spy3 = jest.fn();

      asyncEventEmitter.on(event1, spy1);
      asyncEventEmitter.on(event1, spy2);
      asyncEventEmitter.on(event2, spy3);

      asyncEventEmitter.removeAllListeners();

      asyncEventEmitter.emit(event1, ...args);
      asyncEventEmitter.emit(event2);

      expect(spy1).not.toHaveBeenCalled();
      expect(spy2).not.toHaveBeenCalled();
      expect(spy3).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount()', () => {
    it('should return number of listeners for specific event', () => {
      const event1 = 'fakeEvent1';
      const event2 = 'fakeEvent2';

      const spy1 = jest.fn();
      const spy2 = jest.fn();

      asyncEventEmitter.on(event1, spy1);
      asyncEventEmitter.on(event1, spy2);
      asyncEventEmitter.on(event2, spy1);

      expect(asyncEventEmitter.listenerCount(event1)).toBe(2);
      expect(asyncEventEmitter.listenerCount(event2)).toBe(1);
    });
  });
});

function createAsyncEventSpy(state = 'resolved') {
  const promiseStates: (boolean | string)[] = [];

  const spy = jest.fn(() => {
    return new Promise<void>((resolve) => {
      const index = promiseStates.length;
      promiseStates[index] = false;

      setTimeout(() => {
        promiseStates[index] = state;
        resolve();
      }, 0);
    });
  });

  return { promiseStates, spy };
}
