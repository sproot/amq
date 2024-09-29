import { serialize } from 'v8';
import { AppError } from '../../../../src/core/errors/AppError';
import { ErrorCode, ErrorName } from '../../../../src/core/errors/types';
import {
  ErrorData,
  ErrorSerializer,
} from '../../../../src/rpc/errors/ErrorSerializer';

describe('ErrorSerializer', () => {
  let errorSerializer: ErrorSerializer;

  beforeEach(() => {
    errorSerializer = new ErrorSerializer();
  });

  describe('serialize()', () => {
    it("should return the object when it's not an Error instances", () => {
      class FakeClass {}

      const inputs = [
        undefined,
        null,
        false,
        '',
        'hello world',
        { hello: 'world' },
        123,
        new FakeClass(),
      ];

      for (const input of inputs) {
        expect(errorSerializer.serialize(input)).toBe(input);
      }
    });

    it('should serialize Error instances', () => {
      const message = 'Fake error message';
      const name = 'FakeErrorName';
      const stack = 'fake error stack';

      const error: ErrorData = new Error(message);
      error.name = name;
      error.stack = stack;

      expect(errorSerializer.serialize(error)).toEqual({
        message,
        name,
        stack,
      });
    });

    it('should serialize instances of classes that are inherited from Error', () => {
      class MyError extends Error {
        constructor() {
          super('hello world');
          this.name = 'MyErrorName';
          this.stack = 'fake error stack';
        }

        get code() {
          return 'fake code';
        }
      }

      expect(errorSerializer.serialize(new MyError())).toEqual({
        message: 'hello world',
        name: 'MyErrorName',
        stack: 'fake error stack',
      });
    });

    it('should serialize AppError instances', () => {
      const message = 'Fake error message';

      const error: ErrorData = new AppError({
        code: ErrorCode.InternalError,
        name: ErrorName.AppError,
        message,
      });

      expect(errorSerializer.serialize(error)).toEqual({
        code: ErrorCode.InternalError,
        name: ErrorName.AppError,
        message,
        stack: expect.any(String),
      });
    });
  });

  describe('deserialize()', () => {
    it('should not deserialize falsy data', () => {
      const inputs = [undefined, null, '', false, 0];

      for (const input of inputs) {
        expect(errorSerializer.deserialize(input)).toBe(input);
      }
    });

    it('should deserialize error', () => {
      const message = 'Fake error message';
      const name = 'FakeErrorName';
      const stack = 'fake error stack';
      const code = 'FAKE_ERROR_CODE';

      const error = errorSerializer.deserialize({
        message,
        name,
        stack,
        code,
      });

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe(message);
      expect(error.stack).toBe(stack);
      expect(error.code).toBe(code);
      expect(error.name).toBe(name);
    });
  });
});
