import { describe, it, expect } from 'vitest';
import { normalizeUnit } from '@services/units/conversion';
import {
  getBiomarkerByKey,
  getBiomarkerForTestValue,
  unknownBiomarkerKey,
  getBiomarkerDisplayName,
  BIOMARKER_DEFINITIONS,
  CATEGORY_NAMES,
  findBiomarker,
  getBiomarkersByCategory,
  searchBiomarkers,
  getCanonicalUnit,
  isValidUnit,
  matchBiomarkerName,
} from './dictionary';
import { ISSUED_BIOMARKER_KEYS } from './keys.snapshot';

describe('Biomarker Dictionary', () => {
  describe('BIOMARKER_DEFINITIONS', () => {
    it('contains all major biomarker categories', () => {
      const categories = new Set(BIOMARKER_DEFINITIONS.map((b) => b.category));

      expect(categories.has('cbc')).toBe(true);
      expect(categories.has('metabolic')).toBe(true);
      expect(categories.has('lipid')).toBe(true);
      expect(categories.has('thyroid')).toBe(true);
      expect(categories.has('iron')).toBe(true);
      expect(categories.has('vitamin')).toBe(true);
      expect(categories.has('urinalysis')).toBe(true);
    });

    it('has required fields for all biomarkers', () => {
      for (const biomarker of BIOMARKER_DEFINITIONS) {
        expect(biomarker.name).toBeTruthy();
        expect(biomarker.category).toBeTruthy();
        expect(biomarker.canonicalUnit).toBeDefined();
        expect(Array.isArray(biomarker.aliases)).toBe(true);
        expect(Array.isArray(biomarker.alternativeUnits)).toBe(true);
        expect(biomarker.description).toBeTruthy();
      }
    });

    it('contains common CBC biomarkers', () => {
      const cbcNames = getBiomarkersByCategory('cbc').map((b) => b.name);

      expect(cbcNames).toContain('White Blood Cell Count');
      expect(cbcNames).toContain('Red Blood Cell Count');
      expect(cbcNames).toContain('Hemoglobin');
      expect(cbcNames).toContain('Hematocrit');
      expect(cbcNames).toContain('Platelet Count');
      expect(cbcNames).toContain('Mean Corpuscular Volume');
    });

    it('contains common metabolic biomarkers', () => {
      const metabolicNames = getBiomarkersByCategory('metabolic').map((b) => b.name);

      expect(metabolicNames).toContain('Glucose');
      expect(metabolicNames).toContain('Creatinine');
      expect(metabolicNames).toContain('Blood Urea Nitrogen');
      expect(metabolicNames).toContain('Sodium');
      expect(metabolicNames).toContain('Potassium');
    });

    it('contains lipid panel biomarkers', () => {
      const lipidNames = getBiomarkersByCategory('lipid').map((b) => b.name);

      expect(lipidNames).toContain('Total Cholesterol');
      expect(lipidNames).toContain('LDL Cholesterol');
      expect(lipidNames).toContain('HDL Cholesterol');
      expect(lipidNames).toContain('Triglycerides');
    });
  });

  describe('CATEGORY_NAMES', () => {
    it('provides display names for all categories', () => {
      expect(CATEGORY_NAMES.cbc).toBe('Complete Blood Count');
      expect(CATEGORY_NAMES.metabolic).toBe('Metabolic Panel');
      expect(CATEGORY_NAMES.lipid).toBe('Lipid Panel');
      expect(CATEGORY_NAMES.thyroid).toBe('Thyroid Function');
      expect(CATEGORY_NAMES.iron).toBe('Iron Studies');
      expect(CATEGORY_NAMES.vitamin).toBe('Vitamins');
      expect(CATEGORY_NAMES.urinalysis).toBe('Urinalysis');
      expect(CATEGORY_NAMES.other).toBe('Other');
    });
  });

  describe('findBiomarker', () => {
    it('finds biomarker by exact name', () => {
      const glucose = findBiomarker('Glucose');
      expect(glucose).toBeDefined();
      expect(glucose?.name).toBe('Glucose');
    });

    it('finds biomarker by alias', () => {
      const wbc = findBiomarker('WBC');
      expect(wbc).toBeDefined();
      expect(wbc?.name).toBe('White Blood Cell Count');
    });

    it('is case-insensitive', () => {
      const glucose1 = findBiomarker('glucose');
      const glucose2 = findBiomarker('GLUCOSE');
      const glucose3 = findBiomarker('Glucose');

      expect(glucose1?.name).toBe('Glucose');
      expect(glucose2?.name).toBe('Glucose');
      expect(glucose3?.name).toBe('Glucose');
    });

    it('returns undefined for unknown biomarker', () => {
      const unknown = findBiomarker('Unknown Marker');
      expect(unknown).toBeUndefined();
    });

    it('trims whitespace', () => {
      const glucose = findBiomarker('  Glucose  ');
      expect(glucose?.name).toBe('Glucose');
    });
  });

  describe('getBiomarkersByCategory', () => {
    it('returns all biomarkers in a category', () => {
      const cbc = getBiomarkersByCategory('cbc');
      expect(cbc.length).toBeGreaterThan(0);
      expect(cbc.every((b) => b.category === 'cbc')).toBe(true);
    });

    it('returns empty array for category with no biomarkers', () => {
      const other = getBiomarkersByCategory('other');
      expect(Array.isArray(other)).toBe(true);
    });
  });

  describe('searchBiomarkers', () => {
    it('finds biomarkers by partial name match', () => {
      const results = searchBiomarkers('glucose');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((b) => b.name === 'Glucose')).toBe(true);
    });

    it('finds biomarkers by partial alias match', () => {
      const results = searchBiomarkers('chol');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((b) => b.name.includes('Cholesterol'))).toBe(true);
    });

    it('returns empty array for no matches', () => {
      const results = searchBiomarkers('xyz123notfound');
      expect(results).toEqual([]);
    });

    it('returns empty array for empty query', () => {
      const results = searchBiomarkers('');
      expect(results).toEqual([]);
    });

    it('is case-insensitive', () => {
      const results1 = searchBiomarkers('hemoglobin');
      const results2 = searchBiomarkers('HEMOGLOBIN');
      expect(results1.length).toBe(results2.length);
    });
  });

  describe('getCanonicalUnit', () => {
    it('returns canonical unit for a biomarker', () => {
      expect(getCanonicalUnit('Glucose')).toBe('mg/dL');
      expect(getCanonicalUnit('Hemoglobin')).toBe('g/dL');
      expect(getCanonicalUnit('TSH')).toBe('mIU/L');
    });

    it('works with aliases', () => {
      expect(getCanonicalUnit('WBC')).toBe('10^9/L');
      expect(getCanonicalUnit('Hgb')).toBe('g/dL');
    });

    it('returns undefined for unknown biomarker', () => {
      expect(getCanonicalUnit('Unknown')).toBeUndefined();
    });
  });

  describe('isValidUnit', () => {
    it('returns true for canonical unit', () => {
      expect(isValidUnit('Glucose', 'mg/dL')).toBe(true);
    });

    it('returns true for alternative unit', () => {
      expect(isValidUnit('Glucose', 'mmol/L')).toBe(true);
    });

    it('returns false for invalid unit', () => {
      expect(isValidUnit('Glucose', 'stones')).toBe(false);
    });

    it('returns false for unknown biomarker', () => {
      expect(isValidUnit('Unknown', 'mg/dL')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isValidUnit('Glucose', 'MG/DL')).toBe(true);
      expect(isValidUnit('Glucose', 'MMOL/L')).toBe(true);
    });
  });


  describe('biomarker keys', () => {
    it('gives every biomarker a unique kebab-case key', () => {
      const keys = BIOMARKER_DEFINITIONS.map((b) => b.key);
      expect(new Set(keys).size).toBe(keys.length);
      keys.forEach((key) => expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
    });

    it('keeps every issued key on the biomarker it was issued for', () => {
      // Moving or swapping keys would relabel stored data. A rename must update
      // the snapshot name in the same, reviewed change.
      ISSUED_BIOMARKER_KEYS.forEach(([key, name]) =>
        expect(getBiomarkerByKey(key)?.name, key).toBe(name)
      );
    });

    it('has every dictionary key in the issued list', () => {
      // A new biomarker must be appended to ISSUED_BIOMARKER_KEYS
      const issued = new Set(ISSUED_BIOMARKER_KEYS.map(([key]) => key));
      BIOMARKER_DEFINITIONS.forEach((b) => expect(issued.has(b.key), b.key).toBe(true));
    });

    it('looks up a biomarker by key', () => {
      expect(getBiomarkerByKey('glucose')?.name).toBe('Glucose');
      expect(getBiomarkerByKey('no-such-key')).toBeUndefined();
    });

    it('names a test value by its dictionary entry, else its extracted text', () => {
      expect(getBiomarkerDisplayName({ biomarkerKey: 'glucose', rawText: 'GLU' })).toBe('Glucose');
      expect(getBiomarkerDisplayName({ biomarkerKey: 'unknown:zorb', rawText: 'Zorb' })).toBe('Zorb');
      expect(getBiomarkerDisplayName({ biomarkerKey: 'unknown:zorb', rawText: '' })).toBe(
        'Unknown biomarker'
      );
    });

    it('builds stable keys for unknown biomarkers', () => {
      expect(unknownBiomarkerKey('Zorblatin')).toBe('unknown:zorblatin');
      expect(unknownBiomarkerKey('  Zorb-latin (serum) ')).toBe('unknown:zorblatinserum');
    });

    it('keeps percentage and absolute-count variants apart', () => {
      // e.g. "IG%" vs "IG#"
      expect(unknownBiomarkerKey('IG%')).not.toBe(unknownBiomarkerKey('IG#'));
      expect(unknownBiomarkerKey('IG%')).toBe('unknown:ig%');
      expect(unknownBiomarkerKey('IG#')).toBe('unknown:ig#');
    });

    it('gives the same key to the same name in different Unicode forms', () => {
      const composed = 'Glicemia à digiuno'.normalize('NFC');
      const decomposed = 'Glicemia à digiuno'.normalize('NFD');
      expect(unknownBiomarkerKey(decomposed)).toBe(unknownBiomarkerKey(composed));
    });

    it('keeps combining marks that distinguish names', () => {
      // Devanagari vowel signs are combining marks; dropping them merges names
      expect(unknownBiomarkerKey('रक्त')).not.toBe(unknownBiomarkerKey('रकत'));
    });

    it('never builds an empty unknown key', () => {
      expect(unknownBiomarkerKey('—')).toBe('unknown:unnamed');
      expect(unknownBiomarkerKey('')).toBe('unknown:unnamed');
      // Non-Latin names keep their letters
      expect(unknownBiomarkerKey('血糖')).toBe('unknown:血糖');
    });

    it('identifies a stored value by its key before its extracted text', () => {
      expect(
        getBiomarkerForTestValue({ biomarkerKey: 'hemoglobin', rawText: 'Hemo-globin' })?.name
      ).toBe('Hemoglobin');
      expect(
        getBiomarkerForTestValue({ biomarkerKey: 'unknown:bloodsugar', rawText: 'Blood Sugar' })?.name
      ).toBe('Glucose');
      expect(
        getBiomarkerForTestValue({ biomarkerKey: 'unknown:zorblatin', rawText: 'Zorblatin' })
      ).toBeUndefined();
    });
  });
});

describe('matchBiomarkerName with a qualifier', () => {
  const keyOf = (name: string) => matchBiomarkerName(name)?.key;

  it('matches the specimen a qualifier names', () => {
    expect(keyOf('Creatinina (urine, per litro)')).toBe('urine-creatinine');
    expect(keyOf('Creatinina (urine, spot)')).toBe('urine-creatinine');
    expect(keyOf('Creatinina (urine, 24h)')).toBe('24-hour-urine-creatinine');
    expect(keyOf('Urea (urine, per litro)')).toBe('urine-urea');
    expect(keyOf('Urea (urine, 24 ore)')).toBe('24-hour-urine-urea');
    expect(keyOf('Albumina/creatinina (urine)')).toBe('albumin-creatinine-ratio');
  });

  it('never falls back to the blood test for a urine qualifier', () => {
    expect(keyOf('Bilirubina diretta (urine, spot)')).toBeUndefined();
  });

  it('ignores a qualifier that names no specimen', () => {
    expect(keyOf('Vitamina D (25-OH, totale)')).toBe('vitamin-d');
  });
});

describe('Italian names', () => {
  it.each([
    ['Urea', 'urea'],
    ['Acido urico', 'uric-acid'],
    ['Ferro', 'serum-iron'],
    ['Vitamina D (25-OH)', 'vitamin-d'],
    ['Eritroblasti', 'nucleated-red-blood-cells'],
    ['Eritroblasti (%)', 'nucleated-red-blood-cells-percentage'],
    ['Reticolociti', 'reticulocytes'],
    ['Reticolociti (%)', 'reticulocytes-percentage'],
    ['Reticulocytes (%)', 'reticulocytes-percentage'],
    // A 24-hour urine collection: its concentration and its amount per day
    ['Creatinina/L (urine 24h)', 'urine-creatinine'],
    ['Creatinina 24h (urine)', '24-hour-urine-creatinine'],
    ['Urea/L (urine 24h)', 'urine-urea'],
    ['Urea 24h (urine)', '24-hour-urine-urea'],
    // As the report itself prints them, under its timed urine collections
    ['Creatinina/L (urine)', 'urine-creatinine'],
    ['Urea/L (urine)', 'urine-urea'],
    ['U-Creatinina/L', 'urine-creatinine'],
    ['Densità Relativa (urine)', 'urine-specific-gravity'],
    ['U-Urea/L', 'urine-urea'],
    ['U-Proteine totali/L', 'urine-protein'],
    ['Emoglobina (urine)', 'urine-blood'],
    ['Eritrociti (urine)', 'urine-red-blood-cells'],
  ])('%s is %s', (name, key) => {
    expect(matchBiomarkerName(name)?.key).toBe(key);
  });

  it('does not take urea for blood urea nitrogen, a different measurement', () => {
    expect(findBiomarker('BUN')?.key).toBe('blood-urea-nitrogen');
    expect(findBiomarker('Urea')?.key).toBe('urea');
  });
});


describe('units each test lists', () => {
  it('lists each unit once, not again in another spelling', () => {
    const repeated = BIOMARKER_DEFINITIONS.flatMap((definition) => {
      const units = [definition.canonicalUnit, ...(definition.alternativeUnits ?? [])]
        .filter(Boolean)
        .map((unit) => normalizeUnit(unit).toLowerCase());
      return units.length === new Set(units).size ? [] : [definition.key];
    });
    expect(repeated).toEqual([]);
  });
});
