import { CommandHandlerValidator } from '../../../../src/rpc/rpc-server/CommandHandlerValidator';

describe('CommandHandlerValidator', () => {
  let commandHandlerValidator: CommandHandlerValidator;

  beforeEach(() => {
    commandHandlerValidator = new CommandHandlerValidator();
  });

  describe('validate()', () => {
    const context = 'fake-context';

    it('should validate value for truthiness', () => {
      const invalidValues = ['', false, 0, null, undefined];

      for (const value of invalidValues) {
        expect(() =>
          commandHandlerValidator.validate(value, context),
        ).toThrowError(`Command handler is invalid: ${value} (fake-context)`);
      }
    });

    it("should validate handler's #handle method", () => {
      const invalidHandlers = [
        {},
        { handle: null },
        { handle: true },
        { handle: 'hello world' },
        {
          get handle() {
            return 'hello world';
          },
        },
      ];

      for (const handler of invalidHandlers) {
        expect(() =>
          commandHandlerValidator.validate(handler, context),
        ).toThrowError(
          'Command handler is invalid: must have a #handle method (fake-context)',
        );
      }
    });

    it('should throw error for invalid handler types', () => {
      const invalidHandlers = ['hello world', 12345, Symbol('test'), true];

      for (const handler of invalidHandlers) {
        expect(() =>
          commandHandlerValidator.validate(handler, context),
        ).toThrowError(
          'Command handler is invalid: must be an object or a function (fake-context)',
        );
      }
    });

    it('should not throw error for valid handlers', () => {
      const validHandlers = [
        async () => true,
        async function test(name: string) {
          console.log('hello world', name);
        },
        { handle: async () => true },
        {
          handle: async function test(name: string) {
            console.log('hello world', name);
          },
        },
        {
          async handle(name: string) {
            console.log('hello world', name);
          },
        },
      ];

      for (const handler of validHandlers) {
        expect(() =>
          commandHandlerValidator.validate(handler, context),
        ).not.toThrow();
      }
    });
  });
});
