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
 */
const tshConversions: BiomarkerConversions = {
  biomarker: 'Thyroid Stimulating Hormone',
  aliases: ['TSH', 'Thyrotropin'],
  conversions: [
    { from: 'mIU/L', to: 'µIU/mL', factor: 1 },
    { from: 'µIU/mL', to: 'mIU/L', factor: 1 },
    { from: 'mIU/L', to: 'mU/L', factor: 1 },
    { from: 'mU/L', to: 'mIU/L', factor: 1 },
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
