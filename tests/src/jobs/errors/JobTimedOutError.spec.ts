import { JobTimedOutError } from '../../../../src/jobs/errors/JobTimedOutError';

describe('JobTimedOutError', () => {
  let error: JobTimedOutError;

  beforeEach(() => {
    error = new JobTimedOutError();
  });

  it('should extend error', () => {
    expect(error).toBeInstanceOf(Error);
  });

  it('should have "message" getter', () => {
    expect(error.message).toBe('Job handler timed out');
  });
});
