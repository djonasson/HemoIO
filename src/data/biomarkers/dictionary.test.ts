import { describe, it, expect } from 'vitest';
import {
  BIOMARKER_DEFINITIONS,
  CATEGORY_NAMES,
  findBiomarker,
  getBiomarkersByCategory,
  searchBiomarkers,
  getCanonicalUnit,
  isValidUnit,
} from './dictionary';

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
});
