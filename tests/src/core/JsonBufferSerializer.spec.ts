import { JsonBufferSerializer } from '../../../src/core/JsonBufferSerializer';

describe('JsonBufferSerializer', () => {
  const JSON_OBJECT = {
    number: 123,
    boolean: true,
    string: 'hello world',
    nullValue: null,
    array: [123, 'hello world', false, null],
    nestedObject: {
      number: 123,
      boolean: true,
      string: 'hello world',
      naughtyStrings: [
        '𝓣𝓱𝓮 𝓺𝓾𝓲𝓬𝓴 𝓫𝓻𝓸𝔀𝓷 𝓯𝓸𝔁 𝓳𝓾𝓶𝓹𝓼 𝓸𝓿𝓮𝓻 𝓽𝓱𝓮 𝓵𝓪𝔃𝔂 𝓭𝓸𝓰',
        '🐵 🙈 🙉 🙊',
      ],
      nullValue: null,
      array: [123, 'hello world', false, null],
    },
  };

  let serializer: JsonBufferSerializer;

  beforeEach(() => {
    serializer = new JsonBufferSerializer();
  });

  describe('serialize()', () => {
    it('should serialize JSON object', () => {
      expect(serializer.serialize(JSON_OBJECT)).toEqual(
        Buffer.from(JSON.stringify(JSON_OBJECT)),
      );
    });
  });

  describe('deserialize()', () => {
    it('should deserialize JSON object', () => {
      expect(serializer.deserialize(serializer.serialize(JSON_OBJECT))).toEqual(
        JSON_OBJECT,
      );
    });
  });
});
