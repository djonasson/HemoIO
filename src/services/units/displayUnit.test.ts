import { describe, it, expect } from 'vitest';
import {
  convertForDisplay,
  preferredUnitFor,
  preferredUnitOptions,
  resolveDisplayUnit,
} from './displayUnit';

const GLUCOSE = { name: 'Glucose', canonicalUnit: 'mg/dL', alternativeUnits: ['mmol/L'] };

describe('preferredUnitOptions', () => {
  it('lists the standard unit first, then the units it converts to', () => {
    expect(preferredUnitOptions(GLUCOSE)).toEqual(['mg/dL', 'mmol/L']);
  });

  it('leaves out alternatives the standard unit cannot be converted to', () => {
    expect(preferredUnitOptions({ ...GLUCOSE, alternativeUnits: ['mmol/L', 'stones'] })).toEqual([
      'mg/dL',
      'mmol/L',
    ]);
  });

  it('offers only the standard unit when there are no alternatives', () => {
    expect(preferredUnitOptions({ name: 'Glucose', canonicalUnit: 'mg/dL' })).toEqual(['mg/dL']);
  });
});

describe('preferredUnitFor and resolveDisplayUnit', () => {
  it('uses an offered preference', () => {
    expect(preferredUnitFor(GLUCOSE, 'mmol/L')).toBe('mmol/L');
    expect(resolveDisplayUnit(GLUCOSE, 'mmol/L')).toBe('mmol/L');
  });

  it('uses a stored preference spelled another way, as the offered unit', () => {
    const creatinine = { name: 'Creatinine', canonicalUnit: 'mg/dL', alternativeUnits: ['µmol/L'] };
    expect(preferredUnitFor(creatinine, 'umol/L')).toBe('µmol/L');
  });

  it('ignores a stored preference the biomarker does not offer', () => {
    expect(preferredUnitFor(GLUCOSE, 'stones')).toBeUndefined();
    expect(resolveDisplayUnit(GLUCOSE, 'stones')).toBe('mg/dL');
  });

  it('falls back to the standard unit without a preference', () => {
    expect(preferredUnitFor(GLUCOSE, undefined)).toBeUndefined();
    expect(resolveDisplayUnit(GLUCOSE, undefined)).toBe('mg/dL');
  });

  it('has no display unit for a biomarker outside the dictionary', () => {
    expect(resolveDisplayUnit(undefined, 'mmol/L')).toBeUndefined();
  });
});

describe('convertForDisplay', () => {
  const value = {
    id: 7,
    value: 100,
    unit: 'mg/dL',
    referenceRangeLow: 70,
    referenceRangeHigh: 100,
  };

  it('converts the value and its range, keeping other fields', () => {
    expect(convertForDisplay('Glucose', value, 'mmol/L')).toEqual({
      id: 7,
      value: 5.55,
      unit: 'mmol/L',
      referenceRangeLow: expect.closeTo(3.89, 1),
      referenceRangeHigh: 5.55,
    });
  });

  it('returns the value unchanged without a target unit', () => {
    expect(convertForDisplay('Glucose', value, undefined)).toBe(value);
  });

  it('keeps a value that is not a plain number as recorded', () => {
    const positive = { value: true, unit: '' };
    expect(convertForDisplay('Glucose', positive, 'mmol/L')).toBe(positive);
    const interval = { ...value, numericValueType: 'interval' };
    expect(convertForDisplay('Glucose', interval, 'mmol/L')).toBe(interval);
  });

  it('keeps a value whose unit cannot be converted', () => {
    const odd = { value: 2, unit: '/HPF' };
    expect(convertForDisplay('Glucose', odd, 'mmol/L')).toEqual(odd);
  });
});

describe('convertForDisplay through the standard unit', () => {
  it('converts a value recorded in one alternative unit to another', () => {
    // Hemoglobin has mmol/L ↔ g/dL and g/dL ↔ g/L, but no mmol/L ↔ g/L pair
    const recorded = { value: 8.5, unit: 'mmol/L', referenceRangeLow: 7.4, referenceRangeHigh: 9.9 };
    const shown = convertForDisplay('Hemoglobin', recorded, 'g/L');
    expect(shown.unit).toBe('g/L');
    expect(shown.value).toBeCloseTo(136.9, 0);
    expect(shown.referenceRangeLow).toBeCloseTo(119.2, 0);
  });
});
