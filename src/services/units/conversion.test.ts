import { describe, it, expect } from 'vitest';
import {
  convertValue,
  convertReferenceRange,
  canConvert,
  getSupportedUnits,
  formatValueWithUnit,
  parseValueWithUnit,
  normalizeUnit,
  ConversionError,
} from './conversion';

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

      it('works with alias "Blood Sugar"', () => {
        const result = convertValue('Blood Sugar', 100, 'mg/dL', 'mmol/L');
        expect(result.convertedValue).toBeCloseTo(5.55, 1);
      });
    });

    describe('Cholesterol conversions', () => {
      it('converts total cholesterol from mg/dL to mmol/L', () => {
        const result = convertValue('Total Cholesterol', 200, 'mg/dL', 'mmol/L');
        expect(result.convertedValue).toBeCloseTo(5.18, 1);
      });

      it('converts LDL from mg/dL to mmol/L', () => {
        const result = convertValue('LDL', 100, 'mg/dL', 'mmol/L');
        expect(result.convertedValue).toBeCloseTo(2.59, 1);
      });

      it('converts HDL from mmol/L to mg/dL', () => {
        const result = convertValue('HDL', 1.5, 'mmol/L', 'mg/dL');
        expect(result.convertedValue).toBeCloseTo(58, 0);
      });
    });

    describe('Hemoglobin conversions', () => {
      it('converts from g/dL to g/L', () => {
        const result = convertValue('Hemoglobin', 14, 'g/dL', 'g/L');
        expect(result.convertedValue).toBe(140);
      });

      it('converts from g/L to g/dL', () => {
        const result = convertValue('Hgb', 140, 'g/L', 'g/dL');
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
    });

    describe('Vitamin D conversions', () => {
      it('converts from ng/mL to nmol/L', () => {
        const result = convertValue('Vitamin D', 30, 'ng/mL', 'nmol/L');
        expect(result.convertedValue).toBeCloseTo(74.9, 0);
      });

      it('converts from nmol/L to ng/mL', () => {
        const result = convertValue('Vitamin D', 75, 'nmol/L', 'ng/mL');
        expect(result.convertedValue).toBeCloseTo(30, 0);
      });
    });

    describe('TSH conversions', () => {
      it('converts between equivalent units', () => {
        const result = convertValue('TSH', 2.5, 'mIU/L', 'µIU/mL');
        expect(result.convertedValue).toBe(2.5);
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

  describe('convertReferenceRange', () => {
    it('converts both low and high values', () => {
      const result = convertReferenceRange(
        'Glucose',
        { low: 70, high: 100, unit: 'mg/dL' },
        'mmol/L'
      );

      expect(result.low).toBeCloseTo(3.89, 1);
      expect(result.high).toBeCloseTo(5.55, 1);
      expect(result.unit).toBe('mmol/L');
    });

    it('handles missing low value', () => {
      const result = convertReferenceRange(
        'Glucose',
        { high: 100, unit: 'mg/dL' },
        'mmol/L'
      );

      expect(result.low).toBeUndefined();
      expect(result.high).toBeCloseTo(5.55, 1);
    });

    it('handles missing high value', () => {
      const result = convertReferenceRange(
        'Glucose',
        { low: 70, unit: 'mg/dL' },
        'mmol/L'
      );

      expect(result.low).toBeCloseTo(3.89, 1);
      expect(result.high).toBeUndefined();
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

  describe('getSupportedUnits', () => {
    it('returns all units for a biomarker', () => {
      const units = getSupportedUnits('Glucose');
      expect(units).toContain('mg/dL');
      expect(units).toContain('mmol/L');
    });

    it('returns empty array for unknown biomarker', () => {
      const units = getSupportedUnits('Unknown');
      expect(units).toEqual([]);
    });
  });

  describe('formatValueWithUnit', () => {
    it('formats value with space before unit', () => {
      expect(formatValueWithUnit(100, 'mg/dL')).toBe('100 mg/dL');
    });

    it('formats percentage without space', () => {
      expect(formatValueWithUnit(45, '%')).toBe('45%');
    });

    it('respects precision', () => {
      expect(formatValueWithUnit(5.5555, 'mmol/L', 2)).toBe('5.56 mmol/L');
    });

    it('uses default precision when not specified', () => {
      // mg/dL has default precision of 0
      expect(formatValueWithUnit(99.7, 'mg/dL')).toBe('100 mg/dL');
    });
  });

  describe('parseValueWithUnit', () => {
    it('parses value with space before unit', () => {
      const result = parseValueWithUnit('100 mg/dL');
      expect(result?.value).toBe(100);
      expect(result?.unit).toBe('mg/dL');
    });

    it('parses value without space', () => {
      const result = parseValueWithUnit('5.5mmol/L');
      expect(result?.value).toBe(5.5);
      expect(result?.unit).toBe('mmol/L');
    });

    it('parses decimal values', () => {
      const result = parseValueWithUnit('5.55 mmol/L');
      expect(result?.value).toBe(5.55);
    });

    it('returns null for invalid input', () => {
      expect(parseValueWithUnit('invalid')).toBeNull();
      expect(parseValueWithUnit('')).toBeNull();
      expect(parseValueWithUnit('100')).toBeNull();
    });
  });

  describe('normalizeUnit', () => {
    it('normalizes common variations', () => {
      expect(normalizeUnit('umol/L')).toBe('µmol/L');
      expect(normalizeUnit('mg/dl')).toBe('mg/dL');
      expect(normalizeUnit('mmol/l')).toBe('mmol/L');
      expect(normalizeUnit('ng/ml')).toBe('ng/mL');
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
