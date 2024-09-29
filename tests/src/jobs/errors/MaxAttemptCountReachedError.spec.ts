import { MaxAttemptCountReachedError } from '../../../../src/jobs/errors/MaxAttemptCountReachedError';

describe('MaxAttemptCountReachedError', () => {
  let error: MaxAttemptCountReachedError;

  beforeEach(() => {
    error = new MaxAttemptCountReachedError();
  });

  it('should extend error', () => {
    expect(error).toBeInstanceOf(Error);
  });

  it('should have "message" getter', () => {
    expect(error.message).toBe(
      'Maximum attempt count for the job has been reached',
    );
  });
});
