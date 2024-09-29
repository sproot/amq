export class MaxReconnectionAttemptsExceededError extends Error {
  constructor(performedAttempts: number) {
    super(
      `Maximum AMQP reconnection attempts has exceeded after ${performedAttempts} attempts`,
    );
  }
}
