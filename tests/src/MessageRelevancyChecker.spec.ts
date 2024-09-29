import { MessageRelevancyChecker } from '../../src/MessageRelevancyChecker';

describe('MessageRelevancyChecker', () => {
  let messageRelevancyChecker: MessageRelevancyChecker;

  beforeEach(() => {
    messageRelevancyChecker = new MessageRelevancyChecker();
  });

  describe('lock()', () => {
    const correlationId = 'fake-correlation-id';
    const deliveryTag = 123456;
    const newDeliveryTag = 612543;

    it('should store delivery tag of the message', () => {
      expect(
        messageRelevancyChecker.lock(correlationId, deliveryTag),
      ).toBeTrue();

      expect(messageRelevancyChecker.getDeliveryTag(correlationId)).toBe(
        deliveryTag,
      );
    });

    it("should replace delivery tag with new one when message it's locked", () => {
      messageRelevancyChecker.lock(correlationId, deliveryTag);

      expect(
        messageRelevancyChecker.lock(correlationId, newDeliveryTag),
      ).toBeFalse();

      expect(messageRelevancyChecker.getDeliveryTag(correlationId)).toBe(
        newDeliveryTag,
      );
    });

    it('should store when deleted (by unlock() call)', () => {
      messageRelevancyChecker.lock(correlationId, deliveryTag);
      messageRelevancyChecker.unlock(correlationId);

      expect(
        messageRelevancyChecker.lock(correlationId, newDeliveryTag),
      ).toBeTrue();

      expect(messageRelevancyChecker.getDeliveryTag(correlationId)).toBe(
        newDeliveryTag,
      );
    });

    it('should store when deleted (by unlockAll() call)', () => {
      messageRelevancyChecker.lock(correlationId, deliveryTag);
      messageRelevancyChecker.unlockAll();

      expect(
        messageRelevancyChecker.lock(correlationId, newDeliveryTag),
      ).toBeTrue();

      expect(messageRelevancyChecker.getDeliveryTag(correlationId)).toBe(
        newDeliveryTag,
      );
    });
  });

  describe('getDeliveryTag()', () => {
    const correlationId = 'fake-correlation-id';
    const deliveryTag = 123456;

    it('should return null when not stored', () => {
      expect(
        messageRelevancyChecker.getDeliveryTag('fake-correlation-id'),
      ).toBeNull();
    });

    it('should return null when deleted (by unlock() call)', () => {
      messageRelevancyChecker.lock(correlationId, deliveryTag);

      messageRelevancyChecker.unlock(correlationId);

      expect(
        messageRelevancyChecker.getDeliveryTag('fake-correlation-id'),
      ).toBeNull();
    });

    it('should return null when deleted (by unlockAll() call)', () => {
      messageRelevancyChecker.lock(correlationId, deliveryTag);

      messageRelevancyChecker.unlockAll();

      expect(
        messageRelevancyChecker.getDeliveryTag('fake-correlation-id'),
      ).toBeNull();
    });
  });

  describe('unlock()', () => {
    it('should only affect one message', () => {
      messageRelevancyChecker.lock('id-1', 1001);
      messageRelevancyChecker.lock('id-2', 1002);

      messageRelevancyChecker.unlock('id-1');

      expect(messageRelevancyChecker.getDeliveryTag('id-1')).toBeNull();
      expect(messageRelevancyChecker.getDeliveryTag('id-2')).toBe(1002);

      messageRelevancyChecker.unlock('id-2');

      expect(messageRelevancyChecker.getDeliveryTag('id-1')).toBeNull();
      expect(messageRelevancyChecker.getDeliveryTag('id-2')).toBeNull();
    });
  });

  describe('unlockAll()', () => {
    it('should affect all messages', () => {
      messageRelevancyChecker.lock('id-1', 1001);
      messageRelevancyChecker.lock('id-2', 1002);

      messageRelevancyChecker.unlockAll();

      expect(messageRelevancyChecker.getDeliveryTag('id-1')).toBeNull();
      expect(messageRelevancyChecker.getDeliveryTag('id-2')).toBeNull();
    });
  });
});
