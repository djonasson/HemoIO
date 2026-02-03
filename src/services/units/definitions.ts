/**
 * Unit Conversion Definitions
 *
 * This module defines conversion factors between different units
 * used in laboratory medicine.
 *
 * Conversion factors are organized by biomarker or biomarker group
 * since the same unit names can have different conversion factors
 * for different substances (e.g., mg/dL to mmol/L varies by substance).
 */

import { findBiomarker } from '../../data/biomarkers/dictionary';

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
}

/**
 * Biomarker-specific conversion definitions
 */
export interface BiomarkerConversions {
  /** Biomarker name or group identifier */
  biomarker: string;
  /** Alternative names that use these same conversions */
  aliases: string[];
  /** Available unit conversions */
  conversions: UnitConversion[];
}

/**
 * Glucose conversions
 * Molecular weight: ~180.16 g/mol
 * Conversion: mg/dL × 0.0555 = mmol/L
 */
const glucoseConversions: BiomarkerConversions = {
  biomarker: 'Glucose',
  aliases: ['Blood Sugar', 'Fasting Glucose', 'FBG', 'Blood Glucose'],
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
const cholesterolConversions: BiomarkerConversions = {
  biomarker: 'Cholesterol',
  aliases: [
    'Total Cholesterol', 'TC', 'Chol',
    'LDL Cholesterol', 'LDL', 'LDL-C',
    'HDL Cholesterol', 'HDL', 'HDL-C',
    'VLDL Cholesterol', 'VLDL', 'VLDL-C',
    'Non-HDL Cholesterol', 'Non-HDL', 'Non-HDL-C',
  ],
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
const triglyceridesConversions: BiomarkerConversions = {
  biomarker: 'Triglycerides',
  aliases: ['TG', 'Trigs', 'TRIG'],
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
const hemoglobinConversions: BiomarkerConversions = {
  biomarker: 'Hemoglobin',
  aliases: ['Hgb', 'Hb', 'HGB'],
  conversions: [
    { from: 'g/dL', to: 'g/L', factor: 10 },
    { from: 'g/L', to: 'g/dL', factor: 0.1 },
    { from: 'g/dL', to: 'mmol/L', factor: 0.6206 },
    { from: 'mmol/L', to: 'g/dL', factor: 1.611 },
  ],
};

/**
 * Creatinine conversions
 * Molecular weight: 113.12 g/mol
 * Conversion: mg/dL × 88.4 = µmol/L
 */
const creatinineConversions: BiomarkerConversions = {
  biomarker: 'Creatinine',
  aliases: ['Creat', 'Serum Creatinine'],
  conversions: [
    { from: 'mg/dL', to: 'µmol/L', factor: 88.4 },
    { from: 'µmol/L', to: 'mg/dL', factor: 0.0113 },
  ],
};

/**
 * BUN (Blood Urea Nitrogen) conversions
 * Molecular weight of urea: 60.06 g/mol, BUN is the nitrogen portion
 * Conversion: mg/dL × 0.357 = mmol/L
 */
const bunConversions: BiomarkerConversions = {
  biomarker: 'Blood Urea Nitrogen',
  aliases: ['BUN', 'Urea Nitrogen', 'Urea'],
  conversions: [
    { from: 'mg/dL', to: 'mmol/L', factor: 0.357 },
    { from: 'mmol/L', to: 'mg/dL', factor: 2.8 },
  ],
};

/**
 * Calcium conversions
 * Molecular weight: 40.08 g/mol
 * Conversion: mg/dL × 0.25 = mmol/L
 */
const calciumConversions: BiomarkerConversions = {
  biomarker: 'Calcium',
  aliases: ['Ca', 'Ca++', 'Serum Calcium', 'Total Calcium'],
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
const vitaminDConversions: BiomarkerConversions = {
  biomarker: 'Vitamin D',
  aliases: ['25-OH Vitamin D', '25-Hydroxyvitamin D', 'Calcidiol', 'Vitamin D Total'],
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
const vitaminB12Conversions: BiomarkerConversions = {
  biomarker: 'Vitamin B12',
  aliases: ['B12', 'Cobalamin', 'Cyanocobalamin'],
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
const folateConversions: BiomarkerConversions = {
  biomarker: 'Folate',
  aliases: ['Folic Acid', 'Vitamin B9', 'Serum Folate'],
  conversions: [
    { from: 'ng/mL', to: 'nmol/L', factor: 2.266 },
    { from: 'nmol/L', to: 'ng/mL', factor: 0.441 },
  ],
};

/**
 * TSH conversions
 * mIU/L and µIU/mL are equivalent
 * μUI/mL is also equivalent (alternate notation)
 */
const tshConversions: BiomarkerConversions = {
  biomarker: 'Thyroid Stimulating Hormone',
  aliases: ['TSH', 'Thyrotropin'],
  conversions: [
    { from: 'mIU/L', to: 'µIU/mL', factor: 1 },
    { from: 'µIU/mL', to: 'mIU/L', factor: 1 },
    { from: 'mIU/L', to: 'mU/L', factor: 1 },
    { from: 'mU/L', to: 'mIU/L', factor: 1 },
    // μUI/mL variant (common in Italian reports)
    { from: 'μUI/mL', to: 'mIU/L', factor: 1 },
    { from: 'mIU/L', to: 'μUI/mL', factor: 1 },
    { from: 'μUI/mL', to: 'µIU/mL', factor: 1 },
    { from: 'µIU/mL', to: 'μUI/mL', factor: 1 },
    { from: 'μUI/mL', to: 'mU/L', factor: 1 },
    { from: 'mU/L', to: 'μUI/mL', factor: 1 },
    // uIU/mL variant (ASCII approximation)
    { from: 'uIU/mL', to: 'mIU/L', factor: 1 },
    { from: 'mIU/L', to: 'uIU/mL', factor: 1 },
    { from: 'uIU/mL', to: 'µIU/mL', factor: 1 },
    { from: 'µIU/mL', to: 'uIU/mL', factor: 1 },
  ],
};

/**
 * Free T4 conversions
 * Molecular weight: 776.87 g/mol
 * Conversion: ng/dL × 12.87 = pmol/L
 */
const freeT4Conversions: BiomarkerConversions = {
  biomarker: 'Free T4',
  aliases: ['FT4', 'Free Thyroxine', 'Thyroxine Free'],
  conversions: [
    { from: 'ng/dL', to: 'pmol/L', factor: 12.87 },
    { from: 'pmol/L', to: 'ng/dL', factor: 0.0777 },
  ],
};

/**
 * Total T4 conversions
 * Conversion: µg/dL × 12.87 = nmol/L
 */
const totalT4Conversions: BiomarkerConversions = {
  biomarker: 'Total T4',
  aliases: ['T4', 'Thyroxine', 'Serum T4'],
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
const freeT3Conversions: BiomarkerConversions = {
  biomarker: 'Free T3',
  aliases: ['FT3', 'Free Triiodothyronine'],
  conversions: [
    { from: 'pg/mL', to: 'pmol/L', factor: 1.536 },
    { from: 'pmol/L', to: 'pg/mL', factor: 0.651 },
  ],
};

/**
 * Total T3 conversions
 * Conversion: ng/dL × 0.01536 = nmol/L
 */
const totalT3Conversions: BiomarkerConversions = {
  biomarker: 'Total T3',
  aliases: ['T3', 'Triiodothyronine'],
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
const ironConversions: BiomarkerConversions = {
  biomarker: 'Serum Iron',
  aliases: ['Iron', 'Fe', 'Iron Level'],
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
const ferritinConversions: BiomarkerConversions = {
  biomarker: 'Ferritin',
  aliases: ['Serum Ferritin'],
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
const bilirubinConversions: BiomarkerConversions = {
  biomarker: 'Bilirubin',
  aliases: ['Total Bilirubin', 'TBIL', 'Bilirubin Total', 'Direct Bilirubin', 'DBIL'],
  conversions: [
    { from: 'mg/dL', to: 'µmol/L', factor: 17.1 },
    { from: 'µmol/L', to: 'mg/dL', factor: 0.0585 },
  ],
};

/**
 * Albumin conversions
 * Conversion: g/dL × 10 = g/L
 */
const albuminConversions: BiomarkerConversions = {
  biomarker: 'Albumin',
  aliases: ['Serum Albumin', 'ALB'],
  conversions: [
    { from: 'g/dL', to: 'g/L', factor: 10 },
    { from: 'g/L', to: 'g/dL', factor: 0.1 },
  ],
};

/**
 * HbA1c conversions
 * NGSP (%) to IFCC (mmol/mol)
 * Formula: IFCC = (NGSP - 2.15) × 10.929
 * Simplified factor for approximation
 */
const hba1cConversions: BiomarkerConversions = {
  biomarker: 'Hemoglobin A1c',
  aliases: ['HbA1c', 'A1C', 'Glycated Hemoglobin', 'Glycohemoglobin'],
  conversions: [
    // These are approximations; actual conversion is non-linear
    { from: '%', to: 'mmol/mol', factor: 10.929 },
    { from: 'mmol/mol', to: '%', factor: 0.0915 },
  ],
};

/**
 * Uric Acid conversions
 * Molecular weight: 168.11 g/mol
 * Conversion: mg/dL × 59.48 = µmol/L
 */
const uricAcidConversions: BiomarkerConversions = {
  biomarker: 'Uric Acid',
  aliases: ['Urate', 'Serum Uric Acid'],
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
const wbcConversions: BiomarkerConversions = {
  biomarker: 'White Blood Cell Count',
  aliases: ['WBC', 'Leukocytes', 'White Blood Cells', 'WBC Count'],
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: '10^3/µL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/µL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: 'K/uL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'K/uL', factor: 1 },
    { from: '10^3/μL', to: 'k/μL', factor: 1 },
    { from: 'k/μL', to: '10^3/μL', factor: 1 },
    // cells/μL to 10^9/L: divide by 10^6
    { from: 'cells/μL', to: '10^9/L', factor: 0.000001 },
    { from: '10^9/L', to: 'cells/μL', factor: 1000000 },
  ],
};

/**
 * Red Blood Cell Count conversions
 * 10^6/μL = 10^12/L (equivalent units)
 * Also known as: M/μL, million/μL
 */
const rbcConversions: BiomarkerConversions = {
  biomarker: 'Red Blood Cell Count',
  aliases: ['RBC', 'Erythrocytes', 'Red Blood Cells', 'RBC Count'],
  conversions: [
    { from: '10^6/μL', to: '10^12/L', factor: 1 },
    { from: '10^12/L', to: '10^6/μL', factor: 1 },
    { from: '10^6/µL', to: '10^12/L', factor: 1 },
    { from: '10^12/L', to: '10^6/µL', factor: 1 },
    { from: 'M/μL', to: '10^12/L', factor: 1 },
    { from: '10^12/L', to: 'M/μL', factor: 1 },
    { from: 'M/uL', to: '10^12/L', factor: 1 },
    { from: '10^12/L', to: 'M/uL', factor: 1 },
    { from: '10^6/μL', to: 'M/μL', factor: 1 },
    { from: 'M/μL', to: '10^6/μL', factor: 1 },
  ],
};

/**
 * Platelet Count conversions
 * 10^3/μL = 10^9/L (equivalent units)
 * Also known as: k/μL, K/uL, thousand/μL
 */
const plateletConversions: BiomarkerConversions = {
  biomarker: 'Platelet Count',
  aliases: ['PLT', 'Platelets', 'Thrombocytes', 'PLT Count'],
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: '10^3/µL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/µL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: 'K/uL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'K/uL', factor: 1 },
    { from: '10^3/μL', to: 'k/μL', factor: 1 },
    { from: 'k/μL', to: '10^3/μL', factor: 1 },
  ],
};

/**
 * Neutrophil Count conversions
 */
const neutrophilConversions: BiomarkerConversions = {
  biomarker: 'Neutrophil Count',
  aliases: ['Neutrophils', 'Absolute Neutrophil Count', 'ANC', 'Neutrophils Absolute'],
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: '10^3/µL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/µL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: 'cells/μL', to: '10^9/L', factor: 0.000001 },
    { from: '10^9/L', to: 'cells/μL', factor: 1000000 },
  ],
};

/**
 * Lymphocyte Count conversions
 */
const lymphocyteConversions: BiomarkerConversions = {
  biomarker: 'Lymphocyte Count',
  aliases: ['Lymphocytes', 'Absolute Lymphocyte Count', 'Lymphocytes Absolute'],
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: '10^3/µL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/µL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: 'cells/μL', to: '10^9/L', factor: 0.000001 },
    { from: '10^9/L', to: 'cells/μL', factor: 1000000 },
  ],
};

/**
 * Monocyte Count conversions
 */
const monocyteConversions: BiomarkerConversions = {
  biomarker: 'Monocyte Count',
  aliases: ['Monocytes', 'Absolute Monocyte Count', 'Monocytes Absolute'],
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: '10^3/µL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/µL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: 'cells/μL', to: '10^9/L', factor: 0.000001 },
    { from: '10^9/L', to: 'cells/μL', factor: 1000000 },
  ],
};

/**
 * Eosinophil Count conversions
 */
const eosinophilConversions: BiomarkerConversions = {
  biomarker: 'Eosinophil Count',
  aliases: ['Eosinophils', 'Absolute Eosinophil Count', 'Eosinophils Absolute'],
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: '10^3/µL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/µL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: 'cells/μL', to: '10^9/L', factor: 0.000001 },
    { from: '10^9/L', to: 'cells/μL', factor: 1000000 },
  ],
};

/**
 * Basophil Count conversions
 */
const basophilConversions: BiomarkerConversions = {
  biomarker: 'Basophil Count',
  aliases: ['Basophils', 'Absolute Basophil Count', 'Basophils Absolute'],
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: '10^3/µL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/µL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    { from: 'cells/μL', to: '10^9/L', factor: 0.000001 },
    { from: '10^9/L', to: 'cells/μL', factor: 1000000 },
  ],
};

/**
 * Reticulocyte Count conversions
 */
const reticulocyteConversions: BiomarkerConversions = {
  biomarker: 'Reticulocyte Count',
  aliases: ['Reticulocytes', 'Retics', 'Reticulocyte Absolute'],
  conversions: [
    { from: '10^3/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/μL', factor: 1 },
    { from: '10^3/µL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: '10^3/µL', factor: 1 },
    { from: 'k/μL', to: '10^9/L', factor: 1 },
    { from: '10^9/L', to: 'k/μL', factor: 1 },
    // Percentage conversion - these need context of total RBC
    // Only include direct unit equivalences here
  ],
};

/**
 * Magnesium conversions
 * Molecular weight: 24.305 g/mol
 * Conversion: mg/dL × 0.4114 = mmol/L
 * Also: mEq/L × 0.5 = mmol/L (since Mg2+ is divalent)
 */
const magnesiumConversions: BiomarkerConversions = {
  biomarker: 'Magnesium',
  aliases: ['Mg', 'Serum Magnesium', 'Mg++'],
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
const potassiumConversions: BiomarkerConversions = {
  biomarker: 'Potassium',
  aliases: ['K', 'K+', 'Serum Potassium'],
  conversions: [
    { from: 'mEq/L', to: 'mmol/L', factor: 1 },
    { from: 'mmol/L', to: 'mEq/L', factor: 1 },
  ],
};

/**
 * Sodium conversions
 * mEq/L = mmol/L for monovalent ions
 */
const sodiumConversions: BiomarkerConversions = {
  biomarker: 'Sodium',
  aliases: ['Na', 'Na+', 'Serum Sodium'],
  conversions: [
    { from: 'mEq/L', to: 'mmol/L', factor: 1 },
    { from: 'mmol/L', to: 'mEq/L', factor: 1 },
  ],
};

/**
 * Chloride conversions
 * mEq/L = mmol/L for monovalent ions
 */
const chlorideConversions: BiomarkerConversions = {
  biomarker: 'Chloride',
  aliases: ['Cl', 'Cl-', 'Serum Chloride'],
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
const phosphorusConversions: BiomarkerConversions = {
  biomarker: 'Phosphorus',
  aliases: ['Phosphate', 'P', 'Inorganic Phosphorus', 'Serum Phosphorus'],
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
const testosteroneConversions: BiomarkerConversions = {
  biomarker: 'Testosterone',
  aliases: ['Total Testosterone', 'Testosterone Total', 'Free Testosterone', 'Testosterone Free'],
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
const estradiolConversions: BiomarkerConversions = {
  biomarker: 'Estradiol',
  aliases: ['E2', 'Estrogen', '17-beta Estradiol'],
  conversions: [
    { from: 'pg/mL', to: 'pmol/L', factor: 3.671 },
    { from: 'pmol/L', to: 'pg/mL', factor: 0.272 },
  ],
};

/**
 * PSA (Prostate Specific Antigen) conversions
 * ng/mL = μg/L (equivalent)
 */
const psaConversions: BiomarkerConversions = {
  biomarker: 'Prostate Specific Antigen',
  aliases: ['PSA', 'Total PSA', 'PSA Total', 'Free PSA'],
  conversions: [
    { from: 'ng/mL', to: 'µg/L', factor: 1 },
    { from: 'µg/L', to: 'ng/mL', factor: 1 },
  ],
};

/**
 * CRP (C-Reactive Protein) conversions
 * mg/L = mg/dL × 10
 */
const crpConversions: BiomarkerConversions = {
  biomarker: 'C-Reactive Protein',
  aliases: ['CRP', 'hs-CRP', 'High Sensitivity CRP'],
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
const esrConversions: BiomarkerConversions = {
  biomarker: 'Erythrocyte Sedimentation Rate',
  aliases: ['ESR', 'Sed Rate', 'Sedimentation Rate'],
  conversions: [
    { from: 'mm/hr', to: 'mm/h', factor: 1 },
    { from: 'mm/h', to: 'mm/hr', factor: 1 },
  ],
};

/**
 * Hematocrit conversions
 * % to L/L (ratio): divide by 100
 */
const hematocritConversions: BiomarkerConversions = {
  biomarker: 'Hematocrit',
  aliases: ['Hct', 'HCT', 'PCV', 'Packed Cell Volume', 'Ematocrito'],
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
const mcvConversions: BiomarkerConversions = {
  biomarker: 'Mean Corpuscular Volume',
  aliases: ['MCV', 'Volume Globulare Medio', 'Volume Corpuscolare Medio'],
  conversions: [
    { from: 'fL', to: 'µm³', factor: 1 },
    { from: 'µm³', to: 'fL', factor: 1 },
  ],
};

/**
 * Mean Corpuscular Hemoglobin (MCH) conversions
 * pg to fmol: Hemoglobin MW ~64,458 g/mol (tetramer)
 * 1 pg = 1/64.458 fmol ≈ 0.01552 fmol
 */
const mchConversions: BiomarkerConversions = {
  biomarker: 'Mean Corpuscular Hemoglobin',
  aliases: ['MCH', 'Contenuto Medio di Hb', 'Contenuto Emoglobinico Corpuscolare Medio'],
  conversions: [
    { from: 'pg', to: 'fmol', factor: 0.01552 },
    { from: 'fmol', to: 'pg', factor: 64.458 },
  ],
};

/**
 * Mean Corpuscular Hemoglobin Concentration (MCHC) conversions
 * g/dL × 10 = g/L
 * Note: % conversion is complex and context-dependent, so only handling g/dL ↔ g/L
 */
const mchcConversions: BiomarkerConversions = {
  biomarker: 'Mean Corpuscular Hemoglobin Concentration',
  aliases: ['MCHC', 'Concentrazione Media di Hb', 'Concentrazione Emoglobinica Corpuscolare Media'],
  conversions: [
    { from: 'g/dL', to: 'g/L', factor: 10 },
    { from: 'g/L', to: 'g/dL', factor: 0.1 },
  ],
};

/**
 * TPO Antibodies conversions
 * IU/mL, UI/mL, U/mL are equivalent
 * kIU/L = IU/mL (since 1 kIU/L = 1000 IU/L = 1 IU/mL)
 */
const tpoAntibodiesConversions: BiomarkerConversions = {
  biomarker: 'TPO Antibodies',
  aliases: ['Anti-TPO', 'Thyroid Peroxidase Antibodies', 'TPOAb', 'Anticorpi anti Tireoperossidasi'],
  conversions: [
    { from: 'IU/mL', to: 'UI/mL', factor: 1 },
    { from: 'IU/mL', to: 'U/mL', factor: 1 },
    { from: 'IU/mL', to: 'kIU/L', factor: 1 },
    { from: 'UI/mL', to: 'IU/mL', factor: 1 },
    { from: 'UI/mL', to: 'U/mL', factor: 1 },
    { from: 'UI/mL', to: 'kIU/L', factor: 1 },
    { from: 'U/mL', to: 'IU/mL', factor: 1 },
    { from: 'U/mL', to: 'UI/mL', factor: 1 },
    { from: 'U/mL', to: 'kIU/L', factor: 1 },
    { from: 'kIU/L', to: 'IU/mL', factor: 1 },
    { from: 'kIU/L', to: 'UI/mL', factor: 1 },
    { from: 'kIU/L', to: 'U/mL', factor: 1 },
  ],
};

/**
 * eGFR conversions
 * Handle notation variants (comma vs period, superscript)
 */
const egfrConversions: BiomarkerConversions = {
  biomarker: 'eGFR',
  aliases: ['Estimated GFR', 'Glomerular Filtration Rate', 'GFR', 'Filtrato Glomerulare', 'VFG'],
  conversions: [
    { from: 'mL/min/1.73m²', to: 'mL/min/1,73m²', factor: 1 },
    { from: 'mL/min/1.73m²', to: 'mL/min/1,73m^2', factor: 1 },
    { from: 'mL/min/1,73m²', to: 'mL/min/1.73m²', factor: 1 },
    { from: 'mL/min/1,73m²', to: 'mL/min/1,73m^2', factor: 1 },
    { from: 'mL/min/1,73m^2', to: 'mL/min/1.73m²', factor: 1 },
    { from: 'mL/min/1,73m^2', to: 'mL/min/1,73m²', factor: 1 },
  ],
};

/**
 * Enzyme unit conversions (ALT, AST, ALP, GGT, Amylase)
 * U/L and IU/L are equivalent
 */
const enzymeConversions: BiomarkerConversions = {
  biomarker: 'Alanine Aminotransferase',
  aliases: ['ALT', 'SGPT', 'Alanine Transaminase', 'GPT', 'ALT (GPT)',
            'Aspartate Aminotransferase', 'AST', 'SGOT', 'Aspartate Transaminase', 'GOT', 'AST (GOT)',
            'Alkaline Phosphatase', 'ALP', 'Alk Phos',
            'Gamma-Glutamyl Transferase', 'GGT', 'Gamma GT', 'GGTP',
            'Amylase', 'S-Amilasi', 'Amilasi'],
  conversions: [
    { from: 'U/L', to: 'IU/L', factor: 1 },
    { from: 'IU/L', to: 'U/L', factor: 1 },
  ],
};

/**
 * Urine Glucose conversions
 * Glucose MW: 180.16 g/mol
 * mg/dL × 0.0555 = mmol/L
 */
const urineGlucoseConversions: BiomarkerConversions = {
  biomarker: 'Urine Glucose',
  aliases: ['U-Glucosio', 'Glucosio Urinario', 'Glucosio (urine)', 'Glycosuria'],
  conversions: [
    { from: 'mg/dL', to: 'mmol/L', factor: 0.0555 },
    { from: 'mmol/L', to: 'mg/dL', factor: 18.02 },
  ],
};

/**
 * Urine Protein conversions
 * mg/dL × 0.01 = g/L; mg/dL × 10 = mg/L
 */
const urineProteinConversions: BiomarkerConversions = {
  biomarker: 'Urine Protein',
  aliases: ['U-Proteine', 'Proteine (urine)', 'Proteinuria', 'U-Proteine totali'],
  conversions: [
    { from: 'mg/dL', to: 'g/L', factor: 0.01 },
    { from: 'mg/dL', to: 'mg/L', factor: 10 },
    { from: 'g/L', to: 'mg/dL', factor: 100 },
    { from: 'g/L', to: 'mg/L', factor: 1000 },
    { from: 'mg/L', to: 'mg/dL', factor: 0.1 },
    { from: 'mg/L', to: 'g/L', factor: 0.001 },
  ],
};

/**
 * Urine Bilirubin conversions
 * Bilirubin MW: 584.66 g/mol
 * mg/dL × 17.1 = µmol/L
 */
const urineBilirubinConversions: BiomarkerConversions = {
  biomarker: 'Urine Bilirubin',
  aliases: ['U-Bilirubina', 'Bilirubina (urine)', 'Bilirubina urinaria'],
  conversions: [
    { from: 'mg/dL', to: 'µmol/L', factor: 17.1 },
    { from: 'µmol/L', to: 'mg/dL', factor: 0.0585 },
  ],
};

/**
 * Urine Urobilinogen conversions
 * Urobilinogen MW: 590.72 g/mol
 * mg/dL × 16.9 = µmol/L
 * EU/dL (Ehrlich Units) - approximately equivalent to mg/dL
 */
const urineUrobilinogenConversions: BiomarkerConversions = {
  biomarker: 'Urine Urobilinogen',
  aliases: ['U-Urobilinogeno', 'Urobilinogeno', 'Urobilinogeno (urine)'],
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
 * Microalbumin / Urine Albumin conversions
 * mg/L is the base unit; also handle ratio units
 */
const microalbuminConversions: BiomarkerConversions = {
  biomarker: 'Microalbumin',
  aliases: ['Urine Microalbumin', 'MAU', 'Microalbumina', 'U-Albumina', 'U-ALBUMINA'],
  conversions: [
    // mg/L ↔ µg/min (assuming 1440 min/day and ~1.5L urine/day average)
    // This is an approximation: mg/L × 1.04 ≈ µg/min
    { from: 'mg/L', to: 'µg/min', factor: 1.04 },
    { from: 'µg/min', to: 'mg/L', factor: 0.96 },
  ],
};

/**
 * Total Protein conversions
 * g/dL × 10 = g/L
 */
const totalProteinConversions: BiomarkerConversions = {
  biomarker: 'Total Protein',
  aliases: ['Protein Total', 'TP', 'Serum Protein', 'Proteine totali', 'Protidemia'],
  conversions: [
    { from: 'g/dL', to: 'g/L', factor: 10 },
    { from: 'g/L', to: 'g/dL', factor: 0.1 },
  ],
};

/**
 * TIBC (Total Iron Binding Capacity) conversions
 * Iron: 1 µg/dL = 0.179 µmol/L (based on Fe atomic weight 55.845)
 */
const tibcConversions: BiomarkerConversions = {
  biomarker: 'Total Iron Binding Capacity',
  aliases: ['TIBC', 'Iron Binding Capacity'],
  conversions: [
    { from: 'µg/dL', to: 'µmol/L', factor: 0.179 },
    { from: 'µmol/L', to: 'µg/dL', factor: 5.587 },
  ],
};

/**
 * Transferrin conversions
 * mg/dL × 0.01 = g/L
 */
const transferrinConversions: BiomarkerConversions = {
  biomarker: 'Transferrin',
  aliases: ['Serum Transferrin'],
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
const vitaminAConversions: BiomarkerConversions = {
  biomarker: 'Vitamin A',
  aliases: ['Retinol', 'Serum Retinol'],
  conversions: [
    { from: 'µg/dL', to: 'µmol/L', factor: 0.0349 },
    { from: 'µmol/L', to: 'µg/dL', factor: 28.65 },
  ],
};

/**
 * Urine Creatinine conversions
 * Molecular weight: 113.12 g/mol
 * Conversion factors:
 * - mg/dL × 88.4 = µmol/L
 * - mg/dL × 0.01 = g/L
 * - µmol/L × 0.00011312 = g/L (since 113.12 µg = 1 µmol)
 */
const urineCreatinineConversions: BiomarkerConversions = {
  biomarker: 'Urine Creatinine',
  aliases: ['U-Creatinina', 'Creatinina urinaria'],
  conversions: [
    // mg/dL conversions
    { from: 'mg/dL', to: 'µmol/L', factor: 88.4 },
    { from: 'mg/dL', to: 'g/L', factor: 0.01 },
    { from: 'mg/dL', to: 'mmol/L', factor: 0.0884 },
    // µmol/L conversions
    { from: 'µmol/L', to: 'mg/dL', factor: 0.0113 },
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
  ],
};

/**
 * Protein Creatinine Ratio conversions
 * Based on creatinine molecular weight: 113.12 g/mol
 * Conversion: mg/mmol × (1000/113.12) = mg/g
 * Factor: 8.84 (approximately)
 */
const proteinCreatinineRatioConversions: BiomarkerConversions = {
  biomarker: 'Protein Creatinine Ratio',
  aliases: ['PCR', 'U-Proteine/Creatinina', 'Proteine/Creatinina'],
  conversions: [
    { from: 'mg/mmol', to: 'mg/g', factor: 8.84 },
    { from: 'mg/mmolcreat.', to: 'mg/g', factor: 8.84 },
    { from: 'mg/mmol creat.', to: 'mg/g', factor: 8.84 },
    { from: 'mg/g', to: 'mg/mmol', factor: 0.1131 },
    { from: 'mg/gcreat.', to: 'mg/mmol', factor: 0.1131 },
    { from: 'mg/g creat.', to: 'mg/mmol', factor: 0.1131 },
    { from: 'mg/g creat', to: 'mg/mmol', factor: 0.1131 },
    // Cross conversions between creat. variants
    { from: 'mg/mmolcreat.', to: 'mg/gcreat.', factor: 8.84 },
    { from: 'mg/gcreat.', to: 'mg/mmolcreat.', factor: 0.1131 },
  ],
};

/**
 * Albumin Creatinine Ratio conversions
 * Same as Protein Creatinine Ratio - based on creatinine MW 113.12 g/mol
 */
const albuminCreatinineRatioConversions: BiomarkerConversions = {
  biomarker: 'Albumin Creatinine Ratio',
  aliases: ['ACR', 'UACR', 'Albumina/Creatinina', 'U-Albumina/Creatinina'],
  conversions: [
    { from: 'mg/mmol', to: 'mg/g', factor: 8.84 },
    { from: 'mg/mmol creat.', to: 'mg/g', factor: 8.84 },
    { from: 'mg/g', to: 'mg/mmol', factor: 0.1131 },
    { from: 'mg/g creat.', to: 'mg/mmol', factor: 0.1131 },
    { from: 'mg/g creat', to: 'mg/mmol', factor: 0.1131 },
  ],
};

/**
 * All conversion definitions
 */
export const UNIT_CONVERSIONS: BiomarkerConversions[] = [
  glucoseConversions,
  cholesterolConversions,
  triglyceridesConversions,
  hemoglobinConversions,
  creatinineConversions,
  bunConversions,
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
  mchConversions,
  mchcConversions,
  // Thyroid antibodies
  tpoAntibodiesConversions,
  // Kidney function
  egfrConversions,
  // Enzyme conversions
  enzymeConversions,
  // Urinalysis
  urineCreatinineConversions,
  urineGlucoseConversions,
  urineProteinConversions,
  urineBilirubinConversions,
  urineUrobilinogenConversions,
  microalbuminConversions,
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
];

/**
 * Find conversion definition for a biomarker
 * Also checks the biomarker dictionary for aliases to find the canonical name
 */
export function findConversionDefinition(
  biomarkerName: string
): BiomarkerConversions | undefined {
  const searchTerm = biomarkerName.toLowerCase().trim();

  // First, try direct lookup in conversion definitions
  const directMatch = UNIT_CONVERSIONS.find(
    (conv) =>
      conv.biomarker.toLowerCase() === searchTerm ||
      conv.aliases.some((a) => a.toLowerCase() === searchTerm)
  );

  if (directMatch) return directMatch;

  // If not found, try to find the canonical name via the biomarker dictionary
  // This handles cases where Italian aliases like "P-Creatinina (metodo enzimatico)"
  // need to be mapped to "Creatinine" for conversion lookup
  const biomarkerDef = findBiomarker(biomarkerName);
  if (biomarkerDef) {
    const canonicalName = biomarkerDef.name.toLowerCase();
    return UNIT_CONVERSIONS.find(
      (conv) =>
        conv.biomarker.toLowerCase() === canonicalName ||
        conv.aliases.some((a) => a.toLowerCase() === canonicalName)
    );
  }

  return undefined;
}

/**
 * Normalize unit strings to canonical form
 * Handles common variations like ASCII 'u' vs Unicode 'µ'
 */
const UNIT_NORMALIZATIONS: Record<string, string> = {
  'umol/l': 'µmol/L',
  'umol/L': 'µmol/L',
  'µmol/l': 'µmol/L',
  'nmol/l': 'nmol/L',
  'pmol/l': 'pmol/L',
  'mg/dl': 'mg/dL',
  'mmol/l': 'mmol/L',
  'g/dl': 'g/dL',
  'g/l': 'g/L',
  'ng/ml': 'ng/mL',
  'pg/ml': 'pg/mL',
  'ug/dl': 'µg/dL',
  'ug/dL': 'µg/dL',
  'µg/dl': 'µg/dL',
  'miu/l': 'mIU/L',
  'mIU/l': 'mIU/L',
  'uiu/ml': 'µIU/mL',
  'µiu/ml': 'µIU/mL',
  'u/l': 'U/L',
  'iu/l': 'IU/L',
  'meq/l': 'mEq/L',
  'ug/min': 'µg/min',
};

function normalizeUnitForLookup(unit: string): string {
  const trimmed = unit.trim();
  const lowercased = trimmed.toLowerCase();
  return UNIT_NORMALIZATIONS[lowercased] ?? UNIT_NORMALIZATIONS[trimmed] ?? trimmed;
}

/**
 * Get conversion factor between two units for a biomarker
 */
export function getConversionFactor(
  biomarkerName: string,
  fromUnit: string,
  toUnit: string
): number | undefined {
  const definition = findConversionDefinition(biomarkerName);
  if (!definition) return undefined;

  // Normalize units to handle variations like umol/L vs µmol/L
  const normalizedFrom = normalizeUnitForLookup(fromUnit);
  const normalizedTo = normalizeUnitForLookup(toUnit);

  // Same unit, no conversion needed
  if (normalizedFrom.toLowerCase() === normalizedTo.toLowerCase()) return 1;

  const conversion = definition.conversions.find(
    (c) =>
      c.from.toLowerCase() === normalizedFrom.toLowerCase() &&
      c.to.toLowerCase() === normalizedTo.toLowerCase()
  );

  return conversion?.factor;
}
