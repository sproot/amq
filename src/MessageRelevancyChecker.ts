/**
 * Sometimes RabbitMQ can send the message again, for example when connection or channel
 *   has been closed while handling a message (before acknowledging it).
 * We can't completely prevent "unknown delivery tag" error, but we can make it appear less often.
 * In order to do that, we store delivery tag for each message (identified by correlation ID).
 * When delivery tag for a message has changed, it would mean that RabbitMQ has sent that message to the system again.
 * When delivery tag for a message has been deleted, it would mean that connection or channel has been closed.
 *
 * Basically it's a simple locking mechanism.
 */
export class MessageRelevancyChecker {
  private readonly correlationIds: Map<string, number> = new Map();

  lock(correlationId: string, deliveryTag: number) {
    const isLocked = this.correlationIds.has(correlationId);
    this.correlationIds.set(correlationId, deliveryTag);
    return !isLocked;
  }

  getDeliveryTag(correlationId: string) {
    return this.correlationIds.get(correlationId) || null;
  }

  unlock(correlationId: string) {
    this.correlationIds.delete(correlationId);
  }

  unlockAll() {
    this.correlationIds.clear();
  }
}
