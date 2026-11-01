/**
 * Tests for unit spellings: the one form each unit is compared in
 */
import { describe, it, expect } from 'vitest';
import { normalizeUnitForLookup, unitsMatch } from './unitSpelling';

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
