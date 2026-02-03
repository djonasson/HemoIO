/**
 * Tests for Interval Value Parser
 */

import { describe, test, expect } from 'vitest';
import { parseIntervalValue, formatIntervalValue } from './parseIntervalValue';

describe('parseIntervalValue', () => {
  describe('single numeric values', () => {
    test('should parse integer value', () => {
      const result = parseIntervalValue(42);
      expect(result.value).toBe(42);
      expect(result.isInterval).toBe(false);
      expect(result.intervalLow).toBeUndefined();
      expect(result.intervalHigh).toBeUndefined();
    });

    test('should parse decimal value', () => {
      const result = parseIntervalValue(3.14);
      expect(result.value).toBe(3.14);
      expect(result.isInterval).toBe(false);
    });

    test('should parse string number', () => {
      const result = parseIntervalValue('100');
      expect(result.value).toBe(100);
      expect(result.isInterval).toBe(false);
    });

    test('should handle European decimal notation', () => {
      const result = parseIntervalValue('3,14');
      expect(result.value).toBeCloseTo(3.14, 2);
      expect(result.isInterval).toBe(false);
    });
  });

  describe('interval values', () => {
    test('should parse hyphen-separated interval', () => {
      const result = parseIntervalValue('5-10');
      expect(result.isInterval).toBe(true);
      expect(result.intervalLow).toBe(5);
      expect(result.intervalHigh).toBe(10);
      expect(result.value).toBe(7.5); // midpoint
      expect(result.rawValue).toBe('5-10');
    });

    test('should parse interval with spaces around hyphen', () => {
      const result = parseIntervalValue('5 - 10');
      expect(result.isInterval).toBe(true);
      expect(result.intervalLow).toBe(5);
      expect(result.intervalHigh).toBe(10);
      expect(result.value).toBe(7.5);
    });

    test('should parse interval with en-dash', () => {
      const result = parseIntervalValue('5–10');
      expect(result.isInterval).toBe(true);
      expect(result.intervalLow).toBe(5);
      expect(result.intervalHigh).toBe(10);
    });

    test('should parse interval with em-dash', () => {
      const result = parseIntervalValue('5—10');
      expect(result.isInterval).toBe(true);
      expect(result.intervalLow).toBe(5);
      expect(result.intervalHigh).toBe(10);
    });

    test('should parse interval with "to"', () => {
      const result = parseIntervalValue('5 to 10');
      expect(result.isInterval).toBe(true);
      expect(result.intervalLow).toBe(5);
      expect(result.intervalHigh).toBe(10);
    });

    test('should parse interval with Italian "a"', () => {
      const result = parseIntervalValue('5 a 10');
      expect(result.isInterval).toBe(true);
      expect(result.intervalLow).toBe(5);
      expect(result.intervalHigh).toBe(10);
    });

    test('should parse interval with decimals', () => {
      const result = parseIntervalValue('1.5-3.5');
      expect(result.isInterval).toBe(true);
      expect(result.intervalLow).toBe(1.5);
      expect(result.intervalHigh).toBe(3.5);
      expect(result.value).toBe(2.5);
    });

    test('should parse interval with European decimals', () => {
      const result = parseIntervalValue('1,5-3,5');
      expect(result.isInterval).toBe(true);
      expect(result.intervalLow).toBe(1.5);
      expect(result.intervalHigh).toBe(3.5);
    });
  });

  describe('less than notation (dipstick below detection)', () => {
    // "< X" values from dipstick tests mean "below detection threshold"
    // They are NOT intervals - we use the threshold value and preserve rawValue

    test('should parse "<5" as threshold value 5', () => {
      const result = parseIntervalValue('<5');
      expect(result.isInterval).toBe(false);
      expect(result.value).toBe(5);
      expect(result.rawValue).toBe('<5');
    });

    test('should parse "< 10" with space as threshold value 10', () => {
      const result = parseIntervalValue('< 10');
      expect(result.isInterval).toBe(false);
      expect(result.value).toBe(10);
      expect(result.rawValue).toBe('< 10');
    });

    test('should parse "< 0.2" with decimal as threshold value', () => {
      const result = parseIntervalValue('< 0.2');
      expect(result.isInterval).toBe(false);
      expect(result.value).toBeCloseTo(0.2, 2);
      expect(result.rawValue).toBe('< 0.2');
    });
  });

  describe('greater than notation', () => {
    test('should parse ">10" as single value', () => {
      const result = parseIntervalValue('>10');
      expect(result.isInterval).toBe(false);
      expect(result.value).toBe(10);
      expect(result.rawValue).toBe('>10');
    });

    test('should parse "> 20" with space', () => {
      const result = parseIntervalValue('> 20');
      expect(result.isInterval).toBe(false);
      expect(result.value).toBe(20);
    });
  });

  describe('edge cases', () => {
    test('should handle empty string', () => {
      const result = parseIntervalValue('');
      expect(result.value).toBe(0);
      expect(result.isInterval).toBe(false);
    });

    test('should handle non-numeric string', () => {
      const result = parseIntervalValue('negative');
      expect(result.value).toBe(0);
      expect(result.isInterval).toBe(false);
      expect(result.rawValue).toBe('negative');
    });

    test('should handle null', () => {
      const result = parseIntervalValue(null);
      expect(result.value).toBe(0);
      expect(result.isInterval).toBe(false);
    });

    test('should handle undefined', () => {
      const result = parseIntervalValue(undefined);
      expect(result.value).toBe(0);
      expect(result.isInterval).toBe(false);
    });

    test('should handle zero', () => {
      const result = parseIntervalValue(0);
      expect(result.value).toBe(0);
      expect(result.isInterval).toBe(false);
    });

    test('should handle interval starting at zero', () => {
      const result = parseIntervalValue('0-5');
      expect(result.isInterval).toBe(true);
      expect(result.intervalLow).toBe(0);
      expect(result.intervalHigh).toBe(5);
      expect(result.value).toBe(2.5);
    });
  });
});

describe('formatIntervalValue', () => {
  test('should format interval without unit', () => {
    expect(formatIntervalValue(5, 10)).toBe('5-10');
  });

  test('should format interval with unit', () => {
    expect(formatIntervalValue(5, 10, 'eritrociti per campo')).toBe('5-10 eritrociti per campo');
  });

  test('should format decimal interval', () => {
    expect(formatIntervalValue(1.5, 3.5, 'cells')).toBe('1.5-3.5 cells');
  });
});
