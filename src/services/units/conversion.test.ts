import { describe, it, expect } from 'vitest';
import {
  convertValue,
  canConvert,
  normalizeUnit,
  ConversionError,
} from './conversion';
import { convertMeasurement } from './convertMeasurement';

describe('Unit Conversion Service', () => {
  describe('convertValue', () => {
    describe('Glucose conversions', () => {
      it('converts glucose from mg/dL to mmol/L', () => {
        const result = convertValue('Glucose', 100, 'mg/dL', 'mmol/L');
        expect(result.convertedValue).toBeCloseTo(5.55, 1);
        expect(result.targetUnit).toBe('mmol/L');
      });

      it('converts glucose from mmol/L to mg/dL', () => {
        const result = convertValue('Glucose', 5.55, 'mmol/L', 'mg/dL');
        expect(result.convertedValue).toBeCloseTo(100, 0);
        expect(result.targetUnit).toBe('mg/dL');
      });

      it('converts by LOINC component', () => {
        const result = convertValue('Glucose', 100, 'mg/dL', 'mmol/L');
        expect(result.convertedValue).toBeCloseTo(5.55, 2);
      });

      it('converts a glucose component with a subpart as glucose', () => {
        const result = convertValue('Glucose^2H post 75 g glucose PO', 100, 'mg/dL', 'mmol/L');
        expect(result.convertedValue).toBeCloseTo(5.55, 2);
      });
    });

    describe('Cholesterol conversions', () => {
      it('converts total cholesterol from mg/dL to mmol/L', () => {
        const result = convertValue('Cholesterol', 200, 'mg/dL', 'mmol/L');
        expect(result.convertedValue).toBeCloseTo(5.18, 1);
      });

      it('converts LDL from mg/dL to mmol/L', () => {
        const result = convertValue('Cholesterol.in LDL', 100, 'mg/dL', 'mmol/L');
        expect(result.convertedValue).toBeCloseTo(2.59, 1);
      });

      it('converts HDL from mmol/L to mg/dL', () => {
        const result = convertValue('Cholesterol.in HDL', 1.5, 'mmol/L', 'mg/dL');
        expect(result.convertedValue).toBeCloseTo(58, 0);
      });
    });

    describe('Hemoglobin conversions', () => {
      it('converts from g/dL to g/L', () => {
        const result = convertValue('Hemoglobin', 14, 'g/dL', 'g/L');
        expect(result.convertedValue).toBe(140);
      });

      it('converts from g/L to g/dL', () => {
        const result = convertValue('Hemoglobin', 140, 'g/L', 'g/dL');
        expect(result.convertedValue).toBe(14);
      });
    });

    describe('Creatinine conversions', () => {
      it('converts from mg/dL to µmol/L', () => {
        const result = convertValue('Creatinine', 1.0, 'mg/dL', 'µmol/L');
        expect(result.convertedValue).toBeCloseTo(88.4, 0);
      });

      it('converts from µmol/L to mg/dL', () => {
        const result = convertValue('Creatinine', 88.4, 'µmol/L', 'mg/dL');
        expect(result.convertedValue).toBeCloseTo(1.0, 1);
      });

      it('converts µmol/L to mg/dL at two decimals', () => {
        // Use precision of 2 to avoid rounding issues (default for mg/dL is 0)
        const result = convertValue('Creatinine', 67, 'µmol/L', 'mg/dL', 2);
        expect(result.convertedValue).toBeCloseTo(0.76, 1);
      });
    });

    describe('Vitamin D conversions', () => {
      it('converts from ng/mL to nmol/L', () => {
        const result = convertValue('Calcidiol+ercalcidiol', 30, 'ng/mL', 'nmol/L');
        expect(result.convertedValue).toBeCloseTo(74.9, 0);
      });

      it('converts from nmol/L to ng/mL', () => {
        const result = convertValue('Calcidiol+ercalcidiol', 75, 'nmol/L', 'ng/mL');
        expect(result.convertedValue).toBeCloseTo(30, 0);
      });
    });

    describe('TSH conversions', () => {
      it('converts between equivalent units', () => {
        const result = convertValue('Thyrotropin', 2.5, 'mIU/L', 'µIU/mL');
        expect(result.convertedValue).toBe(2.5);
      });
    });

    describe('precision of small values', () => {
      it('keeps at least two significant figures when converting into a coarse unit', () => {
        // mg/dL normally shows no decimals, but creatinine is a small number
        const result = convertValue('Creatinine', 67, 'µmol/L', 'mg/dL');
        expect(result.convertedValue).toBe(0.76);
      });

      it('keeps the unit precision for values that already have enough digits', () => {
        const result = convertValue('Glucose', 5.5, 'mmol/L', 'mg/dL');
        expect(result.convertedValue).toBe(99);
      });

      it('respects an explicitly requested precision', () => {
        const result = convertValue('Creatinine', 67, 'µmol/L', 'mg/dL', 0);
        expect(result.convertedValue).toBe(1);
      });
    });

    describe('Creatinine conversions in urine units', () => {
      it('converts from µmol/L to g/L', () => {
        // 3780 µmol/L should be approximately 0.42 g/L
        const result = convertValue('Creatinine', 3780, 'µmol/L', 'g/L', 2);
        expect(result.convertedValue).toBeCloseTo(0.43, 1);
      });

      it('converts from g/L to µmol/L', () => {
        const result = convertValue('Creatinine', 0.42, 'g/L', 'µmol/L', 0);
        expect(result.convertedValue).toBeCloseTo(3713, -1);
      });

      it('converts urine units under the one creatinine entry', () => {
        const result = convertValue('Creatinine', 3780, 'µmol/L', 'g/L', 2);
        expect(result.convertedValue).toBeCloseTo(0.43, 1);
      });
    });

    describe('Protein/Creatinine conversions', () => {
      it('converts from mg/mmol to mg/g', () => {
        // 15 mg/mmol should be approximately 132 mg/g
        const result = convertValue('Protein/Creatinine', 15, 'mg/mmol', 'mg/g', 0);
        expect(result.convertedValue).toBeCloseTo(133, 0);
      });

      it('converts from mg/gcreat. to mg/mmol', () => {
        const result = convertValue('Protein/Creatinine', 132, 'mg/gcreat.', 'mg/mmol', 1);
        expect(result.convertedValue).toBeCloseTo(14.9, 0);
      });

      it('converts between creatinine-ratio spellings', () => {
        const result = convertValue('Protein/Creatinine', 15, 'mg/mmolcreat.', 'mg/gcreat.', 0);
        expect(result.convertedValue).toBeCloseTo(133, 0);
      });
    });

    describe('Same unit conversion', () => {
      it('returns same value when units match', () => {
        const result = convertValue('Glucose', 100, 'mg/dL', 'mg/dL');
        expect(result.convertedValue).toBe(100);
      });

      it('handles case differences in same unit', () => {
        const result = convertValue('Glucose', 100, 'mg/dL', 'MG/DL');
        expect(result.convertedValue).toBe(100);
      });
    });

    describe('Error handling', () => {
      it('throws ConversionError for unknown biomarker', () => {
        expect(() =>
          convertValue('Unknown Marker', 100, 'mg/dL', 'mmol/L')
        ).toThrow(ConversionError);
      });

      it('throws ConversionError for unsupported conversion', () => {
        expect(() =>
          convertValue('Glucose', 100, 'mg/dL', 'stones')
        ).toThrow(ConversionError);
      });

      it('error message mentions biomarker name', () => {
        try {
          convertValue('Unknown Marker', 100, 'mg/dL', 'mmol/L');
        } catch (e) {
          expect((e as Error).message).toContain('Unknown Marker');
        }
      });
    });

    describe('Precision', () => {
      it('uses default precision for target unit', () => {
        const result = convertValue('Glucose', 99.7, 'mg/dL', 'mmol/L');
        // mmol/L default precision is 2
        expect(result.precision).toBe(2);
      });

      it('allows custom precision', () => {
        const result = convertValue('Glucose', 100, 'mg/dL', 'mmol/L', 4);
        expect(result.precision).toBe(4);
        expect(result.convertedValue.toString()).toMatch(/\.\d{1,4}$/);
      });
    });
  });

  describe('HbA1c (NGSP % ↔ IFCC mmol/mol)', () => {
    // IFCC = (NGSP − 2.15) × 10.929: an offset, not a plain ratio
    it('converts % to mmol/mol with the master equation', () => {
      expect(convertValue('Hemoglobin A1c/Hemoglobin.total', 6.5, '%', 'mmol/mol', 1).convertedValue).toBe(47.5);
      expect(convertValue('Hemoglobin A1c/Hemoglobin.total', 5.7, '%', 'mmol/mol', 0).convertedValue).toBe(39);
    });

    it('converts mmol/mol to % with the master equation', () => {
      expect(convertValue('Hemoglobin A1c/Hemoglobin.total', 48, 'mmol/mol', '%', 1).convertedValue).toBe(6.5);
      expect(convertValue('Hemoglobin A1c/Hemoglobin.total', 42, 'mmol/mol', '%', 1).convertedValue).toBe(6);
    });

    it('converts a reference range with the master equation', () => {
      const measurement = { value: 5, unit: '%', referenceRangeLow: 4, referenceRangeHigh: 5.6 };
      expect(convertMeasurement('Hemoglobin A1c/Hemoglobin.total', measurement, 'mmol/mol').referenceRange).toEqual({
        low: 20.22,
        high: 37.71,
      });
    });
  });

  describe('MCH (pg ↔ fmol)', () => {
    // Per haemoglobin monomer, 16 114.5 g/mol: 1 pg = 0.06206 fmol
    it('converts pg to fmol and back', () => {
      expect(convertValue('Hemoglobin', 30, 'pg', 'fmol', 2).convertedValue).toBe(1.86);
      expect(convertValue('Hemoglobin', 1.9, 'fmol', 'pg', 1).convertedValue).toBe(30.6);
    });
  });

  describe('canConvert', () => {
    it('returns true for supported conversions', () => {
      expect(canConvert('Glucose', 'mg/dL', 'mmol/L')).toBe(true);
      expect(canConvert('Hemoglobin', 'g/dL', 'g/L')).toBe(true);
    });

    it('returns true for same unit', () => {
      expect(canConvert('Glucose', 'mg/dL', 'mg/dL')).toBe(true);
    });

    it('returns false for unsupported conversions', () => {
      expect(canConvert('Glucose', 'mg/dL', 'stones')).toBe(false);
    });

    it('returns false for unknown biomarkers', () => {
      expect(canConvert('Unknown', 'mg/dL', 'mmol/L')).toBe(false);
    });
  });

  describe('normalizeUnit', () => {
    it('normalizes common variations', () => {
      expect(normalizeUnit('umol/L')).toBe('µmol/L');
      expect(normalizeUnit('mg/dl')).toBe('mg/dL');
      expect(normalizeUnit('mmol/l')).toBe('mmol/L');
      expect(normalizeUnit('ng/ml')).toBe('ng/mL');
    });

    it('uses the same spellings as unit conversion', () => {
      expect(normalizeUnit('mmol/mol Hb')).toBe('mmol/mol');
      expect(normalizeUnit('\u03bcmol/L')).toBe('µmol/L');
      expect(normalizeUnit('mg/g creat.')).toBe('mg/g');
    });

    it('preserves already normalized units', () => {
      expect(normalizeUnit('µmol/L')).toBe('µmol/L');
      expect(normalizeUnit('mg/dL')).toBe('mg/dL');
    });

    it('trims whitespace', () => {
      expect(normalizeUnit('  mg/dL  ')).toBe('mg/dL');
    });
  });
});
