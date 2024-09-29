export class MaxAttemptCountReachedError extends Error {
  constructor() {
    super('Maximum attempt count for the job has been reached');
  }
}
