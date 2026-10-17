import { toErrorMessage } from './error.util';

describe('toErrorMessage', () => {
  it('extracts message from standard Error instances', () => {
    expect(toErrorMessage(new Error('something broke'))).toBe(
      'something broke',
    );
    expect(toErrorMessage(new TypeError('type mismatch'))).toBe(
      'type mismatch',
    );
  });

  it('falls back to default fallback if Error.message is empty', () => {
    expect(toErrorMessage(new Error(''))).toBe('unknown error');
    expect(toErrorMessage(new Error(''), 'custom fallback')).toBe(
      'custom fallback',
    );
  });

  it('returns non-empty strings directly', () => {
    expect(toErrorMessage('network timeout')).toBe('network timeout');
  });

  it('falls back if string is empty or whitespace only', () => {
    expect(toErrorMessage('')).toBe('unknown error');
    expect(toErrorMessage('   ')).toBe('unknown error');
  });

  it('extracts message from objects with a string message property', () => {
    expect(toErrorMessage({ message: 'rpc error' })).toBe('rpc error');
    expect(
      toErrorMessage({
        message: 'nested reason',
        status: 500,
      }),
    ).toBe('nested reason');
  });

  it('falls back if object message is empty or non-string', () => {
    expect(toErrorMessage({ message: '' })).toBe('unknown error');
    expect(toErrorMessage({ message: 123 })).toBe('unknown error');
    expect(toErrorMessage({})).toBe('unknown error');
  });

  it('handles primitive values like numbers', () => {
    expect(toErrorMessage(404)).toBe('404');
  });

  it('handles null and undefined with fallback', () => {
    expect(toErrorMessage(null)).toBe('unknown error');
    expect(toErrorMessage(undefined)).toBe('unknown error');
    expect(toErrorMessage(null, 'default msg')).toBe('default msg');
    expect(toErrorMessage(undefined, 'default msg')).toBe('default msg');
  });
});
