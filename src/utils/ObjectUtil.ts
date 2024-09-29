export class ObjectUtil {
  static removeBlankFields<T extends Record<string, unknown>>(
    object: T,
    options: {
      deep?: boolean;
      removeEmptyObjects?: boolean;
      removeNullValues?: boolean;
    } = {},
  ): Partial<T> {
    const {
      deep = false,
      removeEmptyObjects = false,
      removeNullValues = false,
    } = options;

    for (const key of Object.keys(object)) {
      if (
        object[key] === undefined ||
        (removeNullValues && object[key] === null)
      ) {
        delete object[key];
      } else if (
        ObjectUtil.isPlainObject(object[key] as Record<string, unknown>)
      ) {
        if (deep) {
          ObjectUtil.removeBlankFields(
            object[key] as Record<string, unknown>,
            options,
          );
        }

        if (
          removeEmptyObjects &&
          Object.keys(object[key] as Record<string, unknown>).length === 0
        ) {
          delete object[key];
        }
      }
    }

    return object;
  }

  /**
   * Returns true when the object is a plain javascript object like `{ hello: 'world' }`
   *   and not an instance of a class.
   */
  static isPlainObject(object: Record<string, unknown>): boolean {
    if (typeof object == 'object' && object !== null) {
      if (typeof Object.getPrototypeOf == 'function') {
        const proto = Object.getPrototypeOf(object);
        return proto === Object.prototype || proto === null;
      }

      return Object.prototype.toString.call(object) === '[object Object]';
    }

    return false;
  }
}
