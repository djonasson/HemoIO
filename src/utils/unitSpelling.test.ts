/**
 * Tests for unit spellings: the one form each unit is compared in
 */
import { describe, it, expect } from 'vitest';
import { isPerHundredCounted, normalizeUnitForLookup, unitsMatch } from './unitSpelling';

describe('normalizeUnitForLookup', () => {
  it.each([
    'mg/g cr',
    'mg/gcr',
    'mg/g cr.',
    'mg/gcreat',
    'mg/gcreat.',
    'mg/g creat.',
    'mg/g crea',
    'mg/g creatinine',
    'mg/g creatinina',
    'MG/G CR',
  ])('reads %s as mg/g of creatinine', (unit) => {
    expect(normalizeUnitForLookup(unit)).toBe('mg/g');
  });

  it.each([
    ['µg/gr creatinina', 'µg/g'],
    ['ug/g creat.', 'ug/g'],
    ['mcg/g Cr', 'mcg/g'],
    ['mg/g di creatinina', 'mg/g'],
    ['gr/gr creat.', 'g/g'],
    ['ng/g creatininuria', 'ng/g'],
  ])('reads %s, a creatinine ratio of another mass or with grams as "gr", as %s', (unit, normalized) => {
    expect(normalizeUnitForLookup(unit)).toBe(normalized);
  });

  it.each(['mg/mmol cr', 'mg/mmolcr', 'mg/mmolcreat.', 'mg/mmol creatinina'])(
    'reads %s as mg/mmol of creatinine',
    (unit) => {
      expect(normalizeUnitForLookup(unit)).toBe('mg/mmol');
    }
  );

  it.each([
    '/100WBC',
    '/100 WBC',
    '/ 100 WBC',
    'per 100 WBC',
    '/100 GB',
    '/100 leucociti',
    '/100 globuli bianchi',
    '/100 white blood cells',
  ])(
    'reads %s as per 100 white cells',
    (unit) => {
      expect(normalizeUnitForLookup(unit)).toBe('/100 WBC');
    }
  );

  it('leaves a unit that only starts like a creatinine ratio as it is', () => {
    expect(normalizeUnitForLookup('mg/g')).toBe('mg/g');
    expect(normalizeUnitForLookup('mg/g crystals')).toBe('mg/g crystals');
    expect(normalizeUnitForLookup('/100 HPF')).toBe('/100 HPF');
  });
});

describe('unitsMatch', () => {
  it('matches a report spelling to the dictionary unit', () => {
    expect(unitsMatch('/100WBC', '/100 WBC')).toBe(true);
    expect(unitsMatch('mg/gcr', 'mg/g')).toBe(true);
    expect(unitsMatch('mg/g cr', 'mg/mmol')).toBe(false);
  });
});

describe('isPerHundredCounted', () => {
  it.each(['/100 HPF', '/100HPF', 'per100HPF', '/100campi', '/  100 HPF', '/100\u00a0HPF', '/100 WBC', 'PER 100 HPF', '/100 (HPF)', '/100(HPF)'])(
    'reads %s as a share of 100 of a thing counted',
    (unit) => {
      expect(isPerHundredCounted(unit)).toBe(true);
    }
  );

  it.each([
    '/100 mL',
    '/100 µL',
    '/100mL',
    '/100 g',
    '/100 cL',
    '/100 L',
    '/100 G',
    '/100 cc',
    '/100cc',
    '/100 mcL',
    '/100 mm³',
    '/100mmc',
    '/100 kg',
    '/100 fL',
    '/100 mL.',
    '/100 ml (calc)',
    '/100.000',
    '/100,000',
    '/1000',
    '%',
    'mmol/L',
    '/100',
    '/100 cg',
    '/100 dg',
    '/100 ΜL',
    '/100 μl',
  ])(
    'does not read %s as one',
    (unit) => {
      expect(isPerHundredCounted(unit)).toBe(false);
    }
  );
});
