import { describe, it, expect } from 'vitest';
import { LEGACY_ID_ORDER, legacyIdToKey } from './legacyBiomarkerIds';
import { ISSUED_BIOMARKER_KEYS } from '@data/biomarkers/keys.snapshot';
import { getBiomarkerByKey } from '@data/biomarkers/dictionary';

/**
 * The biomarker each legacy ID referred to: BIOMARKER_DEFINITIONS order
 * before stable keys (commit 2d6a26f). Independent of LEGACY_ID_ORDER so an
 * accidental edit to either is caught.
 */
const LEGACY_ID_NAMES = [
  'White Blood Cell Count',
  'Red Blood Cell Count',
  'Hemoglobin',
  'Hematocrit',
  'Platelet Count',
  'Mean Corpuscular Volume',
  'Mean Corpuscular Hemoglobin',
  'Mean Corpuscular Hemoglobin Concentration',
  'Red Cell Distribution Width',
  'Neutrophils',
  'Neutrophils Percentage',
  'Lymphocytes',
  'Lymphocytes Percentage',
  'Monocytes',
  'Monocytes Percentage',
  'Eosinophils',
  'Eosinophils Percentage',
  'Basophils',
  'Basophils Percentage',
  'Erythrocyte Sedimentation Rate',
  'C-Reactive Protein',
  'Glucose',
  'Creatinine',
  'Blood Urea Nitrogen',
  'Sodium',
  'Potassium',
  'Chloride',
  'Carbon Dioxide',
  'Calcium',
  'Magnesium',
  'eGFR',
  'Total Cholesterol',
  'LDL Cholesterol',
  'HDL Cholesterol',
  'Triglycerides',
  'VLDL Cholesterol',
  'Non-HDL Cholesterol',
  'Thyroid Stimulating Hormone',
  'Free T4',
  'Total T4',
  'Free T3',
  'Total T3',
  'TPO Antibodies',
  'Serum Iron',
  'Ferritin',
  'Total Iron Binding Capacity',
  'Transferrin Saturation',
  'Transferrin',
  'Vitamin B12',
  'Vitamin D',
  'Folate',
  'Vitamin A',
  'Hemoglobin A1c',
  'Fructosamine',
  'Urine pH',
  'Urine Specific Gravity',
  'Urine Protein',
  'Urine Glucose',
  'Urine Ketones',
  'Urine Blood',
  'Urine WBC',
  'Urine Leukocyte Esterase',
  'Urine Nitrites',
  'Microalbumin',
  'Urine Epithelial Cells',
  'Urine Creatinine',
  'Urine Bilirubin',
  'Urine Urobilinogen',
  'Albumin Creatinine Ratio',
  'Protein Creatinine Ratio',
  'Urine Volume',
  '24-Hour Urine Albumin',
  'Alanine Aminotransferase',
  'Aspartate Aminotransferase',
  'Alkaline Phosphatase',
  'Bilirubin Total',
  'Bilirubin Direct',
  'Gamma-Glutamyl Transferase',
  'Albumin',
  'Total Protein',
  'Amylase',
  'Alpha-fetoprotein',
  'Sexual Abstinence',
  'Semen Volume',
  'Liquefaction Time',
  'Sperm Concentration',
  'Total Sperm Count',
  'Round Cells',
  'Immature Sperm Forms',
  'Progressive Motility (Rapid)',
  'Progressive Motility (Slow)',
  'Non-Progressive Motility',
  'Immotile Sperm',
  'Normal Sperm Morphology',
  'Head Abnormalities',
  'Midpiece Abnormalities',
  'Tail Abnormalities',
  'Cytoplasmic Residue',
  'Sperm Vitality',
  'Total Progressive Motility',
  'Total Motility',
  'Semen pH',
  'Serum Albumin (Electrophoresis)',
  'Alpha-1 Globulin',
  'Alpha-2 Globulin',
  'Beta Globulin',
  'Gamma Globulin',
];

describe('legacyIdToKey', () => {
  it('maps every legacy ID to the biomarker it referred to', () => {
    expect(LEGACY_ID_ORDER).toHaveLength(LEGACY_ID_NAMES.length);
    LEGACY_ID_NAMES.forEach((name, index) =>
      expect(getBiomarkerByKey(legacyIdToKey(index + 1))?.name, `legacy ID ${index + 1}`).toBe(name)
    );
  });

  it('maps 1-based dictionary positions to keys', () => {
    expect(legacyIdToKey(1)).toBe(LEGACY_ID_ORDER[0]);
    expect(legacyIdToKey(LEGACY_ID_ORDER.length)).toBe(LEGACY_ID_ORDER[LEGACY_ID_ORDER.length - 1]);
  });

  it('maps known positions to the biomarkers they referred to', () => {
    expect(legacyIdToKey(1)).toBe('white-blood-cell-count');
    expect(legacyIdToKey(3)).toBe('hemoglobin');
  });

  it('maps hash IDs of unknown biomarkers to legacy unknown keys', () => {
    expect(legacyIdToKey(10042)).toBe('unknown:legacy-10042');
  });

  it('maps IDs outside the dictionary to legacy unknown keys instead of guessing', () => {
    expect(legacyIdToKey(0)).toBe('unknown:legacy-0');
    expect(legacyIdToKey(-3)).toBe('unknown:legacy--3');
    expect(legacyIdToKey(LEGACY_ID_ORDER.length + 1)).toBe(`unknown:legacy-${LEGACY_ID_ORDER.length + 1}`);
    expect(legacyIdToKey(2.5)).toBe('unknown:legacy-2.5');
  });

  it('only refers to keys that were issued', () => {
    const issued = new Set(ISSUED_BIOMARKER_KEYS.map(([key]) => key));
    LEGACY_ID_ORDER.forEach((key) => expect(issued.has(key), key).toBe(true));
  });
});
