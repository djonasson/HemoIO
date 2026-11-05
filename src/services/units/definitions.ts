/**
 * Unit Conversion Definitions
 *
 * This module defines conversion factors between different units
 * used in laboratory medicine.
 *
 * Conversion factors are organized by substance, the LOINC component
 * ("Glucose", "Creatinine"), since the same unit names can have different
 * conversion factors for different substances (e.g., mg/dL to mmol/L varies
 * by molar mass). One substance has one set, whatever the sample.
 */

import { unitsMatch } from '../../utils/unitSpelling';
import { ucumConversion } from './ucum';

export { normalizeUnitForLookup, unitsMatch } from '../../utils/unitSpelling';

/**
 * Unit conversion factor definition
 */
export interface UnitConversion {
  /** Source unit */
  from: string;
  /** Target unit */
  to: string;
  /** Multiply by this factor to convert from -> to */
  factor: number;
  /** Added after multiplying, for conversions that are not plain ratios */
  offset?: number;
  /**
   * Only for values in these LOINC systems (samples): an approximation that
   * holds for one sample type alone
   */
  systems?: readonly string[];
}

/**
 * What a value measures, as far as converting it goes: its LOINC component,
 * with the property and system (sample) where a conversion depends on them.
 * A catalog test is one. A plain string is a component alone.
 */
export interface Substance {
  component: string;
  property?: string;
  system?: string;
}

export type SubstanceRef = string | Substance;

function asSubstance(ref: SubstanceRef): Substance {
  return typeof ref === 'string' ? { component: ref } : ref;
}

/**
 * The unit conversions of one substance
 */
export interface SubstanceConversions {
  /** LOINC component, e.g. "Glucose" or "Cholesterol" */
  component: string;
  /**
   * Only for tests of this LOINC property: for a component as generic as
   * "Observation" (MCV) or "Erythrocyte" (ESR, but also RDW)
   */
  property?: string;
  /** Available unit conversions */
  conversions: UnitConversion[];
}

/**
 * Glucose conversions
 * Molecular weight: ~180.16 g/mol
 * Conversion: mg/dL × 0.0555 = mmol/L
 */
const glucoseConversions: SubstanceConversions = {
  component: 'Glucose',
  conversions: [
    { from: 'mg/dL', to: 'mmol/L', factor: 0.0555 },
    { from: 'mmol/L', to: 'mg/dL', factor: 18.018 },
  ],
};

/**
 * Cholesterol conversions (Total, LDL, HDL, VLDL, Non-HDL)
 * Molecular weight: ~386.65 g/mol
 * Conversion: mg/dL × 0.0259 = mmol/L
 */
const cholesterolConversions: SubstanceConversions = {
  component: 'Cholesterol',
  conversions: [
    { from: 'mg/dL', to: 'mmol/L', factor: 0.0259 },
    { from: 'mmol/L', to: 'mg/dL', factor: 38.61 },
  ],
};

/**
 * Triglycerides conversions
 * Average molecular weight: ~885 g/mol (varies by composition)
 * Conversion: mg/dL × 0.0113 = mmol/L
 */
const triglyceridesConversions: SubstanceConversions = {
  component: 'Triglyceride',
  conversions: [
    { from: 'mg/dL', to: 'mmol/L', factor: 0.0113 },
    { from: 'mmol/L', to: 'mg/dL', factor: 88.5 },
  ],
};

/**
 * Hemoglobin conversions
 * Molecular weight of monomer: ~16,000 g/mol
 * Conversion: g/dL × 10 = g/L
 * Conversion: g/dL × 0.6206 = mmol/L (using tetramer MW ~64,500)
 */
const hemoglobinConversions: SubstanceConversions = {
  component: 'Hemoglobin',
  conversions: [
    { from: 'g/dL', to: 'g/L', factor: 10 },
    { from: 'g/L', to: 'g/dL', factor: 0.1 },
    { from: 'g/dL', to: 'mmol/L', factor: 0.6206 },
    { from: 'mmol/L', to: 'g/dL', factor: 1.611 },
    // MCH: the hemoglobin in one red cell
    { from: 'pg', to: 'fmol', factor: 1 / 16.1145 },
    { from: 'fmol', to: 'pg', factor: 16.1145 },
  ],
};

/**
 * Creatinine conversions
 * Molecular weight: 113.12 g/mol
 * Conversion: mg/dL × 88.4 = µmol/L
 */
const creatinineConversions: SubstanceConversions = {
  component: 'Creatinine',
  conversions: [
    { from: 'mg/dL', to: 'µmol/L', factor: 88.4 },
    { from: 'µmol/L', to: 'mg/dL', factor: 0.0113 },
    // Units urine creatinine is reported in
    // mg/dL conversions
    { from: 'mg/dL', to: 'g/L', factor: 0.01 },
    { from: 'mg/dL', to: 'mmol/L', factor: 0.0884 },
    // µmol/L conversions
    { from: 'µmol/L', to: 'g/L', factor: 0.00011312 },
    { from: 'µmol/L', to: 'mmol/L', factor: 0.001 },
    // g/L conversions
    { from: 'g/L', to: 'mg/dL', factor: 100 },
    { from: 'g/L', to: 'µmol/L', factor: 8840 },
    { from: 'g/L', to: 'mmol/L', factor: 8.84 },
    // mmol/L conversions
    { from: 'mmol/L', to: 'mg/dL', factor: 11.312 },
    { from: 'mmol/L', to: 'µmol/L', factor: 1000 },
    { from: 'mmol/L', to: 'g/L', factor: 0.11312 },
    // Output in 24-hour urine
    { from: 'g/24h', to: 'mmol/24h', factor: 8.84 },
    { from: 'mmol/24h', to: 'g/24h', factor: 0.11312 },
    { from: 'g/24h', to: 'µmol/24h', factor: 8840 },
    { from: 'µmol/24h', to: 'g/24h', factor: 0.00011312 },
    { from: 'g/24h', to: 'mg/24h', factor: 1000 },
    { from: 'mg/24h', to: 'g/24h', factor: 0.001 },
  ],
};

/**
 * BUN (Blood Urea Nitrogen) conversions
 * Molecular weight of urea: 60.06 g/mol, BUN is the nitrogen portion
 * Conversion: mg/dL × 0.357 = mmol/L
 */
const bunConversions: SubstanceConversions = {
  component: 'Urea nitrogen',
  conversions: [
    { from: 'mg/dL', to: 'mmol/L', factor: 0.357 },
    { from: 'mmol/L', to: 'mg/dL', factor: 2.8 },
  ],
};

/**
 * Urea conversions (the whole molecule, not BUN)
 * Molecular weight: 60.06 g/mol
 * Conversion: mg/dL × 0.1665 = mmol/L
 */
const ureaConversions: SubstanceConversions = {
  component: 'Urea',
  conversions: [
    { from: 'mg/dL', to: 'mmol/L', factor: 0.1665 },
    { from: 'mmol/L', to: 'mg/dL', factor: 6.006 },
    // Units urine urea is reported in
    { from: 'g/L', to: 'mmol/L', factor: 16.65 },
    { from: 'mmol/L', to: 'g/L', factor: 0.06006 },
    { from: 'g/L', to: 'mg/dL', factor: 100 },
    { from: 'mg/dL', to: 'g/L', factor: 0.01 },
    // Output in 24-hour urine
    { from: 'g/24h', to: 'mmol/24h', factor: 16.65 },
    { from: 'mmol/24h', to: 'g/24h', factor: 0.06006 },
  ],
};

/**
 * Calcium conversions
 * Molecular weight: 40.08 g/mol
 * Conversion: mg/dL × 0.25 = mmol/L
 */
const calciumConversions: SubstanceConversions = {
  component: 'Calcium',
  conversions: [
    { from: 'mg/dL', to: 'mmol/L', factor: 0.25 },
    { from: 'mmol/L', to: 'mg/dL', factor: 4.0 },
  ],
};

/**
 * Vitamin D conversions
 * Molecular weight: 400.64 g/mol (25-hydroxyvitamin D)
 * Conversion: ng/mL × 2.496 = nmol/L
 */
const vitaminDConversions: SubstanceConversions = {
  component: 'Calcidiol+ercalcidiol',
  conversions: [
    { from: 'ng/mL', to: 'nmol/L', factor: 2.496 },
    { from: 'nmol/L', to: 'ng/mL', factor: 0.401 },
  ],
};

/**
 * Vitamin B12 conversions
 * Molecular weight: 1355.37 g/mol
 * Conversion: pg/mL × 0.738 = pmol/L
 */
const vitaminB12Conversions: SubstanceConversions = {
  component: 'Cobalamins',
  conversions: [
    { from: 'pg/mL', to: 'pmol/L', factor: 0.738 },
    { from: 'pmol/L', to: 'pg/mL', factor: 1.355 },
    { from: 'pg/mL', to: 'ng/L', factor: 1 },
    { from: 'ng/L', to: 'pg/mL', factor: 1 },
  ],
};

/**
 * Folate conversions
 * Molecular weight: 441.4 g/mol
 * Conversion: ng/mL × 2.266 = nmol/L
 */
const folateConversions: SubstanceConversions = {
  component: 'Folate',
  conversions: [
    { from: 'ng/mL', to: 'nmol/L', factor: 2.266 },
    { from: 'nmol/L', to: 'ng/mL', factor: 0.441 },
  ],
};

/**
 * TSH conversions
 * mIU/L and µIU/mL are equivalent
 * (μUI/mL, uIU/mL and mU/L are spellings of these, see UNIT_SPELLINGS)
 */
const tshConversions: SubstanceConversions = {
  component: 'Thyrotropin',
  conversions: [
    { from: 'mIU/L', to: 'µIU/mL', factor: 1 },
    { from: 'µIU/mL', to: 'mIU/L', factor: 1 },
  ],
};

/**
 * Free T4 conversions
 * Molecular weight: 776.87 g/mol
 * Conversion: ng/dL × 12.87 = pmol/L
 */
const freeT4Conversions: SubstanceConversions = {
  component: 'Thyroxine.free',
  conversions: [
    { from: 'ng/dL', to: 'pmol/L', factor: 12.87 },
    { from: 'pmol/L', to: 'ng/dL', factor: 0.0777 },
  ],
};

/**
 * Total T4 conversions
 * Conversion: µg/dL × 12.87 = nmol/L
 */
const totalT4Conversions: SubstanceConversions = {
  component: 'Thyroxine',
  conversions: [
    { from: 'µg/dL', to: 'nmol/L', factor: 12.87 },
    { from: 'nmol/L', to: 'µg/dL', factor: 0.0777 },
  ],
};

/**
 * Free T3 conversions
 * Molecular weight: 650.97 g/mol
 * Conversion: pg/mL × 1.536 = pmol/L
 */
const freeT3Conversions: SubstanceConversions = {
  component: 'Triiodothyronine.free',
  conversions: [
    { from: 'pg/mL', to: 'pmol/L', factor: 1.536 },
    { from: 'pmol/L', to: 'pg/mL', factor: 0.651 },
  ],
};

/**
 * Total T3 conversions
 * Conversion: ng/dL × 0.01536 = nmol/L
 */
const totalT3Conversions: SubstanceConversions = {
  component: 'Triiodothyronine',
  conversions: [
    { from: 'ng/dL', to: 'nmol/L', factor: 0.01536 },
    { from: 'nmol/L', to: 'ng/dL', factor: 65.1 },
  ],
};

/**
 * Iron conversions
 * Molecular weight: 55.845 g/mol
 * Conversion: µg/dL × 0.179 = µmol/L
 */
const ironConversions: SubstanceConversions = {
  component: 'Iron',
  conversions: [
    { from: 'µg/dL', to: 'µmol/L', factor: 0.179 },
    { from: 'µmol/L', to: 'µg/dL', factor: 5.587 },
  ],
};

/**
 * Ferritin conversions
 * Conversion: ng/mL = µg/L (equivalent)
 * Conversion to pmol/L uses MW ~450,000 (approximate)
 */
const ferritinConversions: SubstanceConversions = {
  component: 'Ferritin',
  conversions: [
    { from: 'ng/mL', to: 'µg/L', factor: 1 },
    { from: 'µg/L', to: 'ng/mL', factor: 1 },
    { from: 'ng/mL', to: 'pmol/L', factor: 2.247 },
    { from: 'pmol/L', to: 'ng/mL', factor: 0.445 },
  ],
};

/**
 * Bilirubin conversions
 * Molecular weight: 584.66 g/mol
 * Conversion: mg/dL × 17.1 = µmol/L
 */
const bilirubinConversions: SubstanceConversions = {
  component: 'Bilirubin',
  conversions: [
    { from: 'mg/dL', to: 'µmol/L', factor: 17.1 },
    { from: 'µmol/L', to: 'mg/dL', factor: 0.0585 },
  ],
};

/**
 * Albumin conversions
 * Conversion: g/dL × 10 = g/L
 */
const albuminConversions: SubstanceConversions = {
  component: 'Albumin',
  conversions: [
    { from: 'g/dL', to: 'g/L', factor: 10 },
    { from: 'g/L', to: 'g/dL', factor: 0.1 },
    // Urine albumin (microalbumin)
    // mg/L ↔ µg/min (assuming 1440 min/day and ~1.5L urine/day average)
    // This is an approximation that holds for urine alone
    { from: 'mg/L', to: 'µg/min', factor: 1.04, systems: ['Urine'] },
    { from: 'µg/min', to: 'mg/L', factor: 0.96, systems: ['Urine'] },
  ],
};

/**
 * HbA1c conversions
 * NGSP (%) to IFCC (mmol/mol), the IFCC–NGSP master equation:
 * IFCC = (NGSP − 2.15) × 10.929, so NGSP = IFCC / 10.929 + 2.15
 */
const hba1cConversions: SubstanceConversions = {
  component: 'Hemoglobin A1c/Hemoglobin.total',
  conversions: [
    { from: '%', to: 'mmol/mol', factor: 10.929, offset: -2.15 * 10.929 },
    { from: 'mmol/mol', to: '%', factor: 1 / 10.929, offset: 2.15 },
  ],
};

/**
 * Uric Acid conversions
 * Molecular weight: 168.11 g/mol
 * Conversion: mg/dL × 59.48 = µmol/L
 */
const uricAcidConversions: SubstanceConversions = {
  component: 'Urate',
  conversions: [
    { from: 'mg/dL', to: 'µmol/L', factor: 59.48 },
    { from: 'µmol/L', to: 'mg/dL', factor: 0.0168 },
  ],
};

/**
 * White Blood Cell Count conversions
 * 10^3/μL = 10^9/L (equivalent units)
 * Also known as: k/μL, K/uL, thousand/μL
 */
const wbcConversions: SubstanceConversions = {
  component: 'Leukocytes',
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: '10^3/μL', to: 'k/μL', factor: 1 },
    { from: 'k/μL', to: '10^3/μL', factor: 1 },
    // cells/μL to 10^9/L: divide by 10^6
    { from: 'cells/μL', to: '10^9/L', factor: 0.000001 },
    { from: '10^9/L', to: 'cells/μL', factor: 1000000 },
    // mil/mL = 10^6/mL = 10^9/L (since 1 mL = 10^-3 L)
    { from: 'mil/mL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'mil/mL', factor: 1 },
  ],
};

/**
 * Red Blood Cell Count conversions
 * 10^6/μL = 10^12/L (equivalent units)
 * Also known as: M/μL, million/μL
 */
const rbcConversions: SubstanceConversions = {
  component: 'Erythrocytes',
  conversions: [
    { from: '10^6/μL', to: '10^12/L', factor: 1 },
    { from: '10^12/L', to: '10^6/μL', factor: 1 },
    { from: 'M/μL', to: '10^12/L', factor: 1 },
    { from: '10^12/L', to: 'M/μL', factor: 1 },
    { from: '10^6/μL', to: 'M/μL', factor: 1 },
    { from: 'M/μL', to: '10^6/μL', factor: 1 },
  ],
};

/**
 * Platelet Count conversions
 * 10^3/μL = 10^9/L (equivalent units)
 * Also known as: k/μL, K/uL, thousand/μL
 */
const plateletConversions: SubstanceConversions = {
  component: 'Platelets',
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: '10^3/μL', to: 'k/μL', factor: 1 },
    { from: 'k/μL', to: '10^3/μL', factor: 1 },
  ],
};

/**
 * Neutrophil Count conversions
 */
const neutrophilConversions: SubstanceConversions = {
  component: 'Neutrophils',
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: 'cells/μL', to: '10^9/L', factor: 0.000001 },
    { from: '10^9/L', to: 'cells/μL', factor: 1000000 },
  ],
};

/**
 * Lymphocyte Count conversions
 */
const lymphocyteConversions: SubstanceConversions = {
  component: 'Lymphocytes',
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: 'cells/μL', to: '10^9/L', factor: 0.000001 },
    { from: '10^9/L', to: 'cells/μL', factor: 1000000 },
  ],
};

/**
 * Monocyte Count conversions
 */
const monocyteConversions: SubstanceConversions = {
  component: 'Monocytes',
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: 'cells/μL', to: '10^9/L', factor: 0.000001 },
    { from: '10^9/L', to: 'cells/μL', factor: 1000000 },
  ],
};

/**
 * Eosinophil Count conversions
 */
const eosinophilConversions: SubstanceConversions = {
  component: 'Eosinophils',
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: 'cells/μL', to: '10^9/L', factor: 0.000001 },
    { from: '10^9/L', to: 'cells/μL', factor: 1000000 },
  ],
};

/**
 * Basophil Count conversions
 */
const basophilConversions: SubstanceConversions = {
  component: 'Basophils',
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: 'cells/μL', to: '10^9/L', factor: 0.000001 },
    { from: '10^9/L', to: 'cells/μL', factor: 1000000 },
  ],
};

/**
 * Reticulocyte Count conversions
 */
const reticulocyteConversions: SubstanceConversions = {
  component: 'Reticulocytes',
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    // Percentage conversion - these need context of total RBC
    // Only include direct unit equivalences here
  ],
};

/**
 * Reticulocytes as a share of red cells: per mille is a tenth of a percent
 */
const reticulocytePercentageConversions: SubstanceConversions = {
  component: 'Reticulocytes/Erythrocytes',
  conversions: [
    { from: '‰', to: '%', factor: 0.1 },
    { from: '%', to: '‰', factor: 10 },
  ],
};

/**
 * Magnesium conversions
 * Molecular weight: 24.305 g/mol
 * Conversion: mg/dL × 0.4114 = mmol/L
 * Also: mEq/L × 0.5 = mmol/L (since Mg2+ is divalent)
 */
const magnesiumConversions: SubstanceConversions = {
  component: 'Magnesium',
  conversions: [
    { from: 'mg/dL', to: 'mmol/L', factor: 0.4114 },
    { from: 'mmol/L', to: 'mg/dL', factor: 2.431 },
    { from: 'mEq/L', to: 'mmol/L', factor: 0.5 },
    { from: 'mmol/L', to: 'mEq/L', factor: 2 },
    { from: 'mg/dL', to: 'mEq/L', factor: 0.8228 },
    { from: 'mEq/L', to: 'mg/dL', factor: 1.215 },
  ],
};

/**
 * Potassium conversions
 * mEq/L = mmol/L for monovalent ions
 */
const potassiumConversions: SubstanceConversions = {
  component: 'Potassium',
  conversions: [
    { from: 'mEq/L', to: 'mmol/L', factor: 1 },
    { from: 'mmol/L', to: 'mEq/L', factor: 1 },
  ],
};

/**
 * Sodium conversions
 * mEq/L = mmol/L for monovalent ions
 */
const sodiumConversions: SubstanceConversions = {
  component: 'Sodium',
  conversions: [
    { from: 'mEq/L', to: 'mmol/L', factor: 1 },
    { from: 'mmol/L', to: 'mEq/L', factor: 1 },
  ],
};

/**
 * Chloride conversions
 * mEq/L = mmol/L for monovalent ions
 */
const chlorideConversions: SubstanceConversions = {
  component: 'Chloride',
  conversions: [
    { from: 'mEq/L', to: 'mmol/L', factor: 1 },
    { from: 'mmol/L', to: 'mEq/L', factor: 1 },
  ],
};

/**
 * Phosphorus conversions
 * Molecular weight: 30.97 g/mol
 * Conversion: mg/dL × 0.3229 = mmol/L
 */
const phosphorusConversions: SubstanceConversions = {
  component: 'Phosphate',
  conversions: [
    { from: 'mg/dL', to: 'mmol/L', factor: 0.3229 },
    { from: 'mmol/L', to: 'mg/dL', factor: 3.097 },
  ],
};

/**
 * Testosterone conversions
 * Molecular weight: 288.42 g/mol
 * Conversion: ng/dL × 0.0347 = nmol/L
 */
const testosteroneConversions: SubstanceConversions = {
  component: 'Testosterone',
  conversions: [
    { from: 'ng/dL', to: 'nmol/L', factor: 0.0347 },
    { from: 'nmol/L', to: 'ng/dL', factor: 28.84 },
    { from: 'ng/mL', to: 'nmol/L', factor: 3.47 },
    { from: 'nmol/L', to: 'ng/mL', factor: 0.288 },
  ],
};

/**
 * Estradiol conversions
 * Molecular weight: 272.38 g/mol
 * Conversion: pg/mL × 3.671 = pmol/L
 */
const estradiolConversions: SubstanceConversions = {
  component: 'Estradiol',
  conversions: [
    { from: 'pg/mL', to: 'pmol/L', factor: 3.671 },
    { from: 'pmol/L', to: 'pg/mL', factor: 0.272 },
  ],
};

/**
 * PSA (Prostate Specific Antigen) conversions
 * ng/mL = μg/L (equivalent)
 */
const psaConversions: SubstanceConversions = {
  component: 'Prostate specific Ag',
  conversions: [
    { from: 'ng/mL', to: 'µg/L', factor: 1 },
    { from: 'µg/L', to: 'ng/mL', factor: 1 },
  ],
};

/**
 * CRP (C-Reactive Protein) conversions
 * mg/L = mg/dL × 10
 */
const crpConversions: SubstanceConversions = {
  component: 'C reactive protein',
  conversions: [
    { from: 'mg/L', to: 'mg/dL', factor: 0.1 },
    { from: 'mg/dL', to: 'mg/L', factor: 10 },
    { from: 'mg/L', to: 'nmol/L', factor: 9.524 }, // MW ~105 kDa
    { from: 'nmol/L', to: 'mg/L', factor: 0.105 },
  ],
};

/**
 * ESR (Erythrocyte Sedimentation Rate) conversions
 * mm/hr is the standard unit - just handle variations
 */
const esrConversions: SubstanceConversions = {
  component: 'Erythrocyte',
  property: 'Sedimentation Rate',
  conversions: [
    { from: 'mm/hr', to: 'mm/h', factor: 1 },
    { from: 'mm/h', to: 'mm/hr', factor: 1 },
  ],
};

/**
 * Hematocrit conversions
 * % to L/L (ratio): divide by 100
 */
const hematocritConversions: SubstanceConversions = {
  component: 'Erythrocyte/Blood',
  conversions: [
    { from: '%', to: 'L/L', factor: 0.01 },
    { from: '%', to: 'ratio', factor: 0.01 },
    { from: 'L/L', to: '%', factor: 100 },
    { from: 'ratio', to: '%', factor: 100 },
    { from: 'L/L', to: 'ratio', factor: 1 },
    { from: 'ratio', to: 'L/L', factor: 1 },
  ],
};

/**
 * Mean Corpuscular Volume (MCV) conversions
 * fL and µm³ are equivalent (1 fL = 1 µm³)
 */
const mcvConversions: SubstanceConversions = {
  component: 'Observation',
  property: 'EntMeanVol',
  conversions: [
    { from: 'fL', to: 'µm³', factor: 1 },
    { from: 'µm³', to: 'fL', factor: 1 },
  ],
};

/**
 * TPO Antibodies conversions
 * IU/mL, UI/mL, U/mL are equivalent
 * kIU/L = IU/mL (since 1 kIU/L = 1000 IU/L = 1 IU/mL)
 */
const tpoAntibodiesConversions: SubstanceConversions = {
  component: 'Thyroperoxidase Ab',
  conversions: [
    { from: 'IU/mL', to: 'U/mL', factor: 1 },
    { from: 'IU/mL', to: 'kIU/L', factor: 1 },
    { from: 'U/mL', to: 'IU/mL', factor: 1 },
    { from: 'U/mL', to: 'kIU/L', factor: 1 },
    { from: 'kIU/L', to: 'IU/mL', factor: 1 },
    { from: 'kIU/L', to: 'U/mL', factor: 1 },
  ],
};

/**
 * Enzyme unit conversions (ALT, AST, ALP, GGT, Amylase)
 * U/L and IU/L are equivalent
 */
const ENZYME_UNITS: UnitConversion[] = [
  { from: 'U/L', to: 'IU/L', factor: 1 },
  { from: 'IU/L', to: 'U/L', factor: 1 },
];

const enzymeConversions: SubstanceConversions[] = [
  'Alanine aminotransferase',
  'Aspartate aminotransferase',
  'Alkaline phosphatase',
  'Gamma glutamyl transferase',
  'Amylase',
].map((component) => ({ component, conversions: ENZYME_UNITS }));

/**
 * Urine Urobilinogen conversions
 * Urobilinogen MW: 590.72 g/mol
 * mg/dL × 16.9 = µmol/L
 * EU/dL (Ehrlich Units) - approximately equivalent to mg/dL
 */
const urineUrobilinogenConversions: SubstanceConversions = {
  component: 'Urobilinogen',
  conversions: [
    { from: 'mg/dL', to: 'µmol/L', factor: 16.9 },
    { from: 'mg/dL', to: 'EU/dL', factor: 1 },
    { from: 'µmol/L', to: 'mg/dL', factor: 0.0592 },
    { from: 'µmol/L', to: 'EU/dL', factor: 0.0592 },
    { from: 'EU/dL', to: 'mg/dL', factor: 1 },
    { from: 'EU/dL', to: 'µmol/L', factor: 16.9 },
  ],
};

/**
 * Total Protein conversions
 * g/dL × 10 = g/L
 */
const totalProteinConversions: SubstanceConversions = {
  component: 'Protein',
  conversions: [
    { from: 'g/dL', to: 'g/L', factor: 10 },
    { from: 'g/L', to: 'g/dL', factor: 0.1 },
    // Units urine protein is reported in
    { from: 'mg/dL', to: 'g/L', factor: 0.01 },
    { from: 'mg/dL', to: 'mg/L', factor: 10 },
    { from: 'g/L', to: 'mg/dL', factor: 100 },
    { from: 'g/L', to: 'mg/L', factor: 1000 },
    { from: 'mg/L', to: 'mg/dL', factor: 0.1 },
    { from: 'mg/L', to: 'g/L', factor: 0.001 },
  ],
};

/**
 * TIBC (Total Iron Binding Capacity) conversions
 * Iron: 1 µg/dL = 0.179 µmol/L (based on Fe atomic weight 55.845)
 */
const tibcConversions: SubstanceConversions = {
  component: 'Iron binding capacity',
  conversions: [
    { from: 'µg/dL', to: 'µmol/L', factor: 0.179 },
    { from: 'µmol/L', to: 'µg/dL', factor: 5.587 },
  ],
};

/**
 * Transferrin conversions
 * mg/dL × 0.01 = g/L
 */
const transferrinConversions: SubstanceConversions = {
  component: 'Transferrin',
  conversions: [
    { from: 'mg/dL', to: 'g/L', factor: 0.01 },
    { from: 'g/L', to: 'mg/dL', factor: 100 },
  ],
};

/**
 * Vitamin A (Retinol) conversions
 * Retinol MW: 286.45 g/mol
 * µg/dL × 0.0349 = µmol/L
 */
const vitaminAConversions: SubstanceConversions = {
  component: 'Retinol',
  conversions: [
    { from: 'µg/dL', to: 'µmol/L', factor: 0.0349 },
    { from: 'µmol/L', to: 'µg/dL', factor: 28.65 },
  ],
};

/**
 * Nucleated red blood cell conversions: per 100 white cells is a percentage,
 * and 10^3/µL is 10^9/L
 */
const nrbcPercentageConversions: SubstanceConversions = {
  component: 'Erythrocytes.nucleated/Leukocytes',
  conversions: [
    { from: '/100 WBC', to: '%', factor: 1 },
    { from: '%', to: '/100 WBC', factor: 1 },
  ],
};

const nrbcConversions: SubstanceConversions = {
  component: 'Erythrocytes.nucleated',
  conversions: [
    { from: '10^3/µL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/µL', factor: 1 },
  ],
};

/**
 * Protein Creatinine Ratio conversions
 * Based on creatinine molecular weight: 113.12 g/mol
 * Conversion: mg/mmol × (1000/113.12) = mg/g
 * Factor: 8.84 (approximately)
 */
const proteinCreatinineRatioConversions: SubstanceConversions = {
  component: 'Protein/Creatinine',
  conversions: [
    { from: 'mg/mmol', to: 'mg/g', factor: 8.84 },
    { from: 'mg/g', to: 'mg/mmol', factor: 0.1131 },
  ],
};

/**
 * Albumin Creatinine Ratio conversions
 * Same as Protein Creatinine Ratio - based on creatinine MW 113.12 g/mol
 */
const albuminCreatinineRatioConversions: SubstanceConversions = {
  component: 'Albumin/Creatinine',
  conversions: [
    { from: 'mg/mmol', to: 'mg/g', factor: 8.84 },
    { from: 'mg/g', to: 'mg/mmol', factor: 0.1131 },
  ],
};

/**
 * Time unit conversions (for semen analysis parameters like Sexual Abstinence)
 * giorni = Italian for "days"
 */
const timeConversions: SubstanceConversions = {
  component: 'Sexual abstinence duration',
  conversions: [
    { from: 'giorni', to: 'days', factor: 1 },
    { from: 'days', to: 'giorni', factor: 1 },
  ],
};

/**
 * Sperm concentration and count conversions
 * mil/mL = million/mL = 10^6/mL
 */
const spermConcentrationConversions: SubstanceConversions = {
  component: 'Spermatozoa',
  conversions: [
    { from: 'mil/mL', to: 'M/mL', factor: 1 },
    { from: 'M/mL', to: 'mil/mL', factor: 1 },
    { from: 'mil/mL', to: '10^6/mL', factor: 1 },
    { from: '10^6/mL', to: 'mil/mL', factor: 1 },
    { from: 'M/mL', to: '10^6/mL', factor: 1 },
    { from: '10^6/mL', to: 'M/mL', factor: 1 },
    // Total count
    { from: 'M', to: 'million', factor: 1 },
    { from: 'million', to: 'M', factor: 1 },
  ],
};

/**
 * All conversion definitions
 */
export const UNIT_CONVERSIONS: SubstanceConversions[] = [
  glucoseConversions,
  cholesterolConversions,
  triglyceridesConversions,
  hemoglobinConversions,
  creatinineConversions,
  bunConversions,
  ureaConversions,
  calciumConversions,
  vitaminDConversions,
  vitaminB12Conversions,
  folateConversions,
  tshConversions,
  freeT4Conversions,
  totalT4Conversions,
  freeT3Conversions,
  totalT3Conversions,
  ironConversions,
  ferritinConversions,
  bilirubinConversions,
  albuminConversions,
  hba1cConversions,
  uricAcidConversions,
  // Cell count conversions
  wbcConversions,
  rbcConversions,
  plateletConversions,
  neutrophilConversions,
  lymphocyteConversions,
  monocyteConversions,
  eosinophilConversions,
  basophilConversions,
  reticulocyteConversions,
  reticulocytePercentageConversions,
  nrbcConversions,
  nrbcPercentageConversions,
  // Electrolytes
  magnesiumConversions,
  potassiumConversions,
  sodiumConversions,
  chlorideConversions,
  phosphorusConversions,
  // Hormones
  testosteroneConversions,
  estradiolConversions,
  // Other
  psaConversions,
  crpConversions,
  esrConversions,
  // CBC indices
  hematocritConversions,
  mcvConversions,
  // Thyroid antibodies
  tpoAntibodiesConversions,
  // Kidney function
  // Enzyme conversions
  ...enzymeConversions,
  // Urinalysis
  urineUrobilinogenConversions,
  // Urinalysis ratios
  proteinCreatinineRatioConversions,
  albuminCreatinineRatioConversions,
  // Proteins
  totalProteinConversions,
  // Iron studies
  tibcConversions,
  transferrinConversions,
  // Vitamins
  vitaminAConversions,
  // Time/duration
  timeConversions,
  // Semen analysis
  spermConcentrationConversions,
];

const BY_COMPONENT = new Map<string, SubstanceConversions[]>();
for (const definition of UNIT_CONVERSIONS) {
  const key = definition.component.toLowerCase();
  BY_COMPONENT.set(key, [...(BY_COMPONENT.get(key) ?? []), definition]);
}

/** The definition for a component that applies to the substance's property */
function definitionOf(component: string, property: string | undefined): SubstanceConversions | undefined {
  return BY_COMPONENT.get(component)?.find(
    (definition) => definition.property === undefined || definition.property === property
  );
}

/**
 * The conversions for a substance. A component with a subpart uses its
 * substance's conversions when it has none of its own: "Cholesterol.in LDL"
 * and "Glucose^2H post 75 g glucose PO" convert as cholesterol and glucose.
 * A ratio of two substances ("Albumin/Creatinine") has only its own. A
 * definition for one property only ("Observation", MCV) never applies to a
 * substance of another, or of none given.
 */
export function findConversionDefinition(substance: SubstanceRef): SubstanceConversions | undefined {
  const { component, property } = asSubstance(substance);
  const key = component.trim().toLowerCase();
  const own = definitionOf(key, property);
  if (own || key.includes('/')) return own;
  return definitionOf(key.split(/[.^]/)[0], property);
}

/** The conversions of a substance that apply to its sample */
export function conversionsOf(substance: SubstanceRef): UnitConversion[] {
  const { system } = asSubstance(substance);
  return (findConversionDefinition(substance)?.conversions ?? []).filter(
    (conversion) =>
      conversion.systems === undefined || (system !== undefined && conversion.systems.includes(system))
  );
}

/** A conversion between two units: converted = value × factor + offset */
export interface LinearConversion {
  factor: number;
  offset: number;
}

/**
 * The conversion between two units for a substance
 */
export function getConversion(
  substance: SubstanceRef,
  fromUnit: string,
  toUnit: string
): LinearConversion | undefined {
  // Same unit, however spelled: no conversion needed, even for a test with none
  if (unitsMatch(fromUnit, toUnit)) return { factor: 1, offset: 0 };
  const conversions = conversionsOf(substance);

  const direct = conversions.find(
    (c) => unitsMatch(c.from, fromUnit) && unitsMatch(c.to, toUnit)
  );
  if (direct) return { factor: direct.factor, offset: direct.offset ?? 0 };

  // No direct pair (e.g. hemoglobin mmol/L → g/L): chain two known conversions
  // through a shared unit (mmol/L → g/dL → g/L)
  for (const first of conversions) {
    if (!unitsMatch(first.from, fromUnit)) continue;
    const second = conversions.find(
      (c) => unitsMatch(c.from, first.to) && unitsMatch(c.to, toUnit)
    );
    if (second) {
      return {
        factor: first.factor * second.factor,
        offset: (first.offset ?? 0) * second.factor + (second.offset ?? 0),
      };
    }
  }
  // Units of one dimension convert as UCUM says, for any test: g/dL → g/L
  return ucumConversion(fromUnit, toUnit);
}

/**
 * The multiplying factor between two units, for conversions that are plain
 * ratios; undefined when there is no conversion or it has an offset
 */
export function getConversionFactor(
  substance: SubstanceRef,
  fromUnit: string,
  toUnit: string
): number | undefined {
  const conversion = getConversion(substance, fromUnit, toUnit);
  return conversion && conversion.offset === 0 ? conversion.factor : undefined;
}
