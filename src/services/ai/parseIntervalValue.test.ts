/**
 * Tests for Interval Value Parser
 */

import { describe, test, expect } from 'vitest';
import { parseIntervalValue, extractedInterval } from './parseIntervalValue';

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
      expect(result.censored).toBe('<');
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
      expect(result.censored).toBe('>');
    });

    test.each([
      ['<= 0,2', '<=', 0.2],
      ['≤0.2', '<=', 0.2],
      ['>= 200', '>=', 200],
      ['≥ 200', '>=', 200],
    ])('should read "%s" as %s %s', (raw, comparator, bound) => {
      expect(parseIntervalValue(raw)).toMatchObject({ value: bound, censored: comparator, isInterval: false });
    });

    test('should not call a plain number or an interval censored', () => {
      expect(parseIntervalValue('10').censored).toBeUndefined();
      expect(parseIntervalValue(10).censored).toBeUndefined();
      expect(parseIntervalValue('5-10').censored).toBeUndefined();
    });

    test.each([
      ['> 200 H', '>', 200],
      ['<10 mg/dL', '<', 10],
      ['< 1.000 UI/mL', '<', 1000],
      ['=< 5', '<=', 5],
      ['=> 5', '>=', 5],
      ['>= 5', '>=', 5],
      ['≤ 0,2', '<=', 0.2],
      ['≥3', '>=', 3],
      ['inferiore a 5', '<', 5],
      ['Inferiore a 0,5', '<', 0.5],
      ['minore di 3', '<', 3],
      ['superiore a 200', '>', 200],
      ['maggiore di 90 mL/min', '>', 90],
      ['> 1.000', '>', 1000],
      ['> 100.000 UFC/mL', '>', 100000],
      ['> 35.000', '>', 35000],
      ['< 1.000,5', '<', 1000.5],
      ['< 0.2', '<', 0.2],
      ['< 1.50', '<', 1.5],
    ] as const)('reads %o as its bound with its comparator', (raw, censored, value) => {
      const result = parseIntervalValue(raw);
      expect(result).toMatchObject({ censored, value, isInterval: false, rawValue: raw });
    });

    test('leaves a censored value whose number cannot be read missing', () => {
      const result = parseIntervalValue('< 1,2,3');
      expect(result.value).toBeNaN();
      expect(result.censored).toBeUndefined();
    });

    test('should parse "> 20" with space', () => {
      const result = parseIntervalValue('> 20');
      expect(result.isInterval).toBe(false);
      expect(result.value).toBe(20);
    });
  });

  describe('edge cases', () => {
    test.each(['', null, undefined])('leaves %o missing, with nothing printed', (raw) => {
      const result = parseIntervalValue(raw);
      expect(result.value).toBeNaN();
      expect(result.isInterval).toBe(false);
      expect(result.rawValue).toBeUndefined();
    });

    test('leaves a value it cannot read missing, never a measured 0, and keeps what was printed', () => {
      const result = parseIntervalValue('vedi nota');
      expect(result.value).toBeNaN();
      expect(result.censored).toBeUndefined();
      expect(result.rawValue).toBe('vedi nota');
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

describe('extractedInterval', () => {
  test('gives the ends of an interval value, and nothing for any other or an interval missing an end', () => {
    expect(extractedInterval({ isInterval: true, intervalLow: 5, intervalHigh: 10 })).toEqual({ low: 5, high: 10 });
    expect(extractedInterval({ isInterval: true, intervalLow: 5 })).toBeUndefined();
    expect(extractedInterval({ isInterval: false, intervalLow: 5, intervalHigh: 10 })).toBeUndefined();
  });
});
