import { UuidIdGenerator } from '../../src/UuidIdGenerator';

describe('UuidIdGenerator', () => {
  let uuidv4: jest.Mock;
  let generator: UuidIdGenerator;

  beforeEach(() => {
    uuidv4 = jest.fn();
    generator = new UuidIdGenerator(uuidv4);
  });

  describe('generate()', () => {
    it('should call uuidv4', () => {
      generator.generate();

      expect(uuidv4).toHaveBeenCalledWith();
    });

    it('should return result of uuid4', () => {
      uuidv4.mockReturnValue('fake-value');

      expect(generator.generate()).toBe('fake-value');
    });
  });
});
