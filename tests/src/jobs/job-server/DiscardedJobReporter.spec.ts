import { DiscardedJobReporter } from '../../../../src/jobs/job-server/DiscardedJobReporter';

describe('DiscardedJobReporter', () => {
  let discardedJobReporter: DiscardedJobReporter;

  beforeEach(() => {
    discardedJobReporter = new DiscardedJobReporter();
  });

  describe('report()', () => {
    let discardedJobEventSpy: jest.Mock;

    const job = 'fake-job';
    const data = { fake: 'data' };
    const attempt = 146;
    const reason = new Error('Fake error');

    beforeEach(() => {
      discardedJobEventSpy = jest.fn();
      discardedJobReporter.on('jobDiscarded', discardedJobEventSpy);
    });

    it('should emit "jobDiscarded" event', () => {
      discardedJobReporter.report({ job, data, attempt, reason });

      expect(discardedJobEventSpy).toHaveBeenCalledTimes(1);
      expect(discardedJobEventSpy).toHaveBeenCalledWith({
        job,
        data,
        attempt,
        reason,
      });
    });

    it('should not emit "jobDiscarded" event when unsubscribed', () => {
      discardedJobReporter.removeListener('jobDiscarded', discardedJobEventSpy);

      discardedJobReporter.report({ job, data, attempt, reason });

      expect(discardedJobEventSpy).not.toHaveBeenCalled();
    });
  });
});
