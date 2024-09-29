import { AppError } from '../../../../src/core/errors/AppError';
import { ErrorCode, ErrorName } from '../../../../src/core/errors/types';

describe('AppError', () => {
  let error: AppError;

  beforeEach(() => {
    error = new AppError();
  });

  it('should be instance of Error and AppError', () => {
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });

  it('should create a default error', () => {
    const error = new AppError();
    expect(error.name).toBe(ErrorName.AppError);
    expect(error.code).toBe(ErrorCode.InternalError);
    expect(error.message).toBe('Internal server error');
    expect(error.toJson()).toEqual({
      name: ErrorName.AppError,
      code: ErrorCode.InternalError,
      message: 'Internal server error',
    });
  });

  it('should create a custom error', () => {
    const customName = ErrorName.UnknownCommandError;
    const customCode = ErrorCode.UnknownCommand;
    const customMessage = 'Something went wrong';
    const error = new AppError({
      name: customName,
      code: customCode,
      message: customMessage,
    });
    expect(error.name).toBe(customName);
    expect(error.code).toBe(customCode);
    expect(error.message).toBe(customMessage);
    expect(error.toJson()).toEqual({
      name: customName,
      code: customCode,
      message: customMessage,
    });
  });

  it('should capture the stack trace', () => {
    const error = new AppError();
    expect(error.stack).toBeDefined();
  });

  it('should have correct name', () => {
    expect(error.name).toBe('AppError');
  });

  it('should have correct code', () => {
    expect(error.code).toBe('INTERNAL_ERROR');
  });

  it('should allow using custom message', () => {
    const error = new AppError({ message: 'My custom message' });

    expect(error.message).toBe('My custom message');
  });
});
