import { describe, expect, it } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import {
  loincTestLabel,
  sampleLabel,
  standardRange,
  testDescription,
  testDisplayName,
  testUnits,
  trendCode,
} from './display';
import { unknownBiomarkerKey } from './keys';

const catalog = fixtureCatalog();

describe('testDisplayName', () => {
  it('prefers the add-on short name, then the LOINC short name', () => {
    expect(testDisplayName(catalog, { biomarkerKey: '2345-7', rawText: 'Glicemia' })).toBe('Glucose');
    // Molar glucose has no add-on of its own: it shares its trend group's
    expect(testDisplayName(catalog, { biomarkerKey: '14749-6' })).toBe('Glucose');
    // Blood glucose has no add-on at all
    expect(testDisplayName(catalog, { biomarkerKey: '2339-0', rawText: 'Glucosio' })).toBe(
      'Glucose Bld-mCnc'
    );
  });

  it('shows the printed name for an unknown: key', () => {
    const key = unknownBiomarkerKey('Zorblatina');
    expect(testDisplayName(catalog, { biomarkerKey: key, rawText: 'Zorblatina' })).toBe('Zorblatina');
    expect(testDisplayName(catalog, { biomarkerKey: key })).toBe('Unknown test');
  });
});

describe('testDescription', () => {
  it("gives HemoIO's description, also to the codes of its trend group", () => {
    expect(testDescription(catalog, '2345-7')).toMatch(/sugar/i);
    expect(testDescription(catalog, '14749-6')).toBe(testDescription(catalog, '2345-7'));
    expect(testDescription(catalog, '2339-0')).toBeUndefined();
  });
});

describe('standardRange', () => {
  it("gives a code's own range", () => {
    expect(standardRange(catalog, '2345-7')).toEqual({ low: 70, high: 100, unit: 'mg/dL' });
  });

  it('never gives an inherited range in a unit the code is not reported in', () => {
    // 14749-6 is glucose in mmol/L: the mg/dL range is not one to read its values against
    expect(standardRange(catalog, '14749-6')).toBeUndefined();
    expect(standardRange(catalog, '2339-0')).toBeUndefined();
  });
});

describe('trendCode', () => {
  it('keeps a trend group under the code HemoIO describes', () => {
    expect(trendCode(catalog, '14749-6')).toBe('2345-7');
    expect(trendCode(catalog, '2345-7')).toBe('2345-7');
  });

  it('keeps a code alone in its group, and a key outside the catalog, as they are', () => {
    expect(trendCode(catalog, '2339-0')).toBe('2339-0');
    expect(trendCode(catalog, 'unknown:zorblatina')).toBe('unknown:zorblatina');
  });
});

describe('testUnits', () => {
  it("gives a code its group's units, converted as the code's own substance", () => {
    const units = testUnits(catalog, '14749-6');
    expect(units?.canonicalUnit).toBe('mg/dL');
    expect(units?.alternativeUnits).toContain('mmol/L');
    expect(units?.substance.code).toBe('14749-6');
  });

  it('is undefined for a code HemoIO has no unit for', () => {
    expect(testUnits(catalog, '2339-0')).toBeUndefined();
  });
});

describe('sampleLabel', () => {
  it('names the LOINC system, and a 24-hour urine collection as such', () => {
    expect(sampleLabel(catalog.test('2345-7')!)).toBe('Serum/Plasma');
    expect(sampleLabel(catalog.test('718-7')!)).toBe('Whole Blood');
    expect(sampleLabel(catalog.test('2350-7')!)).toBe('Urine');
    expect(sampleLabel(catalog.test('2351-5')!)).toBe('24h Urine');
  });
});

describe('loincTestLabel', () => {
  it('shows the code with its LOINC long name', () => {
    const test = catalog.test('2345-7')!;
    expect(loincTestLabel(test)).toBe(`LOINC 2345-7: ${test.name}`);
  });
});
