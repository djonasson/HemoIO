import { describe, expect, it } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { createCatalog, type CatalogTest } from './catalog';
import {
  loincTestLabel,
  sampleLabel,
  standardRange,
  testAddon,
  testDescription,
  testDisplayName,
  testKey,
  testName,
  testUnits,
  trendCode,
  unitOptions,
} from './display';
import { unknownBiomarkerKey } from './keys';

const catalog = fixtureCatalog();

/** A catalog of these tests, all in one LOINC group joining their samples */
function oneGroup(tests: Array<Pick<CatalogTest, 'code' | 'name' | 'system' | 'rank'> & Partial<CatalogTest>>) {
  const group = { id: 'LG-T1', parentId: 'LG-P', parentName: 'Sample types', name: 'Made up|Pt|ANYBldSerPl' };
  return createCatalog({
    version: 'test',
    groups: [group],
    tests: tests.map((test) => ({
      shortName: '',
      component: 'Made up',
      property: 'SCnc',
      scale: 'Qn',
      method: '',
      classCode: 'CHEM',
      names: [],
      units: [],
      groups: [group.id],
      ...test,
    })),
  });
}

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

describe('testAddon', () => {
  // 2162-6 is HemoIO's 24-hour urine creatinine; the others are made up
  const urine = oneGroup([
    { code: '2162-6', name: 'Creatinine [Mass/time] in 24 hour Urine', system: 'Urine', rank: 50, property: 'MRat' },
    { code: '90002-1', name: 'Creatinine [Mass/time] in 12 hour Urine', system: 'Urine', rank: 900, property: 'MRat' },
    { code: '90003-9', name: 'Creatinine [Mass/time] in Urine collected for unspecified duration', system: 'Urine', rank: 950, property: 'MRat' },
    { code: '90004-7', name: 'Creatinine [Moles/time] in 24 hour Urine', system: 'Urine', rank: 990, property: 'SRat' },
  ]);

  it('lends a 24-hour test its add-on only to codes collected over the same time', () => {
    expect(testAddon(urine, '90004-7')).toBe(testAddon(urine, '2162-6'));
    expect(testAddon(urine, '90002-1')).toBeUndefined();
    expect(testAddon(urine, '90003-9')).toBeUndefined();
  });

  it("so a 12-hour or unspecified collection keeps LOINC's name and units", () => {
    expect(testDisplayName(urine, { biomarkerKey: '90002-1' })).toBe(
      'Creatinine [Mass/time] in 12 hour Urine'
    );
    expect(testDescription(urine, '90003-9')).toBeUndefined();
    expect(unitOptions(urine, '90002-1')).toEqual([]);
    expect(testDisplayName(urine, { biomarkerKey: '90004-7' })).toBe('24-Hour Urine Creatinine');
  });
});

describe('trendCode and testKey', () => {
  it('names a line of arterial and venous codes after blood in general, when the group has it', () => {
    const blood = oneGroup([
      { code: '90010-4', name: 'Potassium in Venous blood', system: 'BldV', rank: 250 },
      { code: '90011-2', name: 'Potassium in Arterial blood', system: 'BldA', rank: 300 },
      { code: '90012-0', name: 'Potassium in Blood', system: 'Bld', rank: 2000 },
    ]);
    expect(trendCode(blood, '90011-2')).toBe('90012-0');
    expect(trendCode(blood, '90010-4')).toBe('90012-0');
  });

  it('takes the most common code when every code is of one site of blood', () => {
    const sites = oneGroup([
      { code: '90010-4', name: 'Potassium in Venous blood', system: 'BldV', rank: 250 },
      { code: '90011-2', name: 'Potassium in Arterial blood', system: 'BldA', rank: 300 },
    ]);
    expect(trendCode(sites, '90011-2')).toBe('90010-4');
  });

  it("keeps a test's own under its LOINC group, whichever code it is shown under", () => {
    const group = catalog.trendGroup('2345-7');
    expect(testKey(catalog, '2345-7')).toBe(group);
    expect(testKey(catalog, '14749-6')).toBe(group);
    // A test key leads back to the code the test is shown under
    expect(trendCode(catalog, group)).toBe('2345-7');
    expect(testKey(catalog, 'unknown:zorblatina')).toBe('unknown:zorblatina');
  });
});

describe('testName', () => {
  it("drops the mass or molar property from LOINC's short name of a test of both", () => {
    const lactate = oneGroup([
      { code: '90020-3', name: 'Lactate [Moles/volume] in Blood', shortName: 'Lactate Bld-sCnc', system: 'Bld', rank: 300 },
      { code: '90021-1', name: 'Lactate [Mass/volume] in Blood', shortName: 'Lactate Bld-mCnc', system: 'Bld', rank: 700, property: 'MCnc' },
    ]);
    expect(testName(lactate, '90021-1')).toBe('Lactate Bld');
    // A value keeps its own code's name
    expect(testDisplayName(lactate, { biomarkerKey: '90021-1' })).toBe('Lactate Bld-mCnc');
  });

  it("keeps HemoIO's name, a test of one property's name, and a printed name", () => {
    expect(testName(catalog, '14749-6')).toBe('Glucose');
    const one = oneGroup([{ code: '90020-3', name: 'Lactate [Moles/volume] in Blood', shortName: 'Lactate Bld-sCnc', system: 'Bld', rank: 300 }]);
    expect(testName(one, '90020-3')).toBe('Lactate Bld-sCnc');
    expect(testName(catalog, 'unknown:zorblatina', 'Zorblatina')).toBe('Zorblatina');
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
