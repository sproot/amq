import { ObjectUtil } from '../../../src/utils/ObjectUtil';

describe('ObjectUtil', () => {
  describe('static removeBlankFields()', () => {
    let sampleObject: Record<string, unknown>;

    beforeEach(() => {
      sampleObject = {
        val1: 0,
        val2: '',
        val3: Buffer.from('stub'),
        val4: {
          sub1: 1,
          sub2: 'hey',
          sub3: {
            sub31: null,
            sub32: undefined,
            sub33: {},
          },
          sub4: undefined,
        },
        val5: undefined,
        val6: null,
        val7: {
          sub5: undefined,
          sub6: null,
        },
        val8: {},
      };
    });

    it('should perform non-deep removing without touching empty fields by default', () => {
      expect(ObjectUtil.removeBlankFields(sampleObject)).toEqual({
        val1: 0,
        val2: '',
        val3: Buffer.from('stub'),
        val4: {
          sub1: 1,
          sub2: 'hey',
          sub3: {
            sub31: null,
            sub32: undefined,
            sub33: {},
          },
          sub4: undefined,
        },
        val6: null,
        val7: {
          sub5: undefined,
          sub6: null,
        },
        val8: {},
      });
    });

    it('should perform deep removing when specified', () => {
      expect(
        ObjectUtil.removeBlankFields(sampleObject, { deep: true }),
      ).toEqual({
        val1: 0,
        val2: '',
        val3: Buffer.from('stub'),
        val4: {
          sub1: 1,
          sub2: 'hey',
          sub3: {
            sub31: null,
            sub33: {},
          },
        },
        val6: null,
        val7: {
          sub6: null,
        },
        val8: {},
      });
    });

    it('should remove empty objects when specified (deep: false)', () => {
      expect(
        ObjectUtil.removeBlankFields(sampleObject, {
          removeEmptyObjects: true,
        }),
      ).toEqual({
        val1: 0,
        val2: '',
        val3: Buffer.from('stub'),
        val4: {
          sub1: 1,
          sub2: 'hey',
          sub3: {
            sub31: null,
            sub33: {},
          },
          sub4: undefined,
        },
        val6: null,
        val7: {
          sub5: undefined,
          sub6: null,
        },
      });
    });

    it('should remove empty objects after deep removing when both are specified', () => {
      expect(
        ObjectUtil.removeBlankFields(sampleObject, {
          deep: true,
          removeEmptyObjects: true,
        }),
      ).toEqual({
        val1: 0,
        val2: '',
        val3: Buffer.from('stub'),
        val4: {
          sub1: 1,
          sub2: 'hey',
          sub3: {
            sub31: null,
          },
        },
        val6: null,
        val7: {
          sub6: null,
        },
      });
    });

    it('should remove null values when specified (deep: false)', () => {
      expect(
        ObjectUtil.removeBlankFields(sampleObject, {
          deep: false,
          removeNullValues: true,
        }),
      ).toEqual({
        val1: 0,
        val2: '',
        val3: Buffer.from('stub'),
        val4: {
          sub1: 1,
          sub2: 'hey',
          sub3: {
            sub31: null,
            sub32: undefined,
            sub33: {},
          },
          sub4: undefined,
        },
        val7: {
          sub5: undefined,
          sub6: null,
        },
        val8: {},
      });
    });

    it('should remove null values when specified (deep: true)', () => {
      expect(
        ObjectUtil.removeBlankFields(sampleObject, {
          deep: true,
          removeNullValues: true,
        }),
      ).toEqual({
        val1: 0,
        val2: '',
        val3: Buffer.from('stub'),
        val4: {
          sub1: 1,
          sub2: 'hey',
          sub3: {
            sub33: {},
          },
        },
        val7: {},
        val8: {},
      });
    });
  });

  describe('static isPlainObject()', () => {
    // Write tests here

    it('should return true when the object is a plain javascript object', () => {
      expect(ObjectUtil.isPlainObject({ hello: 'world' })).toBe(true);
    });

    it('should return false for different invalid cases', () => {
      const invalidValues = [
        1,
        'hello',
        true,
        null,
        undefined,
        Symbol('hello'),
        () => {},
        new Date(),
        /hello/,
        Buffer.from('hello'),
        BigInt(1),
      ];

      for (const value of invalidValues) {
        // @ts-ignore: Ignore for testing purposes
        expect(ObjectUtil.isPlainObject(value)).toBe(false);
      }
    });

    it('should return false for class instance', () => {
      class ClassMock {}
      // @ts-ignore: Ignore for testing purposes
      expect(ObjectUtil.isPlainObject(new ClassMock())).toBe(false);
    });

    it('should return true for object created using new Object()', () => {
      // @ts-ignore: Ignore for testing purposes
      expect(ObjectUtil.isPlainObject(new Object())).toBe(true);
    });

    it('should return true for object with null prototype', () => {
      expect(ObjectUtil.isPlainObject(Object.create(null))).toBe(true);
    });
  });
});
