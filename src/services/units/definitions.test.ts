import { describe, it, expect } from 'vitest';
import {
  UNIT_CONVERSIONS,
  findConversionDefinition,
  getConversionFactor,
} from './definitions';

describe('Unit Conversion Definitions', () => {
  describe('UNIT_CONVERSIONS', () => {
    it('contains glucose conversions', () => {
      const glucose = UNIT_CONVERSIONS.find((c) => c.biomarker === 'Glucose');
      expect(glucose).toBeDefined();
      expect(glucose?.conversions).toContainEqual(
        expect.objectContaining({ from: 'mg/dL', to: 'mmol/L' })
      );
    });

    it('contains creatinine conversions', () => {
      const creatinine = UNIT_CONVERSIONS.find((c) => c.biomarker === 'Creatinine');
      expect(creatinine).toBeDefined();
      expect(creatinine?.conversions).toContainEqual(
        expect.objectContaining({ from: 'mg/dL', to: 'µmol/L' })
      );
    });

    it('contains hemoglobin conversions', () => {
      const hemoglobin = UNIT_CONVERSIONS.find((c) => c.biomarker === 'Hemoglobin');
      expect(hemoglobin).toBeDefined();
      expect(hemoglobin?.conversions).toContainEqual(
        expect.objectContaining({ from: 'g/dL', to: 'g/L' })
      );
    });

    it('contains urine creatinine conversions', () => {
      const urineCreatinine = UNIT_CONVERSIONS.find((c) => c.biomarker === 'Urine Creatinine');
      expect(urineCreatinine).toBeDefined();
      expect(urineCreatinine?.aliases).toContain('U-Creatinina');
    });

    it('contains protein/creatinine ratio conversions', () => {
      const ratio = UNIT_CONVERSIONS.find((c) => c.biomarker === 'Protein Creatinine Ratio');
      expect(ratio).toBeDefined();
      expect(ratio?.aliases).toContain('U-Proteine/Creatinina');
    });

    it('all conversions have valid factor', () => {
      for (const def of UNIT_CONVERSIONS) {
        for (const conv of def.conversions) {
          expect(typeof conv.factor).toBe('number');
          expect(conv.factor).toBeGreaterThan(0);
          expect(Number.isFinite(conv.factor)).toBe(true);
        }
      }
    });
  });

  describe('findConversionDefinition', () => {
    it('finds by exact biomarker name', () => {
      const result = findConversionDefinition('Glucose');
      expect(result).toBeDefined();
      expect(result?.biomarker).toBe('Glucose');
    });

    it('finds by case-insensitive name', () => {
      const result = findConversionDefinition('glucose');
      expect(result).toBeDefined();
      expect(result?.biomarker).toBe('Glucose');
    });

    it('finds by alias', () => {
      const result = findConversionDefinition('Blood Sugar');
      expect(result).toBeDefined();
      expect(result?.biomarker).toBe('Glucose');
    });

    it('finds by Italian alias via biomarker dictionary', () => {
      const result = findConversionDefinition('P-Creatinina (metodo enzimatico)');
      expect(result).toBeDefined();
      expect(result?.biomarker).toBe('Creatinine');
    });

    it('finds urine creatinine by Italian alias', () => {
      const result = findConversionDefinition('U-Creatinina');
      expect(result).toBeDefined();
      expect(result?.biomarker).toBe('Urine Creatinine');
    });

    it('returns undefined for unknown biomarker', () => {
      const result = findConversionDefinition('Unknown Biomarker XYZ');
      expect(result).toBeUndefined();
    });

    it('trims whitespace from biomarker name', () => {
      const result = findConversionDefinition('  Glucose  ');
      expect(result).toBeDefined();
      expect(result?.biomarker).toBe('Glucose');
    });
  });

  describe('getConversionFactor', () => {
    it('returns correct factor for glucose mg/dL to mmol/L', () => {
      const factor = getConversionFactor('Glucose', 'mg/dL', 'mmol/L');
      expect(factor).toBeCloseTo(0.0555, 4);
    });

    it('returns correct factor for glucose mmol/L to mg/dL', () => {
      const factor = getConversionFactor('Glucose', 'mmol/L', 'mg/dL');
      expect(factor).toBeCloseTo(18.018, 2);
    });

    it('returns correct factor for creatinine mg/dL to µmol/L', () => {
      const factor = getConversionFactor('Creatinine', 'mg/dL', 'µmol/L');
      expect(factor).toBeCloseTo(88.4, 1);
    });

    it('returns 1 for same unit', () => {
      const factor = getConversionFactor('Glucose', 'mg/dL', 'mg/dL');
      expect(factor).toBe(1);
    });

    it('handles case-insensitive unit comparison for same unit', () => {
      const factor = getConversionFactor('Glucose', 'mg/dL', 'MG/DL');
      expect(factor).toBe(1);
    });

    it('normalizes ASCII u to µ', () => {
      const factor = getConversionFactor('Creatinine', 'mg/dL', 'umol/L');
      expect(factor).toBeCloseTo(88.4, 1);
    });

    it('normalizes lowercase units', () => {
      const factor = getConversionFactor('Glucose', 'mg/dl', 'mmol/l');
      expect(factor).toBeCloseTo(0.0555, 4);
    });

    it('returns undefined for unknown biomarker', () => {
      const factor = getConversionFactor('Unknown', 'mg/dL', 'mmol/L');
      expect(factor).toBeUndefined();
    });

    it('returns undefined for unsupported unit conversion', () => {
      const factor = getConversionFactor('Glucose', 'mg/dL', 'stones');
      expect(factor).toBeUndefined();
    });

    it('works with biomarker aliases', () => {
      const factor = getConversionFactor('Blood Sugar', 'mg/dL', 'mmol/L');
      expect(factor).toBeCloseTo(0.0555, 4);
    });

    it('works with urine creatinine Italian alias', () => {
      const factor = getConversionFactor('U-Creatinina', 'µmol/L', 'g/L');
      expect(factor).toBeDefined();
      expect(factor).toBeGreaterThan(0);
    });
  });

  describe('Conversion factor pairs', () => {
    it('glucose conversions are inverse pairs', () => {
      const mgToMmol = getConversionFactor('Glucose', 'mg/dL', 'mmol/L');
      const mmolToMg = getConversionFactor('Glucose', 'mmol/L', 'mg/dL');
      expect(mgToMmol).toBeDefined();
      expect(mmolToMg).toBeDefined();
      // Product should be close to 1
      expect(mgToMmol! * mmolToMg!).toBeCloseTo(1, 2);
    });

    it('creatinine conversions are inverse pairs', () => {
      const mgToUmol = getConversionFactor('Creatinine', 'mg/dL', 'µmol/L');
      const umolToMg = getConversionFactor('Creatinine', 'µmol/L', 'mg/dL');
      expect(mgToUmol).toBeDefined();
      expect(umolToMg).toBeDefined();
      // Product should be close to 1
      expect(mgToUmol! * umolToMg!).toBeCloseTo(1, 2);
    });

    it('hemoglobin conversions are inverse pairs', () => {
      const gDlToGL = getConversionFactor('Hemoglobin', 'g/dL', 'g/L');
      const gLToGDl = getConversionFactor('Hemoglobin', 'g/L', 'g/dL');
      expect(gDlToGL).toBeDefined();
      expect(gLToGDl).toBeDefined();
      // Product should be close to 1
      expect(gDlToGL! * gLToGDl!).toBeCloseTo(1, 5);
    });

    it('cholesterol conversions are inverse pairs', () => {
      const mgToMmol = getConversionFactor('Total Cholesterol', 'mg/dL', 'mmol/L');
      const mmolToMg = getConversionFactor('Total Cholesterol', 'mmol/L', 'mg/dL');
      expect(mgToMmol).toBeDefined();
      expect(mmolToMg).toBeDefined();
      // Product should be close to 1
      expect(mgToMmol! * mmolToMg!).toBeCloseTo(1, 2);
    });

    it('vitamin D conversions are inverse pairs', () => {
      const ngToNmol = getConversionFactor('Vitamin D', 'ng/mL', 'nmol/L');
      const nmolToNg = getConversionFactor('Vitamin D', 'nmol/L', 'ng/mL');
      expect(ngToNmol).toBeDefined();
      expect(nmolToNg).toBeDefined();
      // Product should be close to 1
      expect(ngToNmol! * nmolToNg!).toBeCloseTo(1, 2);
    });
  });
});
