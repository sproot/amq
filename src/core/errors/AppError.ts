import { AppErrorParams, ErrorCode, ErrorName } from './types';

export class AppError extends Error {
  code: string;

  constructor({ name, code, message }: AppErrorParams = {}) {
    super();

    this.name = name || ErrorName.AppError;
    this.code = code || ErrorCode.InternalError;
    this.message = message || 'Internal server error';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJson() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
    };
  }
}
