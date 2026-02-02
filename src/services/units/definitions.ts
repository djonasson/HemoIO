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
    { from: 'mg/dL', to: 'umol/L', factor: 88.4 },
    { from: 'µmol/L', to: 'mg/dL', factor: 0.0113 },
    { from: 'umol/L', to: 'mg/dL', factor: 0.0113 },
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
  aliases: ['Iron', 'Fe', 'Iron Level', 'Total Iron Binding Capacity', 'TIBC'],
  conversions: [
    { from: 'µg/dL', to: 'µmol/L', factor: 0.179 },
    { from: 'µmol/L', to: 'µg/dL', factor: 5.587 },
    { from: 'ug/dL', to: 'umol/L', factor: 0.179 },
    { from: 'umol/L', to: 'ug/dL', factor: 5.587 },
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
    { from: 'mg/dL', to: 'umol/L', factor: 17.1 },
    { from: 'umol/L', to: 'mg/dL', factor: 0.0585 },
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
    { from: 'mg/dL', to: 'umol/L', factor: 59.48 },
    { from: 'umol/L', to: 'mg/dL', factor: 0.0168 },
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
    { from: 'ng/mL', to: 'μg/L', factor: 1 },
    { from: 'μg/L', to: 'ng/mL', factor: 1 },
    { from: 'ng/mL', to: 'ug/L', factor: 1 },
    { from: 'ug/L', to: 'ng/mL', factor: 1 },
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
];

/**
 * Find conversion definition for a biomarker
 */
export function findConversionDefinition(
  biomarkerName: string
): BiomarkerConversions | undefined {
  const searchTerm = biomarkerName.toLowerCase().trim();
  return UNIT_CONVERSIONS.find(
    (conv) =>
      conv.biomarker.toLowerCase() === searchTerm ||
      conv.aliases.some((a) => a.toLowerCase() === searchTerm)
  );
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

  const normalizedFrom = fromUnit.toLowerCase().trim();
  const normalizedTo = toUnit.toLowerCase().trim();

  // Same unit, no conversion needed
  if (normalizedFrom === normalizedTo) return 1;

  const conversion = definition.conversions.find(
    (c) =>
      c.from.toLowerCase() === normalizedFrom && c.to.toLowerCase() === normalizedTo
  );

  return conversion?.factor;
}
