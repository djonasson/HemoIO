import { describe, expect, it } from 'vitest';
import { withParsedValue } from './withParsedValue';

describe('withParsedValue', () => {
  it('reads a number with its unit and the lab mark', () => {
    expect(withParsedValue({ value: 12.5, flag: 'H' }, 'mg/dL')).toMatchObject({
      value: 12.5,
      unit: 'mg/dL',
      labFlag: 'high',
      isInterval: false,
    });
  });

  it('reads an interval with its ends and as printed', () => {
    expect(withParsedValue({ value: '5-10' }, 'per campo')).toMatchObject({
      value: 7.5,
      unit: 'per campo',
      isInterval: true,
      intervalLow: 5,
      intervalHigh: 10,
      rawValue: '5-10',
    });
  });

  it('reads a censored value with its comparator', () => {
    expect(withParsedValue({ value: '< 10' }, 'U/L')).toMatchObject({ value: 10, censored: '<', unit: 'U/L' });
  });

  it('blanks the unit of a qualitative result, which has none', () => {
    const read = withParsedValue({ value: 0, qualitativeValue: 'Assenti' }, 'mg/dL');
    expect(read.unit).toBe('');
    expect(read.qualitative).toEqual({ text: 'Assenti', kind: 'boolean', value: 0 });
  });

  it('keeps a measured number and its unit beside a word', () => {
    expect(withParsedValue({ value: 0.05, qualitativeValue: 'Negativo' }, 'S/CO')).toMatchObject({
      value: 0.05,
      unit: 'S/CO',
      qualitative: undefined,
    });
  });

  it('leaves a value it cannot read missing, with what was printed', () => {
    const read = withParsedValue({ value: 'vedi nota' }, 'mg/dL');
    expect(read.value).toBeNaN();
    expect(read.rawValue).toBe('vedi nota');
  });
});
