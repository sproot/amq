export enum ErrorCode {
  InternalError = 'INTERNAL_ERROR',
  UnknownCommand = 'UNKNOWN_COMMAND',
  ConnectionClosed = 'CONNECTION_CLOSED',
  CorrelationIdNotFound = 'CORRELATION_ID_NOT_FOUND',
  CommandInterrupted = 'COMMAND_INTERRUPTED',
  CommandTimedOut = 'COMMAND_TIMED_OUT',
  CommandCancelled = 'COMMAND_CANCELLED',
  CommandDismissed = 'COMMAND_DISMISSED',
}

export enum ErrorName {
  AppError = 'AppError',
  UnknownCommandError = 'UnknownCommandError',
  ConnectionClosedError = 'ConnectionClosedError',
  CorrelationIdNotFoundError = 'CorrelationIdNotFoundError',
  CommandError = 'CommandError',
}

export type AppErrorParams = {
  name?: ErrorName;
  code?: ErrorCode;
  message?: string;
  stack?: string;
};
