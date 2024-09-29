/**
 * Unhandled command errors should cause the application to crash.
 * Instead, they're being serialized and sent to the sender.
 */

import { AppError } from '../../core/errors/AppError';

export interface ErrorData {
  message: string;
  name: string;
  stack?: string;
  code?: string;
}

export class ErrorSerializer {
  serialize(error: any) {
    if (!(error instanceof Error)) {
      return error;
    }

    const serializedData: ErrorData = {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };

    if (error instanceof AppError) {
      serializedData.code = error.code;
    }

    return serializedData;
  }

  deserialize(data: any) {
    if (!data) {
      return data;
    }

    const error: ErrorData = new Error(data.message);
    error.name = data.name;
    error.stack = data.stack;
    error.code = data.code;

    return error;
  }
}
