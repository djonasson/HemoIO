import { describe, expect, it } from 'vitest';
import { toUcum } from '@services/units/ucum';
import { fixtureCatalog } from '@/test/loincFixture';
import { TEST_ADDONS, getAddon } from './addons';
import { loadCatalog } from './catalog';

const catalog = fixtureCatalog();
const ADDONS = Object.entries(TEST_ADDONS);

describe('TEST_ADDONS', () => {
  it('keeps the ranges, descriptions and units of the 106 coded dictionary tests', () => {
    expect(ADDONS).toHaveLength(106);
    expect(TEST_ADDONS['2345-7']).toMatchObject({
      referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
      canonicalUnit: 'mg/dL',
      alternativeUnits: ['mmol/L'],
    });
    expect(TEST_ADDONS['2345-7'].description).toBeTruthy();
  });

  it('keys every entry by a code in the generated catalog', async () => {
    const generated = await loadCatalog();
    const missing = ADDONS.map(([code]) => code).filter((code) => !generated.test(code));
    expect(missing).toEqual([]);
  });

  it.each(ADDONS.filter(([, addon]) => addon.referenceRange))(
    'gives %s a reference range in a UCUM unit',
    (_code, addon) => {
      expect(toUcum(addon.referenceRange!.unit)).not.toBeNull();
    }
  );

  it.each(ADDONS.filter(([, addon]) => addon.referenceRange && addon.canonicalUnit))(
    'gives %s its reference range in its standard unit',
    (_code, addon) => {
      expect(addon.referenceRange!.unit).toBe(addon.canonicalUnit);
    }
  );
});

describe('getAddon', () => {
  it("finds a code's own entry", () => {
    expect(getAddon(catalog, '2345-7')).toBe(TEST_ADDONS['2345-7']);
  });

  it('falls back to the entry of a code in the same trend group', () => {
    // 14749-6, molar glucose in serum, trends with 2345-7
    expect(getAddon(catalog, '14749-6')).toBe(TEST_ADDONS['2345-7']);
  });

  it('is undefined for a code with no entry in its group', () => {
    expect(getAddon(catalog, '2351-5')).toBeUndefined();
    expect(getAddon(catalog, '99999-9')).toBeUndefined();
  });
});
