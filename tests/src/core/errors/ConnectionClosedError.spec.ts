import { ConnectionClosedError, AppError } from '../../../../src/core/errors';

describe('ConnectionClosedError', () => {
  let error: ConnectionClosedError;

  beforeEach(() => {
    error = new ConnectionClosedError();
  });

  it('should extend AppError', () => {
    expect(error).toBeInstanceOf(AppError);
  });

  it('should have properly set error fields', () => {
    expect(error.name).toBe('ConnectionClosedError');
    expect(error.code).toBe('CONNECTION_CLOSED');
    expect(error.message).toBe('Connection has closed');
  });
});
