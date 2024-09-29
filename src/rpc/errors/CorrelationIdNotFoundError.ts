import { AppError } from '../../core/errors/AppError';
import { ErrorCode, ErrorName } from '../../core/errors/types';

export class CorrelationIdNotFoundError extends AppError {
  public readonly correlationId: string;

  constructor(correlationId: string) {
    super({
      name: ErrorName.CorrelationIdNotFoundError,
      code: ErrorCode.CorrelationIdNotFound,
      message: `Correlation ID "${correlationId}" not found`,
    });

    this.correlationId = correlationId;
  }

  toJson() {
    return {
      ...super.toJson(),
      correlationId: this.correlationId,
    };
  }
}
