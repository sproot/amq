import { AppError } from './AppError';
import { ErrorCode, ErrorName } from './types';

export class ConnectionClosedError extends AppError {
  constructor() {
    super({
      name: ErrorName.ConnectionClosedError,
      code: ErrorCode.ConnectionClosed,
      message: 'Connection has closed',
    });
  }
}
