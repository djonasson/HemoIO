import { describe, it, expect } from 'vitest';
import { errorText } from './errorText';

describe('errorText', () => {
  it("gives an error's name and message, never its stack", () => {
    const error = new TypeError('x is undefined');
    expect(errorText(error)).toBe('TypeError: x is undefined');
  });

  it('gives the name alone of an error with no message, and anything else as text', () => {
    expect(errorText(new RangeError())).toBe('RangeError');
    expect(errorText('boom')).toBe('boom');
  });
});
