/**
 * A temporary bridge from the old biomarker dictionary's names to the LOINC
 * components unit conversions are now keyed by, so callers that still hold
 * a dictionary name keep converting until they move to LOINC codes.
 *
 * @deprecated removed in Task 8, when every caller passes a LOINC component
 */
import { findBiomarker } from '@data/biomarkers/dictionary';

/** The names the old conversion table answered to, by LOINC component */
const NAMES_BY_COMPONENT: ReadonlyArray<[string, string[]]> = [
  [
    'Glucose',
    ['Glucose', 'Blood Sugar', 'Fasting Glucose', 'FBG', 'Blood Glucose', 'Urine Glucose', 'U-Glucosio', 'Glucosio Urinario', 'Glucosio (urine)', 'Glycosuria'],
  ],
  ['Cholesterol', ['Cholesterol', 'Total Cholesterol', 'TC', 'Chol']],
  ['Triglyceride', ['Triglycerides', 'TG', 'Trigs', 'TRIG']],
  [
    'Hemoglobin',
    ['Hemoglobin', 'Hgb', 'Hb', 'HGB', 'Mean Corpuscular Hemoglobin', 'MCH', 'Contenuto Medio di Hb', 'Contenuto Emoglobinico Corpuscolare Medio', 'Mean Corpuscular Hemoglobin Concentration', 'MCHC', 'Concentrazione Media di Hb', 'Concentrazione Emoglobinica Corpuscolare Media'],
  ],
  [
    'Creatinine',
    ['Creatinine', 'Creat', 'Serum Creatinine', 'Urine Creatinine', 'U-Creatinina', 'Creatinina urinaria', 'U-Creatinina (urine)', '24-Hour Urine Creatinine'],
  ],
  ['Urea nitrogen', ['Blood Urea Nitrogen', 'BUN', 'Urea Nitrogen']],
  ['Urea', ['Urea', 'Serum Urea', 'Urine Urea', '24-Hour Urine Urea']],
  ['Calcium', ['Calcium', 'Ca', 'Ca++', 'Serum Calcium', 'Total Calcium']],
  [
    'Calcidiol+ercalcidiol',
    ['Vitamin D', '25-OH Vitamin D', '25-Hydroxyvitamin D', 'Calcidiol', 'Vitamin D Total'],
  ],
  ['Cobalamins', ['Vitamin B12', 'B12', 'Cobalamin', 'Cyanocobalamin']],
  ['Folate', ['Folate', 'Folic Acid', 'Vitamin B9', 'Serum Folate']],
  ['Thyrotropin', ['Thyroid Stimulating Hormone', 'TSH', 'Thyrotropin']],
  ['Thyroxine.free', ['Free T4', 'FT4', 'Free Thyroxine', 'Thyroxine Free']],
  ['Thyroxine', ['Total T4', 'T4', 'Thyroxine', 'Serum T4']],
  ['Triiodothyronine.free', ['Free T3', 'FT3', 'Free Triiodothyronine']],
  ['Triiodothyronine', ['Total T3', 'T3', 'Triiodothyronine']],
  ['Iron', ['Serum Iron', 'Iron', 'Fe', 'Iron Level']],
  ['Ferritin', ['Ferritin', 'Serum Ferritin']],
  [
    'Bilirubin',
    ['Bilirubin', 'Total Bilirubin', 'TBIL', 'Bilirubin Total', 'Urine Bilirubin', 'U-Bilirubina', 'Bilirubina (urine)', 'Bilirubina urinaria'],
  ],
  [
    'Albumin',
    ['Albumin', 'Serum Albumin', 'ALB', 'Microalbumin', 'Urine Microalbumin', 'MAU', 'Microalbumina', 'U-Albumina', 'U-ALBUMINA'],
  ],
  [
    'Hemoglobin A1c/Hemoglobin.total',
    ['Hemoglobin A1c', 'HbA1c', 'A1C', 'Glycated Hemoglobin', 'Glycohemoglobin'],
  ],
  ['Urate', ['Uric Acid', 'Urate', 'Serum Uric Acid']],
  ['Leukocytes', ['White Blood Cell Count', 'WBC', 'Leukocytes', 'White Blood Cells', 'WBC Count']],
  ['Erythrocytes', ['Red Blood Cell Count', 'RBC', 'Erythrocytes', 'Red Blood Cells', 'RBC Count']],
  ['Platelets', ['Platelet Count', 'PLT', 'Platelets', 'Thrombocytes', 'PLT Count']],
  [
    'Neutrophils',
    ['Neutrophil Count', 'Neutrophils', 'Absolute Neutrophil Count', 'ANC', 'Neutrophils Absolute'],
  ],
  ['Lymphocytes', ['Lymphocyte Count', 'Lymphocytes', 'Absolute Lymphocyte Count', 'Lymphocytes Absolute']],
  ['Monocytes', ['Monocyte Count', 'Monocytes', 'Absolute Monocyte Count', 'Monocytes Absolute']],
  ['Eosinophils', ['Eosinophil Count', 'Eosinophils', 'Absolute Eosinophil Count', 'Eosinophils Absolute']],
  ['Basophils', ['Basophil Count', 'Basophils', 'Absolute Basophil Count', 'Basophils Absolute']],
  ['Reticulocytes', ['Reticulocyte Count', 'Reticulocytes', 'Retics', 'Reticulocyte Absolute']],
  ['Reticulocytes/Erythrocytes', ['Reticulocytes Percentage']],
  ['Magnesium', ['Magnesium', 'Mg', 'Serum Magnesium', 'Mg++']],
  ['Potassium', ['Potassium', 'K', 'K+', 'Serum Potassium']],
  ['Sodium', ['Sodium', 'Na', 'Na+', 'Serum Sodium']],
  ['Chloride', ['Chloride', 'Cl', 'Cl-', 'Serum Chloride']],
  ['Phosphate', ['Phosphorus', 'Phosphate', 'P', 'Inorganic Phosphorus', 'Serum Phosphorus']],
  ['Testosterone', ['Testosterone', 'Total Testosterone', 'Testosterone Total']],
  ['Estradiol', ['Estradiol', 'E2', 'Estrogen', '17-beta Estradiol']],
  ['Prostate specific Ag', ['Prostate Specific Antigen', 'PSA', 'Total PSA', 'PSA Total']],
  ['C reactive protein', ['C-Reactive Protein', 'CRP', 'hs-CRP', 'High Sensitivity CRP']],
  ['Erythrocyte', ['Erythrocyte Sedimentation Rate', 'ESR', 'Sed Rate', 'Sedimentation Rate']],
  ['Erythrocyte/Blood', ['Hematocrit', 'Hct', 'HCT', 'PCV', 'Packed Cell Volume', 'Ematocrito']],
  ['Observation', ['Mean Corpuscular Volume', 'MCV', 'Volume Globulare Medio', 'Volume Corpuscolare Medio']],
  [
    'Thyroperoxidase Ab',
    ['TPO Antibodies', 'Anti-TPO', 'Thyroid Peroxidase Antibodies', 'TPOAb', 'Anticorpi anti Tireoperossidasi'],
  ],
  [
    'Protein',
    ['Urine Protein', 'U-Proteine', 'Proteine (urine)', 'Proteinuria', 'U-Proteine totali', 'Total Protein', 'Protein Total', 'TP', 'Serum Protein', 'Proteine totali', 'Protidemia'],
  ],
  ['Urobilinogen', ['Urine Urobilinogen', 'U-Urobilinogeno', 'Urobilinogeno', 'Urobilinogeno (urine)']],
  ['Iron binding capacity', ['Total Iron Binding Capacity', 'TIBC', 'Iron Binding Capacity']],
  ['Transferrin', ['Transferrin', 'Serum Transferrin']],
  ['Retinol', ['Vitamin A', 'Retinol', 'Serum Retinol']],
  ['Erythrocytes.nucleated/Leukocytes', ['Nucleated Red Blood Cells Percentage']],
  ['Erythrocytes.nucleated', ['Nucleated Red Blood Cells']],
  ['Protein/Creatinine', ['Protein Creatinine Ratio', 'PCR', 'U-Proteine/Creatinina', 'Proteine/Creatinina']],
  [
    'Albumin/Creatinine',
    ['Albumin Creatinine Ratio', 'ACR', 'UACR', 'Albumina/Creatinina', 'U-Albumina/Creatinina'],
  ],
  [
    'Spermatozoa',
    ['Total Sperm Count', 'Sperm Count', 'Spermatozoi totali', 'Conta spermatozoi', 'Sperm Concentration', 'Concentrazione spermatozoi', 'Sperm Density'],
  ],
  ['Cholesterol.in LDL', ['LDL Cholesterol', 'LDL', 'LDL-C']],
  ['Cholesterol.in HDL', ['HDL Cholesterol', 'HDL', 'HDL-C']],
  ['Cholesterol.in VLDL', ['VLDL Cholesterol', 'VLDL', 'VLDL-C']],
  ['Cholesterol.non HDL', ['Non-HDL Cholesterol', 'Non-HDL', 'Non-HDL-C']],
  ['Bilirubin.glucuronidated+Bilirubin.albumin bound', ['Direct Bilirubin', 'DBIL']],
  ['Testosterone.free', ['Free Testosterone', 'Testosterone Free']],
  ['Prostate specific Ag.free', ['Free PSA']],
  [
    'Alanine aminotransferase',
    ['Alanine Aminotransferase', 'ALT', 'SGPT', 'Alanine Transaminase', 'GPT', 'ALT (GPT)'],
  ],
  [
    'Aspartate aminotransferase',
    ['Aspartate Aminotransferase', 'AST', 'SGOT', 'Aspartate Transaminase', 'GOT', 'AST (GOT)'],
  ],
  ['Alkaline phosphatase', ['Alkaline Phosphatase', 'ALP', 'Alk Phos']],
  ['Gamma glutamyl transferase', ['Gamma-Glutamyl Transferase', 'GGT', 'Gamma GT', 'GGTP']],
  ['Amylase', ['Amylase', 'S-Amilasi', 'Amilasi']],
  ['Sexual abstinence duration', ['Sexual Abstinence', 'Astinenza sessuale', 'Abstinence']],
];

const COMPONENT_BY_NAME = new Map(
  NAMES_BY_COMPONENT.flatMap(([component, names]) =>
    names.map((name): [string, string] => [name.toLowerCase(), component])
  )
);

/**
 * The LOINC component for a dictionary name or alias, also found through the
 * dictionary's own aliases ("P-Creatinina (metodo enzimatico)" is
 * Creatinine). Any other name is returned unchanged, so a LOINC component
 * passes through.
 *
 * @deprecated removed in Task 8, when every caller passes a LOINC component
 */
export function componentForBiomarker(name: string): string {
  const direct = COMPONENT_BY_NAME.get(name.trim().toLowerCase());
  if (direct) return direct;
  const definition = findBiomarker(name);
  return (definition && COMPONENT_BY_NAME.get(definition.name.toLowerCase())) ?? name;
}
