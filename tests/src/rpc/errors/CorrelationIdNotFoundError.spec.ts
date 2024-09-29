import {
  AppError,
  CorrelationIdNotFoundError,
} from '../../../../src/rpc/errors';

describe('CorrelationIdNotFoundError', () => {
  it('should have proper message', () => {
    const error = new CorrelationIdNotFoundError('fake-correlation-id');

    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe(
      'Correlation ID "fake-correlation-id" not found',
    );
    expect(error.name).toBe('CorrelationIdNotFoundError');
    expect(error.code).toBe('CORRELATION_ID_NOT_FOUND');
    expect(error.correlationId).toBe('fake-correlation-id');

    expect(error.toJson()).toEqual({
      name: 'CorrelationIdNotFoundError',
      code: 'CORRELATION_ID_NOT_FOUND',
      message: 'Correlation ID "fake-correlation-id" not found',
      correlationId: 'fake-correlation-id',
    });
  });
});
