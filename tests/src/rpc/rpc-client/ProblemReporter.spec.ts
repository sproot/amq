import 'jest-extended';
import { ProblemReporter } from '../../../../src/rpc/rpc-client/ProblemReporter';

describe('ProblemReporter', () => {
  let problemReporter: ProblemReporter;

  beforeEach(() => {
    problemReporter = new ProblemReporter();
  });

  describe('reportStaleCommand()', () => {
    let staleCommandEventSpy: jest.Mock;

    const durationMs = 1460;
    const hasTimedOut = false;
    const queue = 'fake-queue';
    const commandName = 'fake-command-name';
    const args = [123, 'hello world', true, { hey: 'there' }];

    beforeEach(() => {
      staleCommandEventSpy = jest.fn();
      problemReporter.on('staleCommand', staleCommandEventSpy);
    });

    it('should emit "staleCommand" event', () => {
      problemReporter.reportStaleCommand({
        durationMs,
        hasTimedOut,
        queue,
        commandName,
        args,
      });

      expect(staleCommandEventSpy).toHaveBeenCalledExactlyOnceWith({
        durationMs,
        hasTimedOut,
        queue,
        commandName,
        args,
      });
    });

    it('should not emit "staleCommand" event when unsubscribed', () => {
      problemReporter.removeListener('staleCommand', staleCommandEventSpy);

      problemReporter.reportStaleCommand({
        durationMs,
        hasTimedOut,
        queue,
        commandName,
        args,
      });

      expect(staleCommandEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('reportAcknowledgeError()', () => {
    let acknowledgeErrorEventSpy: jest.Mock;

    const error = new Error('Fake error');
    const queue = 'fake-queue';
    const commandName = 'fake-command-name';
    const args = [123, 'hello world', true, { hey: 'there' }];

    beforeEach(() => {
      acknowledgeErrorEventSpy = jest.fn();
      problemReporter.on('acknowledgeError', acknowledgeErrorEventSpy);
    });

    it('should emit "acknowledgeError" event', () => {
      problemReporter.reportAcknowledgeError({
        error,
        queue,
        commandName,
        args,
      });

      expect(acknowledgeErrorEventSpy).toHaveBeenCalledExactlyOnceWith({
        error,
        queue,
        commandName,
        args,
      });
    });

    it('should not emit "acknowledgeError" event when unsubscribed', () => {
      problemReporter.removeListener(
        'acknowledgeError',
        acknowledgeErrorEventSpy,
      );

      problemReporter.reportAcknowledgeError({
        error,
        queue,
        commandName,
        args,
      });

      expect(acknowledgeErrorEventSpy).not.toHaveBeenCalled();
    });
  });
});
