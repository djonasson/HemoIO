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
    aliases: ['WBC', 'Leukocytes', 'White Blood Cells', 'Globuli Bianchi', 'Leucociti'],
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
    aliases: ['RBC', 'Erythrocytes', 'Red Blood Cells', 'Globuli Rossi', 'Eritrociti'],
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
    alternativeUnits: ['µmol/L', 'umol/L'],
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
    alternativeUnits: ['µmol/L', 'umol/L', 'mmol/L'],
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
    loincCode: '33914-3',
    canonicalUnit: 'mL/min/1.73m²',
    alternativeUnits: ['mL/min/1,73m²', 'mL/min/1,73m^2'],
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
    alternativeUnits: ['µIU/mL', 'mU/L', 'μUI/mL', 'mUI/L', 'uIU/mL'],
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
    alternativeUnits: ['UI/mL', 'U/mL', 'kIU/L'],
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
    alternativeUnits: ['µmol/L', 'umol/L'],
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
    loincCode: '1989-3',
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
    alternativeUnits: ['mmol/mol', 'mmol/molHb'],
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
    loincCode: '1784-8',
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
    aliases: ['Specific Gravity', 'SG', 'Urine SG', 'Urine Densità', 'Densità Urinaria', 'Peso Specifico', 'Peso specifico (urine)', 'Densità (urine)', 'Peso specifico urinario', 'U-Peso specifico', 'U-Esame standard Peso specifico', 'Peso specifico (urine, dipstick)'],
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
    aliases: ['Hematuria', 'RBC in Urine', 'Eritrociti (urine)', 'Eritrociti Urine', 'Emazie Urine', 'Eritrociti (urine) per campo', 'Eritrociti (urine, per campo)', 'Esame morfologico - eritrociti per campo', 'Esame morfologico eritrociti', 'Esame morfologico: eritrociti per campo', 'Urine RBC'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '13945-1',
    canonicalUnit: 'RBC/HPF',
    alternativeUnits: ['/HPF', 'per campo', 'eritrociti per campo', '/µL', '/uL', 'cells/µL', 'cell/µL'],
    description: 'Red blood cells counted in urine, by microscopy or flow cytometry.',
    highIndication: 'May indicate UTI, kidney stones, or kidney disease',
    lowIndication: 'Normal finding',
  },
  {
    key: 'urine-wbc',
    name: 'Urine WBC',
    aliases: ['WBC in Urine', 'Leucociti (urine)', 'Leucociti Urine', 'Urine Leukocytes', 'White Blood Cells Urine'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '5821-4',
    canonicalUnit: 'WBC/HPF',
    alternativeUnits: ['/µL', '/uL', 'cells/µL'],
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
    aliases: ['Urine Microalbumin', 'MAU', 'Albumin/Creatinine Ratio', 'U-ALBUMINA Micro', 'U-ALBUMINA Micro (U-Albumina/L)', 'Microalbumina', 'Microalbuminuria', 'U-Albumina', 'Albumina urinaria', 'U-ALBUMINA', 'U-Albumina (turbidimetria Roche)', 'U-Albumina (albuminuria)', 'U-Albumina/L', 'U-Albumina/L (urine)', 'U-Albumina (Micro, Urine)', 'Microalbumina (urine)', 'Micro U-Albumina (urine)', 'U-Albumina (urine)'],
    category: 'urinalysis',
    specimenType: 'urine',
    loincCode: '14957-5',
    canonicalUnit: 'mg/L',
    alternativeUnits: ['µg/min', 'mg/g creatinine', 'mg/g creat.', 'mg/g creat'],
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
    alternativeUnits: ['/µL', '/uL', 'cells/µL'],
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
    alternativeUnits: ['µmol/L', 'umol/L', 'g/L', 'mmol/L'],
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
    loincCode: '3095-7',
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
    alternativeUnits: ['mg/mmol', 'mg/g creat.', 'mg/g creat', 'mg/mmol creat.'],
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
    alternativeUnits: ['mg/mmol', 'mg/mmol creat.', 'mg/g creat.', 'mg/g creat'],
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
    loincCode: '3096-5',
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
    loincCode: '3168-2',
    canonicalUnit: 'mL',
    alternativeUnits: ['ml', 'cc'],
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
    loincCode: '10604-0',
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
    loincCode: '10616-4',
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
    loincCode: '10617-2',
    canonicalUnit: 'million',
    alternativeUnits: ['mil.', 'mil', '10^6'],
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
    loincCode: '10619-8',
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
    loincCode: '10611-5',
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
    loincCode: '10609-9',
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
    loincCode: '10608-1',
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
    loincCode: '10605-7',
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
    loincCode: '13979-0',
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
    loincCode: '13983-2',
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
    loincCode: '2867-0',
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
 * Dictionary entry for a stored test value. The stored key wins over the
 * extracted text: it reflects the match the user confirmed during review.
 */
export function getBiomarkerForTestValue(testValue: {
  biomarkerKey: string;
  rawText?: string;
}): BiomarkerDefinition | undefined {
  return (
    getBiomarkerByKey(testValue.biomarkerKey) ??
    (testValue.rawText ? findBiomarker(testValue.rawText) : undefined)
  );
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
    const term = name.toLowerCase();
    if (!BY_NAME_OR_ALIAS.has(term)) BY_NAME_OR_ALIAS.set(term, definition);
  }
}

/**
 * Find a biomarker by name or alias (case-insensitive)
 */
export function findBiomarker(nameOrAlias: string): BiomarkerDefinition | undefined {
  return BY_NAME_OR_ALIAS.get(nameOrAlias.toLowerCase().trim());
}

/** Exactly (name or alias), then ignoring spacing and punctuation */
function matchNameVariations(name: string): BiomarkerDefinition | undefined {
  const variations = [
    name,
    name.replace(/\s+/g, ''),
    name.replace(/[^a-zA-Z0-9\s]/g, ''),
    name.toLowerCase().replace(/[^a-z0-9]/g, ''),
  ];
  for (const variation of variations) {
    const match = findBiomarker(variation);
    if (match) return match;
  }
  return undefined;
}

/** A name with a trailing qualifier, as in "Creatinina (urine, 24h)" */
const QUALIFIED_NAME = /^(.+?)\s*\(([^()]*)\)\s*$/;

/**
 * Find a biomarker by name as an import does: exactly (name or alias), then
 * ignoring spacing and punctuation ("HEMOGLOBIN." is Hemoglobin). A trailing
 * qualifier that names a specimen picks that specimen's entry, never the
 * blood test: "Creatinina (urine, per litro)" is Urine Creatinine and
 * "Urea (urine, 24h)" is 24-Hour Urine Urea. Any other qualifier is ignored:
 * "Vitamina D (25-OH, totale)" is Vitamin D.
 */
export function matchBiomarkerName(name: string): BiomarkerDefinition | undefined {
  const match = matchNameVariations(name);
  if (match) return match;

  const qualified = QUALIFIED_NAME.exec(name);
  if (!qualified) return undefined;
  const [, base, qualifier] = qualified;
  const words = qualifier.toLowerCase();
  const perDay = /24\s*(h|ore|hours?)\b/.test(words);
  const urine = /\burin/.test(words);
  if (!perDay && !urine) return matchBiomarkerName(base);

  const forms = perDay ? [`${base} (urine, 24h)`, `${base} 24h`] : [`${base} (urine)`, `${base} urinaria`];
  for (const form of forms) {
    const specimenMatch = matchNameVariations(form);
    if (specimenMatch) return specimenMatch;
  }
  return undefined;
}

/**
 * Get all biomarkers in a category
 */
export function getBiomarkersByCategory(category: BiomarkerCategory): BiomarkerDefinition[] {
  return BIOMARKER_DEFINITIONS.filter((b) => b.category === category);
}

/**
 * Search biomarkers by partial name match
 */
export function searchBiomarkers(query: string): BiomarkerDefinition[] {
  const searchTerm = query.toLowerCase().trim();
  if (!searchTerm) return [];

  return BIOMARKER_DEFINITIONS.filter(
    (b) =>
      b.name.toLowerCase().includes(searchTerm) ||
      b.aliases.some((a) => a.toLowerCase().includes(searchTerm))
  );
}

/**
 * Get canonical unit for a biomarker
 */
export function getCanonicalUnit(nameOrAlias: string): string | undefined {
  const biomarker = findBiomarker(nameOrAlias);
  return biomarker?.canonicalUnit;
}

/**
 * Check if a unit is valid for a biomarker
 */
export function isValidUnit(nameOrAlias: string, unit: string): boolean {
  const biomarker = findBiomarker(nameOrAlias);
  if (!biomarker) return false;

  const normalizedUnit = unit.toLowerCase().trim();
  return (
    biomarker.canonicalUnit.toLowerCase() === normalizedUnit ||
    biomarker.alternativeUnits.some((u) => u.toLowerCase() === normalizedUnit)
  );
}
