export class JobTimedOutError extends Error {
  constructor() {
    super('Job handler timed out');
  }
}
