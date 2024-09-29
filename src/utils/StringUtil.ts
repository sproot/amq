export class StringUtil {
  /**
   * Substitute variables in a string.
   * @param {string} string - The string to substitute variables in.
   * @param {object} variables - The variables to substitute.
   * @returns {string} The substituted string.
   * @example
   * StringUtil.substitute('Hello {name}! I am {age} years old.', { name: 'World', age: 25 });
   * // => 'Hello World! I am 25 years old.'
   * **/
  static substitute(string: string, variables: { [x: string]: any } = {}) {
    let result = string;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{\\s*${key}\\s*}`, 'g');
      result = result.replace(regex, value);
    }

    return result;
  }
}
