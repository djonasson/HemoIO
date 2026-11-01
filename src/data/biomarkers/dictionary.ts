/**
 * Comprehensive Biomarker Dictionary
 *
 * Reference data for lab test biomarkers including:
 * - Standard names and aliases
 * - Units and conversion factors
 * - Reference ranges (general adult ranges)
 * - Categories and descriptions
 * - Specimen types (matrix)
 * - LOINC codes for interoperability
 *
 * LOINC (Logical Observation Identifiers Names and Codes) Notice:
 * This product includes all or a portion of the LOINC® table, LOINC codes,
 * LOINC panels and forms file, and/or LOINC linguistic variants, which are
 * copyrighted © 1995-2024 Regenstrief Institute, Inc. and the LOINC Committee
 * and are available at no cost under the license at https://loinc.org/license/
 * LOINC® is a registered trademark of Regenstrief Institute, Inc.
 */

import type { Biomarker, BiomarkerCategory, SpecimenType } from '@/types';
import { relatedKeysFor } from './related';

/**
 * Extended biomarker definition with additional reference information
 */
export interface BiomarkerDefinition extends Omit<Biomarker, 'id'> {
  /**
   * Permanent identifier used in stored data. Never change or reuse a key:
   * renaming a biomarker keeps its key. See ISSUED_BIOMARKER_KEYS.
   */
  key: string;
  /** Common aliases/abbreviations for this biomarker */
  aliases: string[];
  /** Specimen/matrix type (serum, plasma, urine, etc.) */
  specimenType?: SpecimenType;
  /** LOINC code for standardized identification (copyrighted by Regenstrief Institute) */
  loincCode?: string;
  /** Default reference range for adults (may vary by lab/demographics) */
  defaultReferenceRange?: {
    low: number;
    high: number;
    unit: string;
  };
  /** Brief description of what this biomarker measures */
  description: string;
  /** What high values may indicate */
  highIndication?: string;
  /** What low values may indicate */
  lowIndication?: string;
  /** Keys of biomarkers read together with this one (see related.ts) */
  related: string[];
}

/** A dictionary entry as written; `related` is filled in from the curated groups */
type BiomarkerEntry = Omit<BiomarkerDefinition, 'related'>;

/**
 * Complete Blood Count (CBC) biomarkers
 */
const cbcBiomarkers: BiomarkerEntry[] = [
  {
    key: 'white-blood-cell-count',
    name: 'White Blood Cell Count',
    aliases: ['WBC', 'WBCs', 'Leukocytes', 'White Blood Cells', 'Globuli Bianchi', 'Leucociti'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '6690-2',
    canonicalUnit: '10^9/L',
    alternativeUnits: ['K/uL', 'cells/µL', '10^3/µL'],
    defaultReferenceRange: { low: 4.5, high: 11.0, unit: '10^9/L' },
    description: 'Measures the total number of white blood cells, which fight infection.',
    highIndication: 'May indicate infection, inflammation, or immune disorders',
    lowIndication: 'May indicate bone marrow problems or autoimmune conditions',
  },
  {
    key: 'red-blood-cell-count',
    name: 'Red Blood Cell Count',
    aliases: ['RBC', 'RBCs', 'Erythrocytes', 'Red Blood Cells', 'Globuli Rossi', 'Eritrociti'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '789-8',
    canonicalUnit: '10^12/L',
    alternativeUnits: ['M/uL', 'million/µL', '10^6/µL'],
    defaultReferenceRange: { low: 4.5, high: 5.5, unit: '10^12/L' },
    description: 'Measures the number of red blood cells that carry oxygen.',
    highIndication: 'May indicate dehydration or polycythemia',
    lowIndication: 'May indicate anemia',
  },
  {
    key: 'hemoglobin',
    name: 'Hemoglobin',
    aliases: ['Hgb', 'Hb', 'HGB', 'Emoglobina'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '718-7',
    canonicalUnit: 'g/dL',
    alternativeUnits: ['g/L', 'mmol/L'],
    defaultReferenceRange: { low: 12.0, high: 17.5, unit: 'g/dL' },
    description: 'Protein in red blood cells that carries oxygen.',
    highIndication: 'May indicate dehydration or lung disease',
    lowIndication: 'May indicate anemia or blood loss',
  },
  {
    key: 'hematocrit',
    name: 'Hematocrit',
    aliases: ['Hct', 'HCT', 'PCV', 'Packed Cell Volume', 'Ematocrito'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '4544-3',
    canonicalUnit: '%',
    alternativeUnits: ['L/L', 'ratio'],
    defaultReferenceRange: { low: 36, high: 50, unit: '%' },
    description: 'Percentage of blood volume made up of red blood cells.',
    highIndication: 'May indicate dehydration or polycythemia',
    lowIndication: 'May indicate anemia',
  },
  {
    key: 'platelet-count',
    name: 'Platelet Count',
    aliases: ['PLT', 'Platelets', 'Thrombocytes', 'Piastrine', 'Trombociti'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '777-3',
    canonicalUnit: '10^9/L',
    alternativeUnits: ['K/uL', '10^3/µL'],
    defaultReferenceRange: { low: 150, high: 400, unit: '10^9/L' },
    description: 'Cell fragments that help blood clot.',
    highIndication: 'May indicate inflammation or bone marrow disorder',
    lowIndication: 'May indicate bleeding risk or bone marrow problems',
  },
  {
    key: 'mean-corpuscular-volume',
    name: 'Mean Corpuscular Volume',
    aliases: ['MCV', 'Volume Globulare Medio', 'Volume Corpuscolare Medio'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '787-2',
    canonicalUnit: 'fL',
    alternativeUnits: ['µm³'],
    defaultReferenceRange: { low: 80, high: 100, unit: 'fL' },
    description: 'Average size of red blood cells.',
    highIndication: 'May indicate B12/folate deficiency (macrocytic anemia)',
    lowIndication: 'May indicate iron deficiency (microcytic anemia)',
  },
  {
    key: 'mean-corpuscular-hemoglobin',
    name: 'Mean Corpuscular Hemoglobin',
    aliases: ['MCH', 'Contenuto Medio di Hb', 'Contenuto Emoglobinico Corpuscolare Medio'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '785-6',
    canonicalUnit: 'pg',
    alternativeUnits: ['fmol'],
    defaultReferenceRange: { low: 27, high: 33, unit: 'pg' },
    description: 'Average amount of hemoglobin per red blood cell.',
    highIndication: 'May indicate macrocytic anemia',
    lowIndication: 'May indicate iron deficiency',
  },
  {
    key: 'mean-corpuscular-hemoglobin-concentration',
    name: 'Mean Corpuscular Hemoglobin Concentration',
    aliases: ['MCHC', 'Concentrazione Media di Hb', 'Concentrazione Emoglobinica Corpuscolare Media'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '786-4',
    canonicalUnit: 'g/dL',
    alternativeUnits: ['g/L', '%'],
    defaultReferenceRange: { low: 32, high: 36, unit: 'g/dL' },
    description: 'Average concentration of hemoglobin in red blood cells.',
    highIndication: 'May indicate spherocytosis',
    lowIndication: 'May indicate iron deficiency or thalassemia',
  },
  {
    key: 'red-cell-distribution-width',
    name: 'Red Cell Distribution Width',
    aliases: ['RDW', 'RDW-CV'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '788-0',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 11.5, high: 14.5, unit: '%' },
    description: 'Variation in red blood cell size.',
    highIndication: 'May indicate mixed anemia or nutritional deficiency',
    lowIndication: 'Generally not clinically significant',
  },
  {
    key: 'neutrophils',
    name: 'Neutrophils',
    aliases: ['Neutrophil Count', 'Neutrofili', 'Neutrofili (assoluti)', 'Neutrophils Absolute', 'ANC', 'Granulociti Neutrofili'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '751-8',
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/uL', 'cells/µL'],
    defaultReferenceRange: { low: 1.5, high: 8.0, unit: '10^9/L' },
    description: 'Most abundant white blood cell type, fights bacterial infections.',
    highIndication: 'May indicate bacterial infection or inflammation',
    lowIndication: 'May indicate neutropenia, risk of infection',
  },
  {
    key: 'neutrophils-percentage',
    name: 'Neutrophils Percentage',
    aliases: ['Neutrophils %', 'Neutrofili (%)', 'Neutrophil %', '% Neutrophils'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '770-8',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 40, high: 70, unit: '%' },
    description: 'Percentage of white blood cells that are neutrophils.',
    highIndication: 'May indicate bacterial infection',
    lowIndication: 'May indicate viral infection or other conditions',
  },
  {
    key: 'lymphocytes',
    name: 'Lymphocytes',
    aliases: ['Lymphocyte Count', 'Linfociti', 'Linfociti (assoluti)', 'Lymphocytes Absolute', 'ALC'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '731-0',
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/uL', 'cells/µL'],
    defaultReferenceRange: { low: 1.0, high: 4.0, unit: '10^9/L' },
    description: 'White blood cells important for immune response.',
    highIndication: 'May indicate viral infection or lymphoproliferative disorder',
    lowIndication: 'May indicate immunodeficiency or HIV',
  },
  {
    key: 'lymphocytes-percentage',
    name: 'Lymphocytes Percentage',
    aliases: ['Lymphocytes %', 'Linfociti (%)', 'Lymphocyte %', '% Lymphocytes'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '736-9',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 20, high: 40, unit: '%' },
    description: 'Percentage of white blood cells that are lymphocytes.',
    highIndication: 'May indicate viral infection',
    lowIndication: 'May indicate bacterial infection or immunodeficiency',
  },
  {
    key: 'monocytes',
    name: 'Monocytes',
    aliases: ['Monocyte Count', 'Monociti', 'Monociti (assoluti)', 'Monocytes Absolute'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '742-7',
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/uL', 'cells/µL'],
    defaultReferenceRange: { low: 0.2, high: 1.0, unit: '10^9/L' },
    description: 'White blood cells that become macrophages in tissues.',
    highIndication: 'May indicate chronic infection or inflammation',
    lowIndication: 'Generally not clinically significant',
  },
  {
    key: 'monocytes-percentage',
    name: 'Monocytes Percentage',
    aliases: ['Monocytes %', 'Monociti (%)', 'Monocyte %', '% Monocytes'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '5905-5',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 2, high: 10, unit: '%' },
    description: 'Percentage of white blood cells that are monocytes.',
    highIndication: 'May indicate chronic infection',
    lowIndication: 'Generally not clinically significant',
  },
  {
    key: 'eosinophils',
    name: 'Eosinophils',
    aliases: ['Eosinophil Count', 'Eosinofili', 'Eosinofili (assoluti)', 'Eosinophils Absolute', 'AEC'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '711-2',
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/uL', 'cells/µL'],
    defaultReferenceRange: { low: 0.0, high: 0.5, unit: '10^9/L' },
    description: 'White blood cells involved in allergic responses and parasites.',
    highIndication: 'May indicate allergies, parasitic infection, or asthma',
    lowIndication: 'Generally not clinically significant',
  },
  {
    key: 'eosinophils-percentage',
    name: 'Eosinophils Percentage',
    aliases: ['Eosinophils %', 'Eosinofili (%)', 'Eosinophil %', '% Eosinophils'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '713-8',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 1, high: 6, unit: '%' },
    description: 'Percentage of white blood cells that are eosinophils.',
    highIndication: 'May indicate allergies or parasitic infection',
    lowIndication: 'Generally not clinically significant',
  },
  {
    key: 'basophils',
    name: 'Basophils',
    aliases: ['Basophil Count', 'Basofili', 'Basofili (assoluti)', 'Basophils Absolute'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '704-7',
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/uL', 'cells/µL'],
    defaultReferenceRange: { low: 0.0, high: 0.2, unit: '10^9/L' },
    description: 'Rarest white blood cell type, involved in allergic reactions.',
    highIndication: 'May indicate allergic reaction or myeloproliferative disorder',
    lowIndication: 'Generally not clinically significant',
  },
  {
    key: 'basophils-percentage',
    name: 'Basophils Percentage',
    aliases: ['Basophils %', 'Basofili (%)', 'Basophil %', '% Basophils'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '706-2',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 0, high: 2, unit: '%' },
    description: 'Percentage of white blood cells that are basophils.',
    highIndication: 'May indicate allergic reaction',
    lowIndication: 'Generally not clinically significant',
  },
  {
    key: 'nucleated-red-blood-cells',
    name: 'Nucleated Red Blood Cells',
    aliases: ['NRBC', 'Erythroblasts', 'Eritroblasti', 'Eritroblasti (assoluti)', 'NRBC #'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '30392-5',
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/µL'],
    defaultReferenceRange: { low: 0, high: 0.1, unit: '10^9/L' },
    description: 'Immature red blood cells, normally absent from adult blood.',
    highIndication: 'May indicate bone marrow stress, severe anemia or hypoxia',
    lowIndication: 'Normal finding',
  },
  {
    key: 'nucleated-red-blood-cells-percentage',
    name: 'Nucleated Red Blood Cells Percentage',
    aliases: ['NRBC %', 'NRBC/100 WBC', 'Eritroblasti (%)', 'Eritroblasti %'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '58413-6',
    canonicalUnit: '/100 WBC',
    alternativeUnits: ['%'],
    description: 'Immature red blood cells per 100 white blood cells, normally zero in adults.',
    highIndication: 'May indicate bone marrow stress, severe anemia or hypoxia',
    lowIndication: 'Normal finding',
  },
  {
    key: 'reticulocytes',
    name: 'Reticulocyte Count',
    aliases: ['Reticulocytes', 'Reticolociti', 'Reticolociti (assoluti)', 'RET#', 'Retics'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '60474-4',
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/µL'],
    defaultReferenceRange: { low: 25, high: 100, unit: '10^9/L' },
    description: 'Young red blood cells in the blood, showing how fast the bone marrow makes red cells.',
    highIndication: 'May indicate blood loss, hemolysis or recovery from anemia',
    lowIndication: 'May indicate reduced red cell production by the bone marrow',
  },
  {
    key: 'reticulocytes-percentage',
    name: 'Reticulocytes Percentage',
    aliases: ['Reticulocytes %', 'Reticulocytes (%)', 'Reticolociti (%)', 'Reticolociti %', 'RET%'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '17849-1',
    canonicalUnit: '%',
    // Italian reports often give it per mille
    alternativeUnits: ['‰'],
    defaultReferenceRange: { low: 0.5, high: 2.5, unit: '%' },
    description: 'Young red blood cells as a share of all red blood cells.',
    highIndication: 'May indicate blood loss, hemolysis or recovery from anemia',
    lowIndication: 'May indicate reduced red cell production by the bone marrow',
  },
];

/**
 * Inflammation biomarkers
 */
const inflammationBiomarkers: BiomarkerEntry[] = [
  {
    key: 'erythrocyte-sedimentation-rate',
    name: 'Erythrocyte Sedimentation Rate',
    aliases: ['ESR', 'Sed Rate', 'V.E.S.', 'VES', 'Velocità di Eritrosedimentazione'],
    category: 'cbc',
    specimenType: 'whole-blood',
    loincCode: '30341-2',
    canonicalUnit: 'mm/h',
    alternativeUnits: ['mm/hr'],
    defaultReferenceRange: { low: 0, high: 20, unit: 'mm/h' },
    description: 'Rate at which red blood cells settle, indicates inflammation.',
    highIndication: 'May indicate inflammation, infection, or autoimmune disease',
    lowIndication: 'Generally not clinically significant',
  },
  {
    key: 'c-reactive-protein',
    name: 'C-Reactive Protein',
    aliases: ['CRP', 'Proteina C Reattiva', 'PCR', 'C-Reactive Protein High Sensitivity', 'hs-CRP'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '1988-5',
    canonicalUnit: 'mg/L',
    alternativeUnits: ['mg/dL'],
    defaultReferenceRange: { low: 0, high: 5, unit: 'mg/L' },
    description: 'Protein that rises with inflammation in the body.',
    highIndication: 'May indicate infection, inflammation, or cardiovascular risk',
    lowIndication: 'Generally indicates low inflammation',
  },
];

/**
 * Metabolic Panel biomarkers
 */
const metabolicBiomarkers: BiomarkerEntry[] = [
  {
    key: 'glucose',
    name: 'Glucose',
    aliases: ['Blood Sugar', 'Fasting Glucose', 'FBG', 'Blood Glucose', 'Glucosio', 'S-Glucosio', 'Glicemia', 'P-Glucosio', 'Glicemia a digiuno'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '2345-7',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 70, high: 100, unit: 'mg/dL' },
    description: 'Blood sugar level, primary energy source for cells.',
    highIndication: 'May indicate diabetes or prediabetes',
    lowIndication: 'May indicate hypoglycemia',
  },
  {
    key: 'creatinine',
    name: 'Creatinine',
    aliases: ['Creat', 'Serum Creatinine', 'S-Creatinina', 'Creatinina', 'P-Creatinina', 'Creatininemia', 'P-Creatinina (metodo enzimatico)'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '2160-0',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L'],
    defaultReferenceRange: { low: 0.7, high: 1.3, unit: 'mg/dL' },
    description: 'Waste product filtered by kidneys, indicates kidney function.',
    highIndication: 'May indicate kidney dysfunction',
    lowIndication: 'May indicate low muscle mass',
  },
  {
    key: 'blood-urea-nitrogen',
    name: 'Blood Urea Nitrogen',
    aliases: ['BUN', 'Urea Nitrogen'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '3094-0',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 7, high: 20, unit: 'mg/dL' },
    description: 'Waste product from protein metabolism, filtered by kidneys.',
    highIndication: 'May indicate kidney disease or dehydration',
    lowIndication: 'May indicate liver disease or malnutrition',
  },
  {
    key: 'urea',
    name: 'Urea',
    // Not BUN: urea is reported as the whole molecule (urea mg/dL ≈ 2.14 × BUN mg/dL)
    aliases: ['Serum Urea', 'Urea (serum)', 'S-Urea', 'P-Urea', 'Urea sierica', 'Urea plasmatica'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '3091-6',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 17, high: 43, unit: 'mg/dL' },
    description: 'Waste product from protein metabolism, filtered by kidneys. Reported as urea, not as its nitrogen (BUN).',
    highIndication: 'May indicate kidney disease or dehydration',
    lowIndication: 'May indicate liver disease or malnutrition',
  },
  {
    key: 'uric-acid',
    name: 'Uric Acid',
    aliases: ['Urate', 'Serum Uric Acid', 'Acido urico', 'Uricemia', 'S-Acido urico', 'P-Acido urico'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '3084-1',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L', 'mmol/L'],
    defaultReferenceRange: { low: 3.5, high: 7.2, unit: 'mg/dL' },
    description: 'End product of purine metabolism, excreted by the kidneys.',
    highIndication: 'May indicate gout, kidney disease or high purine intake',
    lowIndication: 'Rarely significant; may indicate liver disease',
  },
  {
    key: 'sodium',
    name: 'Sodium',
    aliases: ['Na', 'Na+', 'Serum Sodium', 'S-Na Sodio', 'Sodio', 'S-Na'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '2951-2',
    canonicalUnit: 'mEq/L',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 136, high: 145, unit: 'mEq/L' },
    description: 'Electrolyte important for fluid balance and nerve function.',
    highIndication: 'May indicate dehydration or hormone imbalance',
    lowIndication: 'May indicate overhydration or kidney problems',
  },
  {
    key: 'potassium',
    name: 'Potassium',
    aliases: ['K', 'K+', 'Serum Potassium', 'S-K Potassio', 'Potassio', 'S-K'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '2823-3',
    canonicalUnit: 'mEq/L',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 3.5, high: 5.0, unit: 'mEq/L' },
    description: 'Electrolyte critical for heart and muscle function.',
    highIndication: 'May indicate kidney disease or medication effects',
    lowIndication: 'May indicate diuretic use or GI losses',
  },
  {
    key: 'chloride',
    name: 'Chloride',
    aliases: ['Cl', 'Cl-', 'Serum Chloride'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '2075-0',
    canonicalUnit: 'mEq/L',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 98, high: 106, unit: 'mEq/L' },
    description: 'Electrolyte that helps maintain fluid balance.',
    highIndication: 'May indicate dehydration or kidney disease',
    lowIndication: 'May indicate vomiting or hormone imbalance',
  },
  {
    key: 'carbon-dioxide',
    name: 'Carbon Dioxide',
    aliases: ['CO2', 'Bicarbonate', 'HCO3', 'Total CO2'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '2028-9',
    canonicalUnit: 'mEq/L',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 23, high: 29, unit: 'mEq/L' },
    description: 'Reflects acid-base balance in the blood.',
    highIndication: 'May indicate metabolic alkalosis or lung disease',
    lowIndication: 'May indicate metabolic acidosis or kidney disease',
  },
  {
    key: 'calcium',
    name: 'Calcium',
    aliases: ['Ca', 'Ca++', 'Serum Calcium', 'Total Calcium', 'S-Calcio', 'Calcio', 'Calcemia'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '17861-6',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 8.5, high: 10.5, unit: 'mg/dL' },
    description: 'Mineral essential for bones, nerves, and muscles.',
    highIndication: 'May indicate hyperparathyroidism or cancer',
    lowIndication: 'May indicate vitamin D deficiency or kidney disease',
  },
  {
    key: 'magnesium',
    name: 'Magnesium',
    aliases: ['Mg', 'Serum Magnesium', 'S-Mg', 'S-Mg Magnesio', 'Magnesio', 'Magnesiemia'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '19123-9',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L', 'mEq/L'],
    defaultReferenceRange: { low: 1.7, high: 2.4, unit: 'mg/dL' },
    description: 'Mineral essential for nerve and muscle function, bone health, and energy production.',
    highIndication: 'May indicate kidney disease, excessive supplementation, or adrenal insufficiency',
    lowIndication: 'May indicate malnutrition, alcoholism, diabetes, or medication effects',
  },
  {
    key: 'egfr',
    name: 'eGFR',
    aliases: ['Estimated GFR', 'Glomerular Filtration Rate', 'GFR', 'Filtrato Glomerulare', 'Filtrato Glomerulare (eGFR)', 'eGFR (Velocità di filtrazione glomerulare stimata)', 'Velocità di filtrazione glomerulare', 'VFG', 'Filtrato Glomerulare (eGFR) (calcolato secondo formula CKD-EPI)'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '98979-8',
    canonicalUnit: 'mL/min/1.73m²',
    alternativeUnits: [],
    defaultReferenceRange: { low: 90, high: 120, unit: 'mL/min/1.73m²' },
    description: 'Estimate of how well kidneys filter waste.',
    highIndication: 'Generally not concerning',
    lowIndication: 'May indicate chronic kidney disease',
  },
];

/**
 * Lipid Panel biomarkers
 */
const lipidBiomarkers: BiomarkerEntry[] = [
  {
    key: 'total-cholesterol',
    name: 'Total Cholesterol',
    aliases: ['Cholesterol', 'TC', 'Chol', 'S-Colesterolo Totale', 'Colesterolo Totale', 'Colesterolo', 'S-Cholesterolo Totale', 'Cholesterolo Totale', 'Cholesterolo', 'P-Colesterolo', 'Colesterolemia'],
    category: 'lipid',
    specimenType: 'serum',
    loincCode: '2093-3',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L', 'mmo/L'],
    defaultReferenceRange: { low: 0, high: 200, unit: 'mg/dL' },
    description: 'Total amount of cholesterol in the blood.',
    highIndication: 'Increased cardiovascular disease risk',
    lowIndication: 'May indicate malnutrition or hyperthyroidism',
  },
  {
    key: 'ldl-cholesterol',
    name: 'LDL Cholesterol',
    aliases: ['LDL', 'LDL-C', 'Bad Cholesterol'],
    category: 'lipid',
    specimenType: 'serum',
    loincCode: '13457-7',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 0, high: 100, unit: 'mg/dL' },
    description: 'Low-density lipoprotein, deposits cholesterol in arteries.',
    highIndication: 'Increased risk of atherosclerosis',
    lowIndication: 'Generally desirable',
  },
  {
    key: 'hdl-cholesterol',
    name: 'HDL Cholesterol',
    aliases: ['HDL', 'HDL-C', 'Good Cholesterol', 'S-Colesterolo HDL', 'Colesterolo HDL', 'P-Colesterolo HDL', 'HDL Colesterolo'],
    category: 'lipid',
    specimenType: 'serum',
    loincCode: '2085-9',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L', 'mmo/L'],
    defaultReferenceRange: { low: 40, high: 60, unit: 'mg/dL' },
    description: 'High-density lipoprotein, removes cholesterol from arteries.',
    highIndication: 'Generally protective',
    lowIndication: 'Increased cardiovascular risk',
  },
  {
    key: 'triglycerides',
    name: 'Triglycerides',
    aliases: ['TG', 'Trigs', 'TRIG', 'Trigliceridi', 'S-Trigliceridi', 'P-Trigliceridi', 'Trigliceridemia'],
    category: 'lipid',
    specimenType: 'serum',
    loincCode: '2571-8',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 0, high: 150, unit: 'mg/dL' },
    description: 'Type of fat in the blood from food and liver production.',
    highIndication: 'Increased cardiovascular and pancreatitis risk',
    lowIndication: 'Generally not concerning',
  },
  {
    key: 'vldl-cholesterol',
    name: 'VLDL Cholesterol',
    aliases: ['VLDL', 'VLDL-C'],
    category: 'lipid',
    specimenType: 'serum',
    loincCode: '13458-5',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 5, high: 40, unit: 'mg/dL' },
    description: 'Very low-density lipoprotein, carries triglycerides.',
    highIndication: 'Increased cardiovascular risk',
    lowIndication: 'Generally not concerning',
  },
  {
    key: 'non-hdl-cholesterol',
    name: 'Non-HDL Cholesterol',
    aliases: ['Non-HDL', 'Non-HDL-C'],
    category: 'lipid',
    specimenType: 'serum',
    loincCode: '43396-1',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 0, high: 130, unit: 'mg/dL' },
    description: 'Total cholesterol minus HDL, all atherogenic particles.',
    highIndication: 'Increased cardiovascular risk',
    lowIndication: 'Generally desirable',
  },
];

/**
 * Thyroid Panel biomarkers
 */
const thyroidBiomarkers: BiomarkerEntry[] = [
  {
    key: 'thyroid-stimulating-hormone',
    name: 'Thyroid Stimulating Hormone',
    aliases: ['TSH', 'Thyrotropin', 'S-TSH Tirotropina', 'Tirotropina', 'S-TSH', 'Tireotropina', 'S-TSH Tireotropina', 'S-Tirotropina', 'S-Tirotropina (TSH)', 'Tirotropina (TSH)', 'Ormone tireotropo', 'S-Tirotropina (TSH) (ECLIA Roche)', 'TSH (S-Tirotropina)'],
    category: 'thyroid',
    specimenType: 'serum',
    loincCode: '3016-3',
    canonicalUnit: 'mIU/L',
    alternativeUnits: ['µIU/mL'],
    defaultReferenceRange: { low: 0.4, high: 4.0, unit: 'mIU/L' },
    description: 'Pituitary hormone that controls thyroid function.',
    highIndication: 'May indicate hypothyroidism',
    lowIndication: 'May indicate hyperthyroidism',
  },
  {
    key: 'free-t4',
    name: 'Free T4',
    aliases: ['FT4', 'Free Thyroxine', 'Thyroxine Free', 'S-FT4', 'S-FT4 Tiroxina libera', 'Tiroxina libera', 'FT4 Tiroxina libera'],
    category: 'thyroid',
    specimenType: 'serum',
    loincCode: '3024-7',
    canonicalUnit: 'ng/dL',
    alternativeUnits: ['pmol/L'],
    defaultReferenceRange: { low: 0.8, high: 1.8, unit: 'ng/dL' },
    description: 'Unbound thyroid hormone available to tissues.',
    highIndication: 'May indicate hyperthyroidism',
    lowIndication: 'May indicate hypothyroidism',
  },
  {
    key: 'total-t4',
    name: 'Total T4',
    aliases: ['T4', 'Thyroxine', 'Serum T4'],
    category: 'thyroid',
    specimenType: 'serum',
    loincCode: '3026-2',
    canonicalUnit: 'µg/dL',
    alternativeUnits: ['nmol/L'],
    defaultReferenceRange: { low: 4.5, high: 12.0, unit: 'µg/dL' },
    description: 'Total thyroxine (bound and free) in blood.',
    highIndication: 'May indicate hyperthyroidism',
    lowIndication: 'May indicate hypothyroidism',
  },
  {
    key: 'free-t3',
    name: 'Free T3',
    aliases: ['FT3', 'Free Triiodothyronine', 'S-FT3', 'S-FT3 Triiodotironina libera', 'Triiodotironina libera', 'FT3 Triiodotironina libera'],
    category: 'thyroid',
    specimenType: 'serum',
    loincCode: '3051-0',
    canonicalUnit: 'pg/mL',
    alternativeUnits: ['pmol/L'],
    defaultReferenceRange: { low: 2.3, high: 4.2, unit: 'pg/mL' },
    description: 'Active thyroid hormone available to tissues.',
    highIndication: 'May indicate hyperthyroidism',
    lowIndication: 'May indicate hypothyroidism or illness',
  },
  {
    key: 'total-t3',
    name: 'Total T3',
    aliases: ['T3', 'Triiodothyronine'],
    category: 'thyroid',
    specimenType: 'serum',
    loincCode: '3053-6',
    canonicalUnit: 'ng/dL',
    alternativeUnits: ['nmol/L'],
    defaultReferenceRange: { low: 80, high: 200, unit: 'ng/dL' },
    description: 'Total triiodothyronine in blood.',
    highIndication: 'May indicate hyperthyroidism',
    lowIndication: 'May indicate hypothyroidism',
  },
  {
    key: 'tpo-antibodies',
    name: 'TPO Antibodies',
    aliases: ['Anti-TPO', 'Thyroid Peroxidase Antibodies', 'S-Anticorpi anti Tireoperossidasi', 'Anticorpi anti Tireoperossidasi', 'Anti-Tireoperossidasi', 'TPOAb', 'Thyroid Peroxidase Ab'],
    category: 'thyroid',
    specimenType: 'serum',
    loincCode: '8099-4',
    canonicalUnit: 'IU/mL',
    alternativeUnits: ['U/mL', 'kIU/L'],
    defaultReferenceRange: { low: 0, high: 35, unit: 'IU/mL' },
    description: 'Antibodies against thyroid peroxidase enzyme, marker for autoimmune thyroid disease.',
    highIndication: 'May indicate Hashimoto thyroiditis or Graves disease',
    lowIndication: 'Normal finding - no autoimmune thyroid disease',
  },
];

/**
 * Iron Studies biomarkers
 */
const ironBiomarkers: BiomarkerEntry[] = [
  {
    key: 'serum-iron',
    name: 'Serum Iron',
    aliases: ['Iron', 'Fe', 'Iron Level', 'Ferro', 'Sideremia', 'Ferro sierico', 'S-Ferro'],
    category: 'iron',
    specimenType: 'serum',
    loincCode: '2498-4',
    canonicalUnit: 'µg/dL',
    alternativeUnits: ['µmol/L'],
    defaultReferenceRange: { low: 60, high: 170, unit: 'µg/dL' },
    description: 'Amount of iron circulating in the blood.',
    highIndication: 'May indicate hemochromatosis or iron overload',
    lowIndication: 'May indicate iron deficiency',
  },
  {
    key: 'ferritin',
    name: 'Ferritin',
    aliases: ['Serum Ferritin'],
    category: 'iron',
    specimenType: 'serum',
    loincCode: '2276-4',
    canonicalUnit: 'ng/mL',
    alternativeUnits: ['µg/L', 'pmol/L'],
    defaultReferenceRange: { low: 20, high: 200, unit: 'ng/mL' },
    description: 'Protein that stores iron, reflects iron stores.',
    highIndication: 'May indicate iron overload or inflammation',
    lowIndication: 'May indicate iron deficiency',
  },
  {
    key: 'total-iron-binding-capacity',
    name: 'Total Iron Binding Capacity',
    aliases: ['TIBC', 'Iron Binding Capacity'],
    category: 'iron',
    specimenType: 'serum',
    loincCode: '2500-7',
    canonicalUnit: 'µg/dL',
    alternativeUnits: ['µmol/L'],
    defaultReferenceRange: { low: 250, high: 400, unit: 'µg/dL' },
    description: 'Measures capacity of transferrin to bind iron.',
    highIndication: 'May indicate iron deficiency',
    lowIndication: 'May indicate iron overload or chronic disease',
  },
  {
    key: 'transferrin-saturation',
    name: 'Transferrin Saturation',
    aliases: ['TSAT', 'Iron Saturation', 'Transferrin Sat'],
    category: 'iron',
    specimenType: 'serum',
    loincCode: '2502-3',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 20, high: 50, unit: '%' },
    description: 'Percentage of transferrin bound to iron.',
    highIndication: 'May indicate iron overload',
    lowIndication: 'May indicate iron deficiency',
  },
  {
    key: 'transferrin',
    name: 'Transferrin',
    aliases: ['Serum Transferrin'],
    category: 'iron',
    specimenType: 'serum',
    loincCode: '3034-6',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['g/L'],
    defaultReferenceRange: { low: 200, high: 360, unit: 'mg/dL' },
    description: 'Protein that transports iron in the blood.',
    highIndication: 'May indicate iron deficiency',
    lowIndication: 'May indicate iron overload or malnutrition',
  },
];

/**
 * Vitamin biomarkers
 */
const vitaminBiomarkers: BiomarkerEntry[] = [
  {
    key: 'vitamin-b12',
    name: 'Vitamin B12',
    aliases: ['B12', 'Cobalamin', 'Cyanocobalamin', 'Vitamina B12', 'S-Vitamina B12', 'S-Vitamina B 12 attiva', 'Vitamina B 12 attiva', 'Active B12', 'Holotranscobalamin'],
    category: 'vitamin',
    specimenType: 'serum',
    loincCode: '2132-9',
    canonicalUnit: 'pg/mL',
    alternativeUnits: ['pmol/L', 'ng/L'],
    defaultReferenceRange: { low: 200, high: 900, unit: 'pg/mL' },
    description: 'Essential vitamin for nerve function and blood cell formation.',
    highIndication: 'Rarely concerning, may indicate supplementation',
    lowIndication: 'May indicate deficiency causing anemia or neuropathy',
  },
  {
    key: 'vitamin-d',
    name: 'Vitamin D',
    aliases: ['25-OH Vitamin D', '25-Hydroxyvitamin D', 'Calcidiol', 'Vitamin D Total', 'S-25-OH Vitamina D', '25-OH Vitamina D', 'Vitamina D', 'S-Vitamina D', 'Colecalciferolo', 'Vitamina D (25-OH)', 'Vitamina D 25-OH', '25(OH) Vitamina D'],
    category: 'vitamin',
    specimenType: 'serum',
    loincCode: '62292-8',
    canonicalUnit: 'ng/mL',
    alternativeUnits: ['nmol/L'],
    defaultReferenceRange: { low: 30, high: 100, unit: 'ng/mL' },
    description: 'Vitamin important for bone health and immune function.',
    highIndication: 'May indicate toxicity from oversupplementation',
    lowIndication: 'May indicate deficiency affecting bones and immunity',
  },
  {
    key: 'folate',
    name: 'Folate',
    aliases: ['Folic Acid', 'Vitamin B9', 'Serum Folate'],
    category: 'vitamin',
    specimenType: 'serum',
    loincCode: '2284-8',
    canonicalUnit: 'ng/mL',
    alternativeUnits: ['nmol/L'],
    defaultReferenceRange: { low: 2.7, high: 17.0, unit: 'ng/mL' },
    description: 'B vitamin essential for cell division and DNA synthesis.',
    highIndication: 'Generally not concerning',
    lowIndication: 'May indicate deficiency causing anemia',
  },
  {
    key: 'vitamin-a',
    name: 'Vitamin A',
    aliases: ['Retinol', 'Serum Retinol'],
    category: 'vitamin',
    specimenType: 'serum',
    loincCode: '14905-4',
    canonicalUnit: 'µg/dL',
    alternativeUnits: ['µmol/L'],
    defaultReferenceRange: { low: 30, high: 65, unit: 'µg/dL' },
    description: 'Vitamin important for vision, immunity, and skin.',
    highIndication: 'May indicate toxicity',
    lowIndication: 'May indicate deficiency affecting vision',
  },
];

/**
 * Glycemic biomarkers
 */
const glycemicBiomarkers: BiomarkerEntry[] = [
  {
    key: 'hemoglobin-a1c',
    name: 'Hemoglobin A1c',
    aliases: ['HbA1c', 'A1C', 'Glycated Hemoglobin', 'Glycohemoglobin', 'Sg-HbA1C Emoglobina Glicata', 'Emoglobina Glicata', 'HbA1C Emoglobina Glicata', 'Er-EMOGLOBINA GLICATA', 'EMOGLOBINA GLICATA', 'Sg-HbA1C', 'HbA1c (IFCC)', 'Emoglobina glicosilata', '% Hb totale'],
    category: 'metabolic',
    specimenType: 'whole-blood',
    loincCode: '4548-4',
    canonicalUnit: '%',
    alternativeUnits: ['mmol/mol'],
    defaultReferenceRange: { low: 4.0, high: 5.6, unit: '%' },
    description: 'Average blood sugar over past 2-3 months.',
    highIndication: 'May indicate diabetes or prediabetes',
    lowIndication: 'May indicate hypoglycemia or hemolytic conditions',
  },
  {
    key: 'fructosamine',
    name: 'Fructosamine',
    aliases: ['Glycated Albumin', 'Glycated Serum Protein'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '15069-8',
    canonicalUnit: 'µmol/L',
    alternativeUnits: [],
    defaultReferenceRange: { low: 200, high: 285, unit: 'µmol/L' },
    description: 'Average blood sugar over past 2-3 weeks.',
    highIndication: 'May indicate poor glycemic control',
    lowIndication: 'Generally not concerning',
  },
];

/**
 * Urinalysis biomarkers
 */
const urinalysisBiomarkers: BiomarkerEntry[] = [
  {
    key: 'urine-ph',
    name: 'Urine pH',
    aliases: ['pH', 'Urinary pH', 'pH (urine)', 'pH urinario', 'pH delle urine', 'U-pH', 'U-Esame standard pH', 'pH (urine, dipstick)'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '2756-5',
    canonicalUnit: '',
    alternativeUnits: [],
    defaultReferenceRange: { low: 5.0, high: 8.0, unit: '' },
    description: 'Acidity or alkalinity of urine.',
    highIndication: 'May indicate UTI or alkaline diet',
    lowIndication: 'May indicate acidosis or high protein diet',
  },
  {
    key: 'urine-specific-gravity',
    name: 'Urine Specific Gravity',
    aliases: ['Specific Gravity', 'SG', 'Urine SG', 'Urine Densità', 'Densità Urinaria', 'Peso Specifico', 'Peso specifico (urine)', 'Densità (urine)', 'Peso specifico urinario', 'U-Peso specifico', 'U-Esame standard Peso specifico', 'Peso specifico (urine, dipstick)', 'Densità Relativa (urine)', 'Densità relativa'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '2965-2',
    canonicalUnit: '',
    alternativeUnits: [],
    defaultReferenceRange: { low: 1.005, high: 1.030, unit: '' },
    description: 'Concentration of urine, reflects hydration status.',
    highIndication: 'May indicate dehydration',
    lowIndication: 'May indicate overhydration or kidney problems',
  },
  {
    key: 'urine-protein',
    name: 'Urine Protein',
    aliases: ['Protein', 'Proteinuria', 'Urine Protein Level', 'Proteine (urine)', 'Urine Proteine (standard)', 'U-Proteine totali', 'Proteine urinarie', 'U-Proteine', 'U-Proteine totali (urine)', 'U-Esame standard Proteine', 'Proteine (urine, dipstick)', 'Proteine totali (urine)', 'U-Proteine totali/L'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '2888-6',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['g/L', 'mg/L'],
    description: 'Protein in urine, normally minimal.',
    highIndication: 'May indicate kidney disease',
    lowIndication: 'Normal finding',
  },
  {
    key: 'urine-glucose',
    name: 'Urine Glucose',
    aliases: ['Glucose', 'Glycosuria', 'Urine Sugar', 'Urine Glucosio', 'Glucosio Urinario', 'U-Glucosio', 'Glucosio (urine)', 'U-Esame standard Glucosio', 'Glucosio (urine, dipstick)'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '2350-7',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    description: 'Glucose in urine, normally absent.',
    highIndication: 'May indicate diabetes or renal glycosuria',
    lowIndication: 'Normal finding',
  },
  {
    key: 'urine-ketones',
    name: 'Urine Ketones',
    aliases: ['Ketones', 'Ketonuria', 'Corpi Chetonici', 'Corpi Chetonici (urine)', 'Chetoni', 'Urine Corpi chetonici', 'Corpi chetonici urinari', 'U-Corpi chetonici', 'U-Esame standard Corpi chetonici', 'Corpi chetonici (urine, dipstick)'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '2514-8',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    description: 'Ketone bodies in urine from fat metabolism.',
    highIndication: 'May indicate diabetic ketoacidosis or fasting',
    lowIndication: 'Normal finding',
  },
  {
    key: 'urine-blood',
    name: 'Urine Blood',
    // The dipstick test for haemoglobin; red cell counts are Urine Red Blood Cells
    aliases: ['Blood', 'Emoglobina (urine)', 'Emoglobina (urine, dipstick)', 'Urine Emoglobina', 'Sangue (urine)', 'U-Emoglobina', 'U-Esame standard Emoglobina', 'Emoglobina (urine, per campo)', 'Urine Hemoglobin', 'Hemoglobin (urine)'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '5794-3',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mg/L', 'Ery/µL'],
    description: 'Haemoglobin in urine by dipstick, normally negative.',
    highIndication: 'May indicate blood in the urine (UTI, stones, kidney disease) or haemoglobin from hemolysis',
    lowIndication: 'Normal finding',
  },
  {
    key: 'urine-red-blood-cells',
    name: 'Urine Red Blood Cells',
    aliases: ['Hematuria', 'RBC in Urine', 'Globuli rossi (urine)', 'Urine Erythrocytes', 'Eritrociti (urine)', 'Eritrociti Urine', 'Emazie Urine', 'Eritrociti (urine) per campo', 'Eritrociti (urine, per campo)', 'Esame morfologico - eritrociti per campo', 'Esame morfologico eritrociti', 'Esame morfologico: eritrociti per campo', 'Urine RBC'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '13945-1',
    canonicalUnit: 'RBC/HPF',
    alternativeUnits: ['/HPF', 'per campo', 'eritrociti per campo', '/µL', 'cells/µL'],
    description: 'Red blood cells counted in urine, by microscopy or flow cytometry.',
    highIndication: 'May indicate UTI, kidney stones, or kidney disease',
    lowIndication: 'Normal finding',
  },
  {
    key: 'urine-wbc',
    name: 'Urine WBC',
    aliases: ['WBC in Urine', 'Leucociti (urine)', 'Globuli bianchi (urine)', 'Leucociti Urine', 'Urine Leukocytes', 'White Blood Cells Urine'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '5821-4',
    canonicalUnit: 'WBC/HPF',
    alternativeUnits: ['/µL', 'cells/µL'],
    description: 'White blood cells in urine, indicates infection.',
    highIndication: 'May indicate urinary tract infection',
    lowIndication: 'Normal finding',
  },
  {
    key: 'urine-leukocyte-esterase',
    name: 'Urine Leukocyte Esterase',
    aliases: ['Leukocyte Esterase', 'LE', 'WBC Esterase', 'Esterasi leucocitaria', 'Esterasi leucocitaria (urine)', 'U-Esame standard Esterasi leucocitaria', 'Esterasi leucocitaria (urine, dipstick)'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '5799-2',
    canonicalUnit: '',
    alternativeUnits: [],
    description: 'Enzyme from white blood cells, indicates infection.',
    highIndication: 'May indicate urinary tract infection',
    lowIndication: 'Normal finding',
  },
  {
    key: 'urine-nitrites',
    name: 'Urine Nitrites',
    aliases: ['Nitrites', 'Nitrite', 'Nitriti', 'Nitriti (urine)', 'U-Esame standard Nitriti', 'Nitriti (urine, dipstick)'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '5802-4',
    canonicalUnit: '',
    alternativeUnits: [],
    description: 'Produced by bacteria, indicates infection.',
    highIndication: 'May indicate bacterial UTI',
    lowIndication: 'Normal finding',
  },
  {
    key: 'microalbumin',
    name: 'Microalbumin',
    aliases: ['Urine Microalbumin', 'Urine Albumin', 'Albumin (urine)', 'MAU', 'U-ALBUMINA Micro', 'U-ALBUMINA Micro (U-Albumina/L)', 'Microalbumina', 'Microalbuminuria', 'U-Albumina', 'Albumina urinaria', 'U-ALBUMINA', 'U-Albumina (turbidimetria Roche)', 'U-Albumina (albuminuria)', 'U-Albumina/L', 'U-Albumina/L (urine)', 'U-Albumina (Micro, Urine)', 'Microalbumina (urine)', 'Micro U-Albumina (urine)', 'U-Albumina (urine)'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '14957-5',
    canonicalUnit: 'mg/L',
    alternativeUnits: ['µg/min'],
    defaultReferenceRange: { low: 0, high: 30, unit: 'mg/L' },
    description: 'Small amounts of albumin in urine, early kidney damage marker.',
    highIndication: 'May indicate early diabetic nephropathy',
    lowIndication: 'Normal finding',
  },
  {
    key: 'urine-epithelial-cells',
    name: 'Urine Epithelial Cells',
    aliases: ['Epithelial Cells', 'Cellule epiteliali (urine)', 'Cellule Epiteliali Urine', 'Squamous Epithelial Cells'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '5787-7',
    canonicalUnit: '/HPF',
    alternativeUnits: ['/µL', 'cells/µL'],
    description: 'Cells from urinary tract lining in urine.',
    highIndication: 'May indicate contamination or urinary tract issues',
    lowIndication: 'Normal finding',
  },
  {
    key: 'urine-creatinine',
    name: 'Urine Creatinine',
    aliases: ['U-Creatinina', 'Creatinina urinaria', 'Creatinina (urine)', 'U-Creatinina urinaria prima minzione', 'Creatinina urinaria prima minzione', 'U-Creatinina (urine)', 'Creatininuria', 'Creatinina/L (urine 24h)', 'Creatinina/L (urine)', 'U-Creatinina/L'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '2161-8',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L', 'g/L', 'mmol/L'],
    defaultReferenceRange: { low: 20, high: 300, unit: 'mg/dL' },
    description: 'Creatinine concentration in urine, used to assess kidney function and calculate ratios.',
    highIndication: 'May indicate concentrated urine or high muscle mass',
    lowIndication: 'May indicate dilute urine or kidney dysfunction',
  },
  {
    key: 'urine-urea',
    name: 'Urine Urea',
    aliases: ['Urea (urine)', 'U-Urea', 'Urea urinaria', 'Azoturia', 'Urea/L (urine 24h)', 'Urea/L (urine)', 'U-Urea/L'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '3092-4',
    canonicalUnit: 'g/L',
    alternativeUnits: ['mmol/L', 'mg/dL'],
    description: 'Urea concentration in urine.',
    highIndication: 'May indicate high protein intake or catabolism',
    lowIndication: 'May indicate low protein intake or kidney dysfunction',
  },
  {
    key: 'urine-bilirubin',
    name: 'Urine Bilirubin',
    aliases: ['Bilirubina (urine)', 'Urine Bilirubina', 'Bilirubina urinaria', 'Bilirubin (urine)', 'U-Bilirubina', 'U-Esame standard Bilirubina', 'Bilirubina (urine, dipstick)'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '5770-3',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L'],
    description: 'Bilirubin in urine, normally absent.',
    highIndication: 'May indicate liver disease or bile duct obstruction',
    lowIndication: 'Normal finding',
  },
  {
    key: 'urine-urobilinogen',
    name: 'Urine Urobilinogen',
    aliases: ['Urobilinogeno', 'Urobilinogeno (urine)', 'Urine Urobilinogeno', 'Urobilinogen', 'U-Urobilinogeno', 'U-Esame standard Urobilinogeno', 'Urobilinogeno (urine, dipstick)'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '5818-0',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L', 'EU/dL'],
    defaultReferenceRange: { low: 0.1, high: 1.0, unit: 'mg/dL' },
    description: 'Breakdown product of bilirubin, normally present in small amounts.',
    highIndication: 'May indicate hemolysis or liver disease',
    lowIndication: 'May indicate bile duct obstruction',
  },
  {
    key: 'albumin-creatinine-ratio',
    name: 'Albumin Creatinine Ratio',
    aliases: ['ACR', 'Albumina / Creatinina', 'Albumin/Creatinine Ratio', 'U-Albumina/Creatinina', 'UACR', 'Rapporto albumina/creatinina', 'Albumina/Creatinina', 'Albumina/Creatinina (urine)'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '9318-7',
    canonicalUnit: 'mg/g',
    alternativeUnits: ['mg/mmol'],
    defaultReferenceRange: { low: 0, high: 30, unit: 'mg/g' },
    description: 'Ratio of albumin to creatinine in urine, sensitive marker for kidney damage.',
    highIndication: 'May indicate diabetic nephropathy or kidney disease',
    lowIndication: 'Normal finding',
  },
  {
    key: 'protein-creatinine-ratio',
    name: 'Protein Creatinine Ratio',
    aliases: ['PCR', 'U-Proteine/Creatinina', 'Protein/Creatinine Ratio', 'Proteine/Creatinina', 'Rapporto proteine/creatinina', 'Proteine/Creatinina (urine)', 'U-Proteine/Creatinina (urine)'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '2890-2',
    canonicalUnit: 'mg/g',
    alternativeUnits: ['mg/mmol'],
    defaultReferenceRange: { low: 0, high: 150, unit: 'mg/g' },
    description: 'Ratio of protein to creatinine in urine, estimates 24-hour protein excretion.',
    highIndication: 'May indicate kidney disease or proteinuria',
    lowIndication: 'Normal finding',
  },
  {
    key: 'urine-volume',
    name: 'Urine Volume',
    aliases: ['U-VOLUME (24h)', 'Urine Volume 24h', '24h Urine Volume', 'Diuresi 24h', 'Volume urinario 24h', 'U-VOLUME', '24-Hour Urine Volume', 'Volume urinario', 'Volume delle urine', 'Volume (urine, 24h)', 'U-VOLUME (urine, 24h)'],
    category: 'urinalysis',
    specimenType: 'urine-24h',
    loincCode: '3167-4',
    canonicalUnit: 'mL',
    alternativeUnits: ['L', 'mL/24h'],
    defaultReferenceRange: { low: 800, high: 2000, unit: 'mL' },
    description: 'Total urine output over 24 hours.',
    highIndication: 'May indicate diabetes insipidus or excessive fluid intake',
    lowIndication: 'May indicate dehydration or kidney disease',
  },
  {
    key: '24-hour-urine-albumin',
    name: '24-Hour Urine Albumin',
    aliases: ['U Albumina 24h', 'Albumina 24h', '24h Albumin', 'Albuminuria 24h', 'Albumina urinaria 24h', 'U-Albumina 24h', 'Urine Albumin 24h', 'U-Albumina 24h (Urine)', 'Albumina 24h (urine)'],
    category: 'urinalysis',
    specimenType: 'urine-24h',
    loincCode: '1755-8',
    canonicalUnit: 'mg/24h',
    alternativeUnits: ['mg/day', 'g/24h'],
    defaultReferenceRange: { low: 0, high: 30, unit: 'mg/24h' },
    description: 'Total albumin excreted in 24-hour urine collection.',
    highIndication: 'May indicate kidney disease or diabetic nephropathy',
    lowIndication: 'Normal finding',
  },
  {
    key: '24-hour-urine-creatinine',
    name: '24-Hour Urine Creatinine',
    aliases: ['Creatinina (urine, 24h)', 'Creatinina 24h', 'Creatininuria 24h', 'U-Creatinina 24h', 'dU-Creatinina', 'Urine Creatinine 24h', 'Creatinina 24h (urine)'],
    category: 'urinalysis',
    specimenType: 'urine-24h',
    loincCode: '2162-6',
    canonicalUnit: 'g/24h',
    alternativeUnits: ['mg/24h', 'mmol/24h', 'µmol/24h'],
    defaultReferenceRange: { low: 0.8, high: 1.9, unit: 'g/24h' },
    description: 'Total creatinine excreted in 24-hour urine collection; also checks that the collection is complete.',
    highIndication: 'May indicate high muscle mass or over-collection',
    lowIndication: 'May indicate incomplete collection, low muscle mass or kidney dysfunction',
  },
  {
    key: '24-hour-urine-urea',
    name: '24-Hour Urine Urea',
    aliases: ['Urea (urine, 24h)', 'Urea 24h', 'Azoturia 24h', 'U-Urea 24h', 'dU-Urea', 'Urine Urea 24h', 'Urea 24h (urine)'],
    category: 'urinalysis',
    specimenType: 'urine-24h',
    loincCode: '48999-7',
    canonicalUnit: 'g/24h',
    alternativeUnits: ['mmol/24h'],
    defaultReferenceRange: { low: 25, high: 42, unit: 'g/24h' },
    description: 'Total urea excreted in 24-hour urine collection, reflecting protein intake.',
    highIndication: 'May indicate high protein intake or catabolism',
    lowIndication: 'May indicate low protein intake or kidney dysfunction',
  },
];

/**
 * Liver Function biomarkers
 */
const liverBiomarkers: BiomarkerEntry[] = [
  {
    key: 'alanine-aminotransferase',
    name: 'Alanine Aminotransferase',
    aliases: ['ALT', 'SGPT', 'Alanine Transaminase', 'S-ALT Alanina Amino Trasferasi', 'Alanina Amino Trasferasi', 'S-ALT', 'P-ALT', 'P-ALT (alanina aminotransferasi)', 'GPT', 'ALT (GPT)'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '1742-6',
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    defaultReferenceRange: { low: 7, high: 56, unit: 'U/L' },
    description: 'Liver enzyme, elevated in liver damage.',
    highIndication: 'May indicate liver disease or damage',
    lowIndication: 'Generally not concerning',
  },
  {
    key: 'aspartate-aminotransferase',
    name: 'Aspartate Aminotransferase',
    aliases: ['AST', 'SGOT', 'Aspartate Transaminase', 'S-AST Aspartato Amino Trasferasi', 'Aspartato Amino Trasferasi', 'S-AST', 'P-AST', 'P-AST (aspartato aminotransferasi)', 'GOT', 'AST (GOT)'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '1920-8',
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    defaultReferenceRange: { low: 10, high: 40, unit: 'U/L' },
    description: 'Enzyme found in liver, heart, and muscles.',
    highIndication: 'May indicate liver or muscle damage',
    lowIndication: 'Generally not concerning',
  },
  {
    key: 'alkaline-phosphatase',
    name: 'Alkaline Phosphatase',
    aliases: ['ALP', 'Alk Phos'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '6768-6',
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    defaultReferenceRange: { low: 44, high: 147, unit: 'U/L' },
    description: 'Enzyme from liver and bones.',
    highIndication: 'May indicate liver or bone disease',
    lowIndication: 'May indicate malnutrition or hypothyroidism',
  },
  {
    key: 'bilirubin-total',
    name: 'Bilirubin Total',
    aliases: ['Total Bilirubin', 'TBIL', 'Bilirubin'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '1975-2',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L'],
    defaultReferenceRange: { low: 0.1, high: 1.2, unit: 'mg/dL' },
    description: 'Breakdown product of hemoglobin, processed by liver.',
    highIndication: 'May indicate liver disease or hemolysis',
    lowIndication: 'Generally not concerning',
  },
  {
    key: 'bilirubin-direct',
    name: 'Bilirubin Direct',
    aliases: ['Direct Bilirubin', 'Conjugated Bilirubin', 'DBIL'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '1968-7',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L'],
    defaultReferenceRange: { low: 0.0, high: 0.3, unit: 'mg/dL' },
    description: 'Bilirubin processed by the liver.',
    highIndication: 'May indicate liver or bile duct obstruction',
    lowIndication: 'Generally not concerning',
  },
  {
    key: 'gamma-glutamyl-transferase',
    name: 'Gamma-Glutamyl Transferase',
    aliases: ['GGT', 'Gamma GT', 'GGTP', 'S-GGT Gamma Glutamil Trasferasi', 'Gamma Glutamil Trasferasi', 'S-GGT'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '2324-2',
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    defaultReferenceRange: { low: 0, high: 65, unit: 'U/L' },
    description: 'Liver enzyme, sensitive to alcohol and bile duct issues.',
    highIndication: 'May indicate liver disease or alcohol use',
    lowIndication: 'Generally not concerning',
  },
  {
    key: 'albumin',
    name: 'Albumin',
    aliases: ['Serum Albumin', 'ALB'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '1751-7',
    canonicalUnit: 'g/dL',
    alternativeUnits: ['g/L'],
    defaultReferenceRange: { low: 3.5, high: 5.0, unit: 'g/dL' },
    description: 'Main protein made by the liver.',
    highIndication: 'May indicate dehydration',
    lowIndication: 'May indicate liver disease or malnutrition',
  },
  {
    key: 'total-protein',
    name: 'Total Protein',
    aliases: ['Protein Total', 'TP', 'Serum Protein', 'P-Proteine totali', 'Proteine totali', 'Proteine Totali Sieriche', 'Protidemia'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '2885-2',
    canonicalUnit: 'g/dL',
    alternativeUnits: ['g/L'],
    defaultReferenceRange: { low: 6.0, high: 8.3, unit: 'g/dL' },
    description: 'Total albumin and globulin in blood.',
    highIndication: 'May indicate dehydration or chronic inflammation',
    lowIndication: 'May indicate liver disease or malnutrition',
  },
  {
    key: 'amylase',
    name: 'Amylase',
    aliases: ['S-Amilasi', 'Amilasi', 'S-Amilasi Totale', 'Amilasi Totale', 'Serum Amylase', 'AMY'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '1798-8',
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    defaultReferenceRange: { low: 25, high: 125, unit: 'U/L' },
    description: 'Enzyme that helps digest carbohydrates, produced by pancreas and salivary glands.',
    highIndication: 'May indicate pancreatitis, salivary gland disorders, or bowel obstruction',
    lowIndication: 'May indicate pancreatic insufficiency or liver disease',
  },
  {
    key: 'alpha-fetoprotein',
    name: 'Alpha-fetoprotein',
    aliases: ['AFP', 'S-AFP', 'α-fetoprotein', 'Alpha Fetoprotein', 'S-AFP alfa-fetoproteina', 'Alfa-fetoproteina', 'S-AFP Alfa-Fetoproteina'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '1834-1',
    canonicalUnit: 'ng/mL',
    alternativeUnits: ['IU/mL', 'kU/L', 'µg/L'],
    defaultReferenceRange: { low: 0, high: 10, unit: 'ng/mL' },
    description: 'Protein produced by fetal liver, used as tumor marker in adults.',
    highIndication: 'May indicate liver cancer, germ cell tumors, or liver regeneration',
    lowIndication: 'Generally not clinically significant',
  },
];

/**
 * Semen analysis / Fertility biomarkers
 */
const fertilityBiomarkers: BiomarkerEntry[] = [
  {
    key: 'sexual-abstinence',
    name: 'Sexual Abstinence',
    aliases: ['Astinenza sessuale', 'Abstinence', 'Days of Abstinence'],
    category: 'fertility',
    specimenType: 'semen',
    canonicalUnit: 'days',
    alternativeUnits: ['giorni'],
    defaultReferenceRange: { low: 2, high: 7, unit: 'days' },
    description: 'Number of days of sexual abstinence before semen collection.',
    highIndication: 'Extended abstinence may affect sperm quality',
    lowIndication: 'Short abstinence may result in lower sperm count',
  },
  {
    key: 'semen-volume',
    name: 'Semen Volume',
    aliases: ['Volume', 'Ejaculate Volume', 'Volume eiaculato', 'Volume sperma'],
    category: 'fertility',
    specimenType: 'semen',
    loincCode: '3160-9',
    canonicalUnit: 'mL',
    alternativeUnits: [],
    defaultReferenceRange: { low: 1.5, high: 5, unit: 'mL' },
    description: 'Total volume of ejaculate.',
    highIndication: 'May indicate inflammation or infection',
    lowIndication: 'May indicate obstruction, retrograde ejaculation, or hormonal issues',
  },
  {
    key: 'liquefaction-time',
    name: 'Liquefaction Time',
    aliases: ['Fluidità completa dopo minuti', 'Liquefaction', 'Tempo di fluidificazione', 'Fluidificazione'],
    category: 'fertility',
    specimenType: 'semen',
    loincCode: '10580-9',
    canonicalUnit: 'min',
    alternativeUnits: ['minutes', 'minuti'],
    defaultReferenceRange: { low: 0, high: 60, unit: 'min' },
    description: 'Time for semen to liquefy after ejaculation.',
    highIndication: 'Delayed liquefaction may affect sperm motility',
    lowIndication: 'Normal finding',
  },
  {
    key: 'sperm-concentration',
    name: 'Sperm Concentration',
    aliases: ['Spermatozoi', 'Sperm Count', 'Concentrazione spermatozoi', 'Sperm Density'],
    category: 'fertility',
    specimenType: 'semen',
    loincCode: '9780-8',
    canonicalUnit: 'mil/mL',
    alternativeUnits: ['million/mL', '10^6/mL', 'M/mL'],
    defaultReferenceRange: { low: 15, high: 200, unit: 'mil/mL' },
    description: 'Number of sperm per milliliter of semen.',
    highIndication: 'Generally positive for fertility',
    lowIndication: 'Oligozoospermia - may affect fertility',
  },
  {
    key: 'total-sperm-count',
    name: 'Total Sperm Count',
    aliases: ['Conta totale spermatozoi', 'Total Sperm', 'Numero totale spermatozoi', 'TSC'],
    category: 'fertility',
    specimenType: 'semen',
    loincCode: '107184-4',
    canonicalUnit: 'million',
    alternativeUnits: ['10^6'],
    defaultReferenceRange: { low: 39, high: 500, unit: 'million' },
    description: 'Total number of sperm in the ejaculate.',
    highIndication: 'Generally positive for fertility',
    lowIndication: 'May indicate reduced fertility potential',
  },
  {
    key: 'round-cells',
    name: 'Round Cells',
    aliases: ['Cellule rotonde', 'Round Cells Count'],
    category: 'fertility',
    specimenType: 'semen',
    canonicalUnit: 'mil/mL',
    alternativeUnits: ['million/mL', '10^6/mL'],
    defaultReferenceRange: { low: 0, high: 5, unit: 'mil/mL' },
    description: 'Non-sperm cells in semen including white blood cells and immature germ cells.',
    highIndication: 'May indicate infection or inflammation if >1 mil/mL are leukocytes',
    lowIndication: 'Normal finding',
  },
  {
    key: 'immature-sperm-forms',
    name: 'Immature Sperm Forms',
    aliases: ['Forme immature', 'Immature Forms', 'Forme immature spermatiche'],
    category: 'fertility',
    specimenType: 'semen',
    canonicalUnit: 'mil/mL',
    alternativeUnits: ['million/mL', '10^6/mL'],
    defaultReferenceRange: { low: 0, high: 1, unit: 'mil/mL' },
    description: 'Immature sperm cells in the ejaculate.',
    highIndication: 'May indicate spermatogenesis issues',
    lowIndication: 'Normal finding',
  },
  {
    key: 'progressive-motility-rapid',
    name: 'Progressive Motility (Rapid)',
    aliases: ['Rapida progressiva', 'Progressive Motility A', 'PR-A', 'Motilità progressiva rapida', 'Type A Motility'],
    category: 'fertility',
    specimenType: 'semen',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 25, high: 100, unit: '%' },
    description: 'Percentage of sperm with rapid progressive movement.',
    highIndication: 'Positive for fertility',
    lowIndication: 'May indicate asthenozoospermia',
  },
  {
    key: 'progressive-motility-slow',
    name: 'Progressive Motility (Slow)',
    aliases: ['Deb. Progressiva', 'Progressive Motility B', 'PR-B', 'Motilità progressiva lenta', 'Type B Motility', 'Debole progressiva'],
    category: 'fertility',
    specimenType: 'semen',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 0, high: 30, unit: '%' },
    description: 'Percentage of sperm with slow progressive movement.',
    highIndication: 'May indicate suboptimal motility',
    lowIndication: 'Normal when combined with good rapid progressive motility',
  },
  {
    key: 'non-progressive-motility',
    name: 'Non-Progressive Motility',
    aliases: ['In situ', 'Non-Progressive', 'Motilità non progressiva', 'Type C Motility', 'NP'],
    category: 'fertility',
    specimenType: 'semen',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 0, high: 20, unit: '%' },
    description: 'Percentage of sperm moving but not progressing forward.',
    highIndication: 'May affect fertility potential',
    lowIndication: 'Normal finding',
  },
  {
    key: 'immotile-sperm',
    name: 'Immotile Sperm',
    aliases: ['Immobili', 'Immotile', 'Spermatozoi immobili', 'Type D Motility', 'IM'],
    category: 'fertility',
    specimenType: 'semen',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 0, high: 60, unit: '%' },
    description: 'Percentage of non-moving sperm.',
    highIndication: 'High percentage may indicate necrozoospermia or asthenozoospermia',
    lowIndication: 'Positive for fertility',
  },
  {
    key: 'normal-sperm-morphology',
    name: 'Normal Sperm Morphology',
    aliases: ['Forme normali', 'Normal Forms', 'Morfologia normale', 'Normal Morphology'],
    category: 'fertility',
    specimenType: 'semen',
    loincCode: '10622-9',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 4, high: 100, unit: '%' },
    description: 'Percentage of sperm with normal shape (WHO 5th edition criteria).',
    highIndication: 'Positive for fertility',
    lowIndication: 'Teratozoospermia - may affect fertility',
  },
  {
    key: 'head-abnormalities',
    name: 'Head Abnormalities',
    aliases: ['Anomalie della testa', 'Head Defects', 'Difetti della testa'],
    category: 'fertility',
    specimenType: 'semen',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 0, high: 70, unit: '%' },
    description: 'Percentage of sperm with head defects.',
    highIndication: 'May affect fertilization ability',
    lowIndication: 'Normal finding',
  },
  {
    key: 'midpiece-abnormalities',
    name: 'Midpiece Abnormalities',
    aliases: ['Anomalie del collo-tratto intermedio', 'Midpiece Defects', 'Neck Defects', 'Anomalie del collo', 'Difetti del tratto intermedio'],
    category: 'fertility',
    specimenType: 'semen',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 0, high: 20, unit: '%' },
    description: 'Percentage of sperm with neck/midpiece defects.',
    highIndication: 'May affect sperm motility',
    lowIndication: 'Normal finding',
  },
  {
    key: 'tail-abnormalities',
    name: 'Tail Abnormalities',
    aliases: ['Anomalie della coda', 'Tail Defects', 'Difetti della coda'],
    category: 'fertility',
    specimenType: 'semen',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 0, high: 20, unit: '%' },
    description: 'Percentage of sperm with tail defects.',
    highIndication: 'May affect sperm motility',
    lowIndication: 'Normal finding',
  },
  {
    key: 'cytoplasmic-residue',
    name: 'Cytoplasmic Residue',
    aliases: ['Forme con residui citoplasmatici', 'Cytoplasmic Droplet', 'Residui citoplasmatici', 'Excess Residual Cytoplasm'],
    category: 'fertility',
    specimenType: 'semen',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 0, high: 20, unit: '%' },
    description: 'Percentage of sperm with excess cytoplasmic residue.',
    highIndication: 'May indicate immature sperm or oxidative stress',
    lowIndication: 'Normal finding',
  },
  {
    key: 'sperm-vitality',
    name: 'Sperm Vitality',
    aliases: ['Eosina Test', 'Eosin Test', 'Test di vitalità', 'Vitality', 'Vitalità spermatica', 'Eosina Test (test di vitalità)'],
    category: 'fertility',
    specimenType: 'semen',
    loincCode: '10613-8',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 58, high: 100, unit: '%' },
    description: 'Percentage of live sperm (eosin exclusion test).',
    highIndication: 'Positive for fertility',
    lowIndication: 'Necrozoospermia - may indicate infection or epididymal dysfunction',
  },
  {
    key: 'total-progressive-motility',
    name: 'Total Progressive Motility',
    aliases: ['Motilità progressiva totale', 'PR', 'Progressive Motility', 'Total PR'],
    category: 'fertility',
    specimenType: 'semen',
    loincCode: '14194-5',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 32, high: 100, unit: '%' },
    description: 'Total percentage of sperm with progressive movement (rapid + slow).',
    highIndication: 'Positive for fertility',
    lowIndication: 'Asthenozoospermia - may affect fertility',
  },
  {
    key: 'total-motility',
    name: 'Total Motility',
    aliases: ['Motilità totale', 'Total Motile', 'PR + NP'],
    category: 'fertility',
    specimenType: 'semen',
    loincCode: '6800-7',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 40, high: 100, unit: '%' },
    description: 'Total percentage of moving sperm (progressive + non-progressive).',
    highIndication: 'Positive for fertility',
    lowIndication: 'May affect fertility potential',
  },
  {
    key: 'semen-ph',
    name: 'Semen pH',
    aliases: ['pH', 'pH sperma', 'pH seminale'],
    category: 'fertility',
    specimenType: 'semen',
    loincCode: '2752-4',
    canonicalUnit: '',
    alternativeUnits: [],
    defaultReferenceRange: { low: 7.2, high: 8.0, unit: '' },
    description: 'Acidity/alkalinity of semen.',
    highIndication: 'May indicate infection',
    lowIndication: 'May indicate ejaculatory duct obstruction or seminal vesicle agenesis',
  },
];

/**
 * Protein Electrophoresis biomarkers
 */
const proteinElectrophoresisBiomarkers: BiomarkerEntry[] = [
  {
    key: 'serum-albumin-electrophoresis',
    name: 'Serum Albumin (Electrophoresis)',
    aliases: ['S-Elettroforesi albumina', 'Elettroforesi albumina', 'Albumina (elettroforesi)', 'SPE Albumin', 'Albumina %'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '13980-8',
    canonicalUnit: '%',
    alternativeUnits: ['g/dL', 'g/L'],
    defaultReferenceRange: { low: 55, high: 65, unit: '%' },
    description: 'Albumin fraction in serum protein electrophoresis.',
    highIndication: 'May indicate dehydration',
    lowIndication: 'May indicate liver disease, malnutrition, or inflammation',
  },
  {
    key: 'alpha-1-globulin',
    name: 'Alpha-1 Globulin',
    aliases: ['S-Elettroforesi alfa-1', 'Elettroforesi alfa-1', 'Alfa-1 globulina', 'Alpha-1', 'Alfa 1', 'α1-Globulin', 'alfa-1', 'alfa-1 (electrophoresis)', 'alfa-1 (elettroforesi)'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '13978-2',
    canonicalUnit: '%',
    alternativeUnits: ['g/dL', 'g/L'],
    defaultReferenceRange: { low: 2.0, high: 5.0, unit: '%' },
    description: 'Alpha-1 globulin fraction including alpha-1 antitrypsin.',
    highIndication: 'May indicate acute inflammation',
    lowIndication: 'May indicate alpha-1 antitrypsin deficiency',
  },
  {
    key: 'alpha-2-globulin',
    name: 'Alpha-2 Globulin',
    aliases: ['S-Elettroforesi alfa-2', 'Elettroforesi alfa-2', 'Alfa-2 globulina', 'Alpha-2', 'Alfa 2', 'α2-Globulin', 'alfa-2', 'alfa-2 (electrophoresis)', 'alfa-2 (elettroforesi)'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '13981-6',
    canonicalUnit: '%',
    alternativeUnits: ['g/dL', 'g/L'],
    defaultReferenceRange: { low: 6.0, high: 10.0, unit: '%' },
    description: 'Alpha-2 globulin fraction including haptoglobin and macroglobulin.',
    highIndication: 'May indicate acute inflammation or nephrotic syndrome',
    lowIndication: 'May indicate hemolysis or malnutrition',
  },
  {
    key: 'beta-globulin',
    name: 'Beta Globulin',
    aliases: ['S-Elettroforesi beta', 'Elettroforesi beta', 'Beta globulina', 'β-Globulin', 'Beta', 'beta (electrophoresis)', 'beta (elettroforesi)'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '13982-4',
    canonicalUnit: '%',
    alternativeUnits: ['g/dL', 'g/L'],
    defaultReferenceRange: { low: 8.0, high: 14.0, unit: '%' },
    description: 'Beta globulin fraction including transferrin and complement.',
    highIndication: 'May indicate iron deficiency or estrogen increase',
    lowIndication: 'May indicate malnutrition',
  },
  {
    key: 'gamma-globulin',
    name: 'Gamma Globulin',
    aliases: ['S-Elettroforesi gamma', 'Elettroforesi gamma', 'Gamma globulina', 'γ-Globulin', 'Gamma', 'Immunoglobulins', 'gamma (electrophoresis)', 'gamma (elettroforesi)'],
    category: 'metabolic',
    specimenType: 'serum',
    loincCode: '13983-2',
    canonicalUnit: '%',
    alternativeUnits: ['g/dL', 'g/L'],
    defaultReferenceRange: { low: 12.0, high: 20.0, unit: '%' },
    description: 'Gamma globulin fraction containing immunoglobulins.',
    highIndication: 'May indicate chronic infection, liver disease, or myeloma',
    lowIndication: 'May indicate immunodeficiency',
  },
];

/**
 * All biomarker definitions combined
 */
export const BIOMARKER_DEFINITIONS: BiomarkerDefinition[] = [
  ...cbcBiomarkers,
  ...inflammationBiomarkers,
  ...metabolicBiomarkers,
  ...lipidBiomarkers,
  ...thyroidBiomarkers,
  ...ironBiomarkers,
  ...vitaminBiomarkers,
  ...glycemicBiomarkers,
  ...urinalysisBiomarkers,
  ...liverBiomarkers,
  ...fertilityBiomarkers,
  ...proteinElectrophoresisBiomarkers,
].map((entry) => ({ ...entry, related: relatedKeysFor(entry.key) }));

/**
 * Category display names
 */
export const CATEGORY_NAMES: Record<BiomarkerCategory, string> = {
  cbc: 'Complete Blood Count',
  metabolic: 'Metabolic Panel',
  lipid: 'Lipid Panel',
  thyroid: 'Thyroid Function',
  iron: 'Iron Studies',
  vitamin: 'Vitamins',
  urinalysis: 'Urinalysis',
  fertility: 'Semen Analysis',
  other: 'Other',
};

const BY_KEY = new Map(BIOMARKER_DEFINITIONS.map((b) => [b.key, b]));
const UNKNOWN_PREFIX = 'unknown:';

/**
 * Dictionary entry for a stored biomarker key (undefined for unknown biomarkers)
 */
export function getBiomarkerByKey(key: string): BiomarkerDefinition | undefined {
  return BY_KEY.get(key);
}

/**
 * Key for a biomarker that is not in the dictionary, derived from its name so
 * the same name always gets the same key.
 *
 * Normalised to NFKC so composed and decomposed spellings match. Letters,
 * combining marks and digits are kept, as are "%" and "#", which distinguish
 * percentage and absolute-count variants of the same marker (e.g. "IG%" vs
 * "IG#"). Keys are permanent: changing these rules requires a data migration.
 */
export function unknownBiomarkerKey(extractedName: string): string {
  const normalized = extractedName
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}%#]/gu, '');
  return `${UNKNOWN_PREFIX}${normalized || 'unnamed'}`;
}

/**
 * Dictionary entry for a stored test value, by its stored key only: the key
 * is the test review saved it as, and a value saved as not in the
 * dictionary stays so whatever its printed name
 */
export function getBiomarkerForTestValue(testValue: {
  biomarkerKey: string;
}): BiomarkerDefinition | undefined {
  return getBiomarkerByKey(testValue.biomarkerKey);
}

/**
 * Name shown for a stored test value: its dictionary entry, else the name
 * extracted from the report
 */
export function getBiomarkerDisplayName(testValue: {
  biomarkerKey: string;
  rawText?: string;
}): string {
  return getBiomarkerForTestValue(testValue)?.name || testValue.rawText || 'Unknown biomarker';
}

// Lower-cased names and aliases, looked up for every displayed test value.
// The first definition to claim a name keeps it.
const BY_NAME_OR_ALIAS = new Map<string, BiomarkerDefinition>();
for (const definition of BIOMARKER_DEFINITIONS) {
  for (const name of [definition.name, ...definition.aliases]) {
    const term = nameKey(name);
    if (!BY_NAME_OR_ALIAS.has(term)) BY_NAME_OR_ALIAS.set(term, definition);
  }
}

/** A name as every lookup reads it: case, spacing and accent encoding aside */
export function nameKey(name: string): string {
  return name.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Find a biomarker by name or alias (case, spacing and accent encoding aside)
 */
export function findBiomarker(nameOrAlias: string): BiomarkerDefinition | undefined {
  return BY_NAME_OR_ALIAS.get(nameKey(nameOrAlias));
}

/** A name with only its letters, digits and "%": "P.C.R. *" is "pcr", "Neutrofili (%)" keeps its "%" */
function bareName(name: string): string {
  return nameKey(name).replace(/[^\p{L}\p{N}%]/gu, '');
}

/** Whether a printed name is one of the test's own, marks and punctuation aside ("PCR *") */
export function isNameOf(test: BiomarkerDefinition, name: string): boolean {
  const printed = bareName(name);
  return printed !== '' && ownBareNames(test).has(printed);
}

/** Each test's names read bare once: every value of a report is checked against its test's */
const OWN_BARE_NAMES = new WeakMap<BiomarkerDefinition, ReadonlySet<string>>();

function ownBareNames(test: BiomarkerDefinition): ReadonlySet<string> {
  let names = OWN_BARE_NAMES.get(test);
  if (!names) {
    names = new Set([test.name, ...test.aliases].map(bareName));
    OWN_BARE_NAMES.set(test, names);
  }
  return names;
}

/** The tests whose name or an alias is a share ("Neutrofili (%)"), by that name with only its letters, digits and "%" */
const BY_SHARE_NAME = new Map(
  BIOMARKER_DEFINITIONS.flatMap((d) =>
    [d.name, ...d.aliases].filter((n) => n.includes('%')).map((n) => [bareName(n), d] as const)
  )
);

/**
 * Exactly (name or alias), then ignoring spacing and punctuation; a "%"
 * however printed names the share ("Neutrofili %" is the percentage, not
 * the count)
 */
function matchNameVariations(name: string): BiomarkerDefinition | undefined {
  const match = matchSpellings(name);
  if (!match || !name.includes('%')) return match;
  return BY_SHARE_NAME.get(bareName(name)) ?? percentageOf(match) ?? match;
}

/** A count's percentage, which reports name alike: Neutrophils' is Neutrophils Percentage */
export function percentageOf(count: BiomarkerDefinition): BiomarkerDefinition | undefined {
  return getBiomarkerByKey(`${count.key}-percentage`);
}

/** Exactly (name or alias), then ignoring spacing and punctuation */
function matchSpellings(name: string): BiomarkerDefinition | undefined {
  // Accents as marks of their letters, so "é" keeps its "e" in either encoding
  const unaccented = name.normalize('NFD').replace(/\p{M}/gu, '');
  const variations = [
    name,
    name.replace(/\s+/g, ''),
    unaccented.replace(/[^a-zA-Z0-9\s]/g, ''),
    unaccented.toLowerCase().replace(/[^a-z0-9]/g, ''),
  ];
  for (const variation of variations) {
    const match = findBiomarker(variation);
    if (match) return match;
  }
  return undefined;
}

/** A name with a trailing qualifier, as in "Creatinina (urine, 24h)" */
const QUALIFIED_NAME = /^(.+?)\s*\(([^()]*)\)\s*$/;
/** A qualifier naming a urine specimen, or a 24-hour (urine) collection */
const URINE = /\burin/;
const PER_DAY = /24\s*(h|ore|hours?)\b/;

/** Whether a test is measured in blood (a test with no specimen given is) */
export function isBloodSpecimen(specimen: SpecimenType | undefined): boolean {
  return specimen === undefined || ['serum', 'plasma', 'whole-blood', 'capillary'].includes(specimen);
}

/** Words that say a name is of a blood specimen wherever they stand: "Urea plasmatica", "Serum Creatinine" */
const BLOOD_SPECIMEN_WORDS = new Set([
  'siero', 'sierica', 'sierico', 'sieriche', 'sierici', 'serum', 'plasma', 'plasmatica', 'plasmatico',
  'plasmatiche', 'plasmatici', 'venoso', 'venosa', 'venous', 'arterioso', 'arteriosa', 'arterial',
  'capillare', 'capillary',
]);
/**
 * Words naming a blood specimen in a qualifier: never one of a urine or
 * semen test. "Blood", "whole", S and P only say so there ("White Blood
 * Cells" is no specimen).
 */
const BLOOD_WORDS = new Set([...BLOOD_SPECIMEN_WORDS, 'sangue', 'intero', 'whole', 'blood', 's', 'p']);
/** Words that say a name is of a blood test: fasting is for blood ("Glucosio (a digiuno)") */
const FASTING_WORDS = new Set(['digiuno', 'fasting']);
/** Words that say a name is of semen: "pH seminale", "Volume eiaculato" */
const SEMEN_WORDS = new Set(['sperma', 'seminale', 'semen', 'seminal', 'eiaculato', 'ejaculate']);
/**
 * Words of a qualifier that leave any test as it is: the total, fasting,
 * and a method that names no test (IFCC is the method of most enzyme
 * assays). "metodo" itself says nothing: the word after it must be one of these.
 */
const GENERAL_WORDS = new Set([
  'totale', 'total', 'tot', 'tot.', ...FASTING_WORDS,
  'metodo', 'method', 'enzimatico', 'enzymatic', 'ifcc',
]);
/** Words that leave one test as it is: its form or equation */
export const TEST_WORDS: Readonly<Record<string, ReadonlySet<string>>> = {
  'vitamin-d': new Set(['25', 'oh', '25-oh', '25oh', 'd', 'd3', 'ohd', '25-ohd', '25ohd', '25-ohd3', '25ohd3']),
  egfr: new Set(['ckd-epi', 'ckdepi', 'mdrd']),
  'hemoglobin-a1c': new Set(['dcct', 'ngsp']),
};
/** General words that name another test of one test: IFCC hemoglobin is HbA1c */
export const OTHER_TEST_WORDS: Readonly<Record<string, ReadonlySet<string>>> = {
  hemoglobin: new Set(['ifcc']),
};

/** Whether a qualifier word leaves `test` as it is */
function keepsTest(word: string, test: BiomarkerDefinition): boolean {
  if (BLOOD_WORDS.has(word)) return isBloodSpecimen(test.specimenType);
  if (GENERAL_WORDS.has(word)) return !OTHER_TEST_WORDS[test.key]?.has(word);
  // An equation's year: "CKD-EPI 2021"
  if (test.key === 'egfr' && /^(19|20)\d\d$/.test(word)) return true;
  return TEST_WORDS[test.key]?.has(word) ?? false;
}

/** A qualifier part as read: OCR spaces hyphens ("CKD -EPI", "CKD EPI", "25 -OH") */
function qualifierPhrase(part: string): string {
  return nameKey(part).replace(/ ?- ?/g, '-').replace(/\bckd epi\b/g, 'ckd-epi');
}

/**
 * Whether a qualifier part restates `test`: one of its own names, or only
 * words that leave it as it is (its blood specimen, total, method, form or
 * equation). A blood specimen does not restate a urine test: "pH (venoso)"
 * is no urine pH.
 */
function restatesTest(part: string, test: BiomarkerDefinition): boolean {
  if (isNameOf(test, part)) return true;
  const phrase = qualifierPhrase(part);
  if (matchNameVariations(phrase)?.key === test.key) return true;
  // "a digiuno" is fasting; a lone "a" says nothing
  const words = phrase.replace(/\ba digiuno\b/g, 'digiuno').split(' ');
  return words.every((word) => keepsTest(word, test));
}

/**
 * Find a biomarker by name as an import does: exactly (name or alias), then
 * ignoring spacing and punctuation ("HEMOGLOBIN." is Hemoglobin). A trailing
 * qualifier that names a specimen picks that specimen's entry, never the
 * blood test: "Creatinina (urine, per litro)" is Urine Creatinine and
 * "Urea (urine, 24h)" is 24-Hour Urine Urea. A qualifier that only restates
 * the test (its own abbreviation, the blood specimen, the total or method)
 * is ignored: "Emoglobina (HGB)" is Hemoglobin and "Vitamina D (25-OH,
 * totale)" Vitamin D. Any other names another test ("Cholesterol (HDL)",
 * "Calcio (ionizzato)"), so the name matches no test of its base name.
 */
export function matchBiomarkerName(name: string): BiomarkerDefinition | undefined {
  const match = matchNameVariations(name);
  if (match) return match;

  const qualified = QUALIFIED_NAME.exec(name);
  if (!qualified) return undefined;
  const [, base, qualifier] = qualified;
  const words = qualifier.toLowerCase();
  const perDay = PER_DAY.test(words);
  const urine = URINE.test(words);
  if (!perDay && !urine) {
    // Each part restates the base name's test ("Emoglobina (HGB)", "Sodio
    // (siero/plasma)", "eGFR (CKD-EPI 2021)")
    const test = matchBiomarkerName(base);
    const sameTest = test !== undefined && words.split(/[,/]/).every((part) => restatesTest(part.trim(), test));
    return sameTest ? test : undefined;
  }

  const forms = perDay ? [`${base} (urine, 24h)`, `${base} 24h`] : [`${base} (urine)`, `${base} urinaria`];
  for (const form of forms) {
    const specimenMatch = matchNameVariations(form);
    if (specimenMatch) return specimenMatch;
  }
  return analyteIn(base, perDay || PER_DAY.test(nameKey(base)) ? 'urine-24h' : 'urine');
}

/**
 * The test of what a base name measures in a urine specimen, when the
 * dictionary has exactly one there: "Creatinine (urine)" is Urine
 * Creatinine, as the AI names every urinalysis value "<name> (urine)".
 * Never for a name that says blood or semen, nor a pad or ratio.
 */
function analyteIn(base: string, specimen: SpecimenType): BiomarkerDefinition | undefined {
  const says = namedSpecimen(base);
  const test = says === 'blood' || says === 'semen' ? undefined : matchBiomarkerName(base);
  if (!test || test.specimenType === specimen) return test;
  const there = measuring(test, (d) => d.specimenType === specimen && !MEASURED_WITHIN[d.key]);
  return there.length === 1 ? there[0] : undefined;
}

/** A specimen family a printed name can say */
export type NamedSpecimen = 'urine' | 'blood' | 'semen';

/**
 * The specimen family a printed name says it is of: urine ("Proteine
 * (urine)", "Albumina 24h", "U-Creatinina", "Proteinuria"), semen ("pH
 * seminale"), blood ("Creatinina (siero)", "Urea plasmatica",
 * "S-Creatinina", "Creatinina (s/p)"), or none. "Blood" and "whole" only
 * say so in a qualifier ("White Blood Cells" is no specimen), and S or P
 * only as a qualifier or prefix of its own; "(s)" after an English cell
 * name is its plural ("Erythrocyte(s)", "WBC(S)"), fasting is of blood.
 */
export function namedSpecimen(name: string): NamedSpecimen | undefined {
  const printed = nameKey(name);
  if (URINE.test(printed) || PER_DAY.test(printed) || /^d?u[-\s]|uria\b/.test(printed)) return 'urine';
  const words = printed.split(/[^\p{L}]+/u);
  if (words.some((w) => SEMEN_WORDS.has(w))) return 'semen';
  if (words.some((w) => BLOOD_SPECIMEN_WORDS.has(w) || FASTING_WORDS.has(w))) return 'blood';
  const qualifiers = [...printed.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]);
  if (qualifiers.some((q) => q.split(/[\s,/]+/).some((w) => w.length > 1 && BLOOD_WORDS.has(w)))) return 'blood';
  if (/^[sp]\s*-/.test(printed)) return 'blood';
  const letters = /^(.*?)\s*\(\s*([sp])\s*([,/]\s*[sp]\s*)*\)/.exec(printed);
  if (!letters) return undefined;
  const [, base, letter, more] = letters;
  return letter === 's' && !more && isPluralOf(base) ? undefined : 'blood';
}

/**
 * Whether "(s)" after `base` makes it an English plural: "Erythrocyte(s)",
 * "WBC(s)". An Italian plural ("Leucociti (S)") takes no "s", so its "(S)"
 * is the serum.
 */
function isPluralOf(base: string): boolean {
  return matchSpellings(`${base}s`) !== undefined;
}

/**
 * Names reports print for an analyte in any specimen: under a urine
 * heading as under a blood one, so either test of the analyte is what
 * they say. A name that is not one of these says the specimen of its
 * own test ("Glicemia" is blood glucose, "Semen pH" no urine pH).
 */
export const BARE_ANALYTE_NAMES: readonly string[] = [
  'Creatinina', 'Creatinine', 'Creat', 'Urea', 'Glucose', 'Glucosio', 'Protein', 'Total Protein',
  'Proteine totali', 'Albumin', 'Leucociti', 'Leukocytes', 'WBC', 'Globuli bianchi', 'White Blood Cells',
  'Eritrociti', 'Erythrocytes', 'RBC', 'Globuli rossi', 'Red Blood Cells', 'Emoglobina', 'Hemoglobin', 'Hb',
  'Hgb', 'Bilirubin', 'pH', 'Volume',
];
const BARE_NAMES = new Set(BARE_ANALYTE_NAMES.map(bareName));

/**
 * Whether a printed name is one reports print for an analyte in any
 * specimen, marks and a qualifier aside ("Erythrocyte(s)", "Creatinina
 * (metodo enzimatico)"); a singular English cell name is its plural's
 */
export function isBareAnalyteName(name: string): boolean {
  const base = bareName(QUALIFIED_NAME.exec(name)?.[1] ?? name);
  return BARE_NAMES.has(base) || (base.endsWith('e') && BARE_NAMES.has(`${base}s`));
}

/**
 * What tests measure, where one analyte is measured in several specimens
 * or ways: a printed name of one is no reason to question another
 * ("Creatinina" keyed as 24-hour urine creatinine). Every other test
 * measures only itself.
 */
export const ANALYTE_GROUPS: Readonly<Record<string, readonly string[]>> = {
  protein: ['total-protein', 'urine-protein'],
  glucose: ['glucose', 'urine-glucose'],
  hemoglobin: ['hemoglobin'],
  erythrocytes: ['red-blood-cell-count', 'urine-red-blood-cells'],
  leukocytes: ['white-blood-cell-count', 'urine-wbc'],
  creatinine: ['creatinine', 'urine-creatinine', '24-hour-urine-creatinine'],
  urea: ['urea', 'urine-urea', '24-hour-urine-urea'],
  bilirubin: ['bilirubin-total', 'urine-bilirubin'],
  albumin: ['albumin', 'microalbumin', '24-hour-urine-albumin'],
  ph: ['urine-ph', 'semen-ph'],
  volume: ['urine-volume', 'semen-volume'],
};

/**
 * Tests that measure an analyte only within another reading: a dipstick
 * pad screens for it, a ratio divides it by creatinine. A name of the
 * analyte keyed as one ("Leucociti" as the leukocyte esterase pad,
 * "Microalbumina" as the albumin/creatinine ratio) is no reason for a
 * check, but the pad's or ratio's own name keyed as the analyte is (a
 * pad's grade is no count, a ratio no concentration).
 */
export const MEASURED_WITHIN: Readonly<Record<string, readonly string[]>> = {
  'urine-leukocyte-esterase': ['leukocytes'],
  'urine-blood': ['erythrocytes', 'hemoglobin'],
  'albumin-creatinine-ratio': ['albumin'],
  'protein-creatinine-ratio': ['protein'],
};

/** What each test measures: its groups, or only itself (kept apart from the groups' names) */
const ANALYTES = new Map(
  BIOMARKER_DEFINITIONS.map((d) => {
    const groups = Object.keys(ANALYTE_GROUPS).filter((analyte) => ANALYTE_GROUPS[analyte].includes(d.key));
    return [d.key, groups.length > 0 ? groups : [`test:${d.key}`]] as const;
  })
);

function analytesOf(test: BiomarkerDefinition): readonly string[] {
  return ANALYTES.get(test.key) ?? [`test:${test.key}`];
}

/** The tests `where` keeps that measure what `test` does, or measure it within another reading */
function measuring(test: BiomarkerDefinition, where: (d: BiomarkerDefinition) => boolean): BiomarkerDefinition[] {
  return BIOMARKER_DEFINITIONS.filter((d) => where(d) && nameMeasuresTest(test, d));
}

/**
 * Whether a printed name's test `named` measures what `test` does, or what
 * it measures within another reading: Creatinine and 24-Hour Urine
 * Creatinine, a white cell count and the leukocyte esterase pad,
 * Microalbumin and the albumin/creatinine ratio (not the other way round)
 */
export function nameMeasuresTest(named: BiomarkerDefinition, test: BiomarkerDefinition): boolean {
  const measured = [...analytesOf(test), ...(MEASURED_WITHIN[test.key] ?? [])];
  return analytesOf(named).some((analyte) => measured.includes(analyte));
}

/** Whether two tests are of one specimen: the same one, or both of blood */
export function sameSpecimen(a: BiomarkerDefinition, b: BiomarkerDefinition): boolean {
  return a.specimenType === b.specimenType || (isBloodSpecimen(a.specimenType) && isBloodSpecimen(b.specimenType));
}

/**
 * The test of what `test` measures in the specimen of `other`: the first
 * one the unit fits, else the first that measures it as such, not within
 * another reading (Creatinine's in 24-hour urine is 24-Hour Urine
 * Creatinine; Hemoglobin's in urine in mg/dL is the urine blood pad)
 */
export function sameAnalyteIn(
  test: BiomarkerDefinition,
  other: BiomarkerDefinition,
  fits: (candidate: BiomarkerDefinition) => boolean
): BiomarkerDefinition | undefined {
  const there = measuring(test, (d) => sameSpecimen(d, other));
  return there.find(fits) ?? there.find((d) => !MEASURED_WITHIN[d.key]) ?? there[0];
}

/**
 * Get all biomarkers in a category
 */
export function getBiomarkersByCategory(category: BiomarkerCategory): BiomarkerDefinition[] {
  return BIOMARKER_DEFINITIONS.filter((b) => b.category === category);
}

/**
 * Search biomarkers by partial name or alias, the closest first
 */
export function searchBiomarkers(query: string): BiomarkerDefinition[] {
  const searchTerm = nameKey(query);
  if (!searchTerm) return [];

  const exact = findBiomarker(searchTerm);
  // The test the text names exactly (a name or alias), then names that
  // start with it, names that contain it, and tests an alias of which does
  const rank = ({ definition, name, aliases }: SearchableTest): number | undefined => {
    if (definition === exact) return 0;
    if (name.startsWith(searchTerm)) return 1;
    if (name.includes(searchTerm)) return 2;
    return aliases.some((a) => a.includes(searchTerm)) ? 3 : undefined;
  };
  return SEARCHABLE_TESTS.flatMap((test) => {
    const order = rank(test);
    return order === undefined ? [] : [{ definition: test.definition, order }];
  })
    .sort((a, b) => a.order - b.order)
    .map((found) => found.definition);
}

/** A test's name and aliases as a search reads them, read once: searches run on every keystroke */
interface SearchableTest {
  definition: BiomarkerDefinition;
  name: string;
  aliases: readonly string[];
}

const SEARCHABLE_TESTS: readonly SearchableTest[] = BIOMARKER_DEFINITIONS.map((definition) => ({
  definition,
  name: nameKey(definition.name),
  aliases: definition.aliases.map(nameKey),
}));

/**
 * Get canonical unit for a biomarker
 */
export function getCanonicalUnit(nameOrAlias: string): string | undefined {
  const biomarker = findBiomarker(nameOrAlias);
  return biomarker?.canonicalUnit;
}
