import { StringUtil } from '../../../src/utils/StringUtil';

describe('StringUtil', () => {
  describe('static substitute()', () => {
    it('does nothing with a general string', () => {
      expect(StringUtil.substitute('this is just a string')).toEqual(
        'this is just a string',
      );
    });

    it('substitutes parameter to a pattern', () => {
      expect(
        StringUtil.substitute('Hello, {world}!', { world: 'World' }),
      ).toEqual('Hello, World!');
    });

    it('substitutes more then one parameter', () => {
      expect(
        StringUtil.substitute('{hello}, {world}!', {
          hello: 'Hello',
          world: 'World',
        }),
      ).toEqual('Hello, World!');
    });

    it('allows spaces between brackets in the patterns', () => {
      expect(
        StringUtil.substitute('{ hello   }, { world  }!', {
          hello: 'Hello',
          world: 'World',
        }),
      ).toEqual('Hello, World!');
    });

    it('does nothing with template if there was no such parameter passed', () => {
      expect(
        StringUtil.substitute('{hello}, {world}!', { world: 'World' }),
      ).toEqual('{hello}, World!');
    });

    it('substitutes well if placeholder appears more then once', () => {
      expect(
        StringUtil.substitute('{duck} {duck} {go}! {duck} {duck} {go}!', {
          duck: 'goose',
          go: 'run',
        }),
      ).toEqual('goose goose run! goose goose run!');
    });

    it('substitutes pattern-like variables well', () => {
      expect(
        StringUtil.substitute('{hello}, {world}!', {
          hello: '{hi}',
          world: '{there}',
        }),
      ).toEqual('{hi}, {there}!');
    });
  });
});
