import { describe, it, expect } from 'vitest';
import { errorDetails, errorText } from './errorText';

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

describe('errorDetails', () => {
  function failed(stack: string): Error {
    const error = new TypeError('d is not a function');
    error.stack = stack;
    return error;
  }

  it('gives the message, the code locations of a Chrome stack, and the browser', () => {
    const error = failed(
      'TypeError: d is not a function\n' +
        '    at Ab (https://example.org/HemoIO/assets/index-2udo5Teb.js:12:3456)\n' +
        '    at https://example.org/HemoIO/assets/vendor-react-BDvSRYl5.js:1:99'
    );
    expect(errorDetails(error)).toBe(
      'TypeError: d is not a function\n' +
        'Where:\n' +
        'at Ab (https://example.org/HemoIO/assets/index-2udo5Teb.js:12:3456)\n' +
        'at https://example.org/HemoIO/assets/vendor-react-BDvSRYl5.js:1:99\n' +
        `Browser: ${navigator.userAgent}`
    );
  });

  it('reads a Firefox or Safari stack', () => {
    const error = failed('Ab@https://example.org/HemoIO/assets/index-2udo5Teb.js:12:3456\n@https://example.org/a.js:1:2');
    expect(errorDetails(error)).toContain(
      'Where:\nAb@https://example.org/HemoIO/assets/index-2udo5Teb.js:12:3456\n@https://example.org/a.js:1:2\n'
    );
  });

  it('keeps only code locations: a message line with values in it stays out', () => {
    const error = failed('TypeError: Glucose 95 at 12:30:45 mg/dL\n    at Ab (https://example.org/a.js:1:2)\nGlucose 95');
    expect(errorDetails(error).split('\n').slice(1, 3)).toEqual(['Where:', 'at Ab (https://example.org/a.js:1:2)']);
    expect(errorDetails(error)).not.toContain('Glucose');
  });

  it('says where is unknown with no stack, or for something not an error', () => {
    expect(errorDetails(failed(''))).toContain('Where:\nunknown\n');
    expect(errorDetails('boom')).toBe(`boom\nWhere:\nunknown\nBrowser: ${navigator.userAgent}`);
  });
});
