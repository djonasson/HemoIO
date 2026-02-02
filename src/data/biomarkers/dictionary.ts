/**
 * Comprehensive Biomarker Dictionary
 *
 * Reference data for lab test biomarkers including:
 * - Standard names and aliases
 * - Units and conversion factors
 * - Reference ranges (general adult ranges)
 * - Categories and descriptions
 */

import type { Biomarker, BiomarkerCategory } from '@/types';

/**
 * Extended biomarker definition with additional reference information
 */
export interface BiomarkerDefinition extends Omit<Biomarker, 'id'> {
  /** Common aliases/abbreviations for this biomarker */
  aliases: string[];
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
}

/**
 * Complete Blood Count (CBC) biomarkers
 */
const cbcBiomarkers: BiomarkerDefinition[] = [
  {
    name: 'White Blood Cell Count',
    aliases: ['WBC', 'Leukocytes', 'White Blood Cells'],
    category: 'cbc',
    canonicalUnit: '10^9/L',
    alternativeUnits: ['K/uL', 'cells/µL', '10^3/µL'],
    defaultReferenceRange: { low: 4.5, high: 11.0, unit: '10^9/L' },
    description: 'Measures the total number of white blood cells, which fight infection.',
    highIndication: 'May indicate infection, inflammation, or immune disorders',
    lowIndication: 'May indicate bone marrow problems or autoimmune conditions',
  },
  {
    name: 'Red Blood Cell Count',
    aliases: ['RBC', 'Erythrocytes', 'Red Blood Cells'],
    category: 'cbc',
    canonicalUnit: '10^12/L',
    alternativeUnits: ['M/uL', 'million/µL', '10^6/µL'],
    defaultReferenceRange: { low: 4.5, high: 5.5, unit: '10^12/L' },
    description: 'Measures the number of red blood cells that carry oxygen.',
    highIndication: 'May indicate dehydration or polycythemia',
    lowIndication: 'May indicate anemia',
  },
  {
    name: 'Hemoglobin',
    aliases: ['Hgb', 'Hb', 'HGB'],
    category: 'cbc',
    canonicalUnit: 'g/dL',
    alternativeUnits: ['g/L', 'mmol/L'],
    defaultReferenceRange: { low: 12.0, high: 17.5, unit: 'g/dL' },
    description: 'Protein in red blood cells that carries oxygen.',
    highIndication: 'May indicate dehydration or lung disease',
    lowIndication: 'May indicate anemia or blood loss',
  },
  {
    name: 'Hematocrit',
    aliases: ['Hct', 'HCT', 'PCV', 'Packed Cell Volume'],
    category: 'cbc',
    canonicalUnit: '%',
    alternativeUnits: ['L/L', 'ratio'],
    defaultReferenceRange: { low: 36, high: 50, unit: '%' },
    description: 'Percentage of blood volume made up of red blood cells.',
    highIndication: 'May indicate dehydration or polycythemia',
    lowIndication: 'May indicate anemia',
  },
  {
    name: 'Platelet Count',
    aliases: ['PLT', 'Platelets', 'Thrombocytes'],
    category: 'cbc',
    canonicalUnit: '10^9/L',
    alternativeUnits: ['K/uL', '10^3/µL'],
    defaultReferenceRange: { low: 150, high: 400, unit: '10^9/L' },
    description: 'Cell fragments that help blood clot.',
    highIndication: 'May indicate inflammation or bone marrow disorder',
    lowIndication: 'May indicate bleeding risk or bone marrow problems',
  },
  {
    name: 'Mean Corpuscular Volume',
    aliases: ['MCV'],
    category: 'cbc',
    canonicalUnit: 'fL',
    alternativeUnits: ['µm³'],
    defaultReferenceRange: { low: 80, high: 100, unit: 'fL' },
    description: 'Average size of red blood cells.',
    highIndication: 'May indicate B12/folate deficiency (macrocytic anemia)',
    lowIndication: 'May indicate iron deficiency (microcytic anemia)',
  },
  {
    name: 'Mean Corpuscular Hemoglobin',
    aliases: ['MCH'],
    category: 'cbc',
    canonicalUnit: 'pg',
    alternativeUnits: ['fmol'],
    defaultReferenceRange: { low: 27, high: 33, unit: 'pg' },
    description: 'Average amount of hemoglobin per red blood cell.',
    highIndication: 'May indicate macrocytic anemia',
    lowIndication: 'May indicate iron deficiency',
  },
  {
    name: 'Mean Corpuscular Hemoglobin Concentration',
    aliases: ['MCHC'],
    category: 'cbc',
    canonicalUnit: 'g/dL',
    alternativeUnits: ['g/L', '%'],
    defaultReferenceRange: { low: 32, high: 36, unit: 'g/dL' },
    description: 'Average concentration of hemoglobin in red blood cells.',
    highIndication: 'May indicate spherocytosis',
    lowIndication: 'May indicate iron deficiency or thalassemia',
  },
  {
    name: 'Red Cell Distribution Width',
    aliases: ['RDW', 'RDW-CV'],
    category: 'cbc',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 11.5, high: 14.5, unit: '%' },
    description: 'Variation in red blood cell size.',
    highIndication: 'May indicate mixed anemia or nutritional deficiency',
    lowIndication: 'Generally not clinically significant',
  },
];

/**
 * Metabolic Panel biomarkers
 */
const metabolicBiomarkers: BiomarkerDefinition[] = [
  {
    name: 'Glucose',
    aliases: ['Blood Sugar', 'Fasting Glucose', 'FBG', 'Blood Glucose'],
    category: 'metabolic',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 70, high: 100, unit: 'mg/dL' },
    description: 'Blood sugar level, primary energy source for cells.',
    highIndication: 'May indicate diabetes or prediabetes',
    lowIndication: 'May indicate hypoglycemia',
  },
  {
    name: 'Creatinine',
    aliases: ['Creat', 'Serum Creatinine', 'S-Creatinina', 'Creatinina'],
    category: 'metabolic',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L', 'umol/L'],
    defaultReferenceRange: { low: 0.7, high: 1.3, unit: 'mg/dL' },
    description: 'Waste product filtered by kidneys, indicates kidney function.',
    highIndication: 'May indicate kidney dysfunction',
    lowIndication: 'May indicate low muscle mass',
  },
  {
    name: 'Blood Urea Nitrogen',
    aliases: ['BUN', 'Urea Nitrogen', 'Urea'],
    category: 'metabolic',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 7, high: 20, unit: 'mg/dL' },
    description: 'Waste product from protein metabolism, filtered by kidneys.',
    highIndication: 'May indicate kidney disease or dehydration',
    lowIndication: 'May indicate liver disease or malnutrition',
  },
  {
    name: 'Sodium',
    aliases: ['Na', 'Na+', 'Serum Sodium', 'S-Na Sodio', 'Sodio', 'S-Na'],
    category: 'metabolic',
    canonicalUnit: 'mEq/L',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 136, high: 145, unit: 'mEq/L' },
    description: 'Electrolyte important for fluid balance and nerve function.',
    highIndication: 'May indicate dehydration or hormone imbalance',
    lowIndication: 'May indicate overhydration or kidney problems',
  },
  {
    name: 'Potassium',
    aliases: ['K', 'K+', 'Serum Potassium', 'S-K Potassio', 'Potassio', 'S-K'],
    category: 'metabolic',
    canonicalUnit: 'mEq/L',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 3.5, high: 5.0, unit: 'mEq/L' },
    description: 'Electrolyte critical for heart and muscle function.',
    highIndication: 'May indicate kidney disease or medication effects',
    lowIndication: 'May indicate diuretic use or GI losses',
  },
  {
    name: 'Chloride',
    aliases: ['Cl', 'Cl-', 'Serum Chloride'],
    category: 'metabolic',
    canonicalUnit: 'mEq/L',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 98, high: 106, unit: 'mEq/L' },
    description: 'Electrolyte that helps maintain fluid balance.',
    highIndication: 'May indicate dehydration or kidney disease',
    lowIndication: 'May indicate vomiting or hormone imbalance',
  },
  {
    name: 'Carbon Dioxide',
    aliases: ['CO2', 'Bicarbonate', 'HCO3', 'Total CO2'],
    category: 'metabolic',
    canonicalUnit: 'mEq/L',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 23, high: 29, unit: 'mEq/L' },
    description: 'Reflects acid-base balance in the blood.',
    highIndication: 'May indicate metabolic alkalosis or lung disease',
    lowIndication: 'May indicate metabolic acidosis or kidney disease',
  },
  {
    name: 'Calcium',
    aliases: ['Ca', 'Ca++', 'Serum Calcium', 'Total Calcium'],
    category: 'metabolic',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 8.5, high: 10.5, unit: 'mg/dL' },
    description: 'Mineral essential for bones, nerves, and muscles.',
    highIndication: 'May indicate hyperparathyroidism or cancer',
    lowIndication: 'May indicate vitamin D deficiency or kidney disease',
  },
  {
    name: 'eGFR',
    aliases: ['Estimated GFR', 'Glomerular Filtration Rate', 'GFR'],
    category: 'metabolic',
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
const lipidBiomarkers: BiomarkerDefinition[] = [
  {
    name: 'Total Cholesterol',
    aliases: ['Cholesterol', 'TC', 'Chol', 'S-Colesterolo Totale', 'Colesterolo Totale', 'Colesterolo', 'S-Cholesterolo Totale', 'Cholesterolo Totale', 'Cholesterolo'],
    category: 'lipid',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 0, high: 200, unit: 'mg/dL' },
    description: 'Total amount of cholesterol in the blood.',
    highIndication: 'Increased cardiovascular disease risk',
    lowIndication: 'May indicate malnutrition or hyperthyroidism',
  },
  {
    name: 'LDL Cholesterol',
    aliases: ['LDL', 'LDL-C', 'Bad Cholesterol'],
    category: 'lipid',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 0, high: 100, unit: 'mg/dL' },
    description: 'Low-density lipoprotein, deposits cholesterol in arteries.',
    highIndication: 'Increased risk of atherosclerosis',
    lowIndication: 'Generally desirable',
  },
  {
    name: 'HDL Cholesterol',
    aliases: ['HDL', 'HDL-C', 'Good Cholesterol'],
    category: 'lipid',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 40, high: 60, unit: 'mg/dL' },
    description: 'High-density lipoprotein, removes cholesterol from arteries.',
    highIndication: 'Generally protective',
    lowIndication: 'Increased cardiovascular risk',
  },
  {
    name: 'Triglycerides',
    aliases: ['TG', 'Trigs', 'TRIG'],
    category: 'lipid',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 0, high: 150, unit: 'mg/dL' },
    description: 'Type of fat in the blood from food and liver production.',
    highIndication: 'Increased cardiovascular and pancreatitis risk',
    lowIndication: 'Generally not concerning',
  },
  {
    name: 'VLDL Cholesterol',
    aliases: ['VLDL', 'VLDL-C'],
    category: 'lipid',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    defaultReferenceRange: { low: 5, high: 40, unit: 'mg/dL' },
    description: 'Very low-density lipoprotein, carries triglycerides.',
    highIndication: 'Increased cardiovascular risk',
    lowIndication: 'Generally not concerning',
  },
  {
    name: 'Non-HDL Cholesterol',
    aliases: ['Non-HDL', 'Non-HDL-C'],
    category: 'lipid',
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
const thyroidBiomarkers: BiomarkerDefinition[] = [
  {
    name: 'Thyroid Stimulating Hormone',
    aliases: ['TSH', 'Thyrotropin', 'S-TSH Tirotropina', 'Tirotropina', 'S-TSH', 'Tireotropina', 'S-TSH Tireotropina'],
    category: 'thyroid',
    canonicalUnit: 'mIU/L',
    alternativeUnits: ['µIU/mL', 'mU/L'],
    defaultReferenceRange: { low: 0.4, high: 4.0, unit: 'mIU/L' },
    description: 'Pituitary hormone that controls thyroid function.',
    highIndication: 'May indicate hypothyroidism',
    lowIndication: 'May indicate hyperthyroidism',
  },
  {
    name: 'Free T4',
    aliases: ['FT4', 'Free Thyroxine', 'Thyroxine Free'],
    category: 'thyroid',
    canonicalUnit: 'ng/dL',
    alternativeUnits: ['pmol/L'],
    defaultReferenceRange: { low: 0.8, high: 1.8, unit: 'ng/dL' },
    description: 'Unbound thyroid hormone available to tissues.',
    highIndication: 'May indicate hyperthyroidism',
    lowIndication: 'May indicate hypothyroidism',
  },
  {
    name: 'Total T4',
    aliases: ['T4', 'Thyroxine', 'Serum T4'],
    category: 'thyroid',
    canonicalUnit: 'µg/dL',
    alternativeUnits: ['nmol/L'],
    defaultReferenceRange: { low: 4.5, high: 12.0, unit: 'µg/dL' },
    description: 'Total thyroxine (bound and free) in blood.',
    highIndication: 'May indicate hyperthyroidism',
    lowIndication: 'May indicate hypothyroidism',
  },
  {
    name: 'Free T3',
    aliases: ['FT3', 'Free Triiodothyronine'],
    category: 'thyroid',
    canonicalUnit: 'pg/mL',
    alternativeUnits: ['pmol/L'],
    defaultReferenceRange: { low: 2.3, high: 4.2, unit: 'pg/mL' },
    description: 'Active thyroid hormone available to tissues.',
    highIndication: 'May indicate hyperthyroidism',
    lowIndication: 'May indicate hypothyroidism or illness',
  },
  {
    name: 'Total T3',
    aliases: ['T3', 'Triiodothyronine'],
    category: 'thyroid',
    canonicalUnit: 'ng/dL',
    alternativeUnits: ['nmol/L'],
    defaultReferenceRange: { low: 80, high: 200, unit: 'ng/dL' },
    description: 'Total triiodothyronine in blood.',
    highIndication: 'May indicate hyperthyroidism',
    lowIndication: 'May indicate hypothyroidism',
  },
];

/**
 * Iron Studies biomarkers
 */
const ironBiomarkers: BiomarkerDefinition[] = [
  {
    name: 'Serum Iron',
    aliases: ['Iron', 'Fe', 'Iron Level'],
    category: 'iron',
    canonicalUnit: 'µg/dL',
    alternativeUnits: ['µmol/L', 'umol/L'],
    defaultReferenceRange: { low: 60, high: 170, unit: 'µg/dL' },
    description: 'Amount of iron circulating in the blood.',
    highIndication: 'May indicate hemochromatosis or iron overload',
    lowIndication: 'May indicate iron deficiency',
  },
  {
    name: 'Ferritin',
    aliases: ['Serum Ferritin'],
    category: 'iron',
    canonicalUnit: 'ng/mL',
    alternativeUnits: ['µg/L', 'pmol/L'],
    defaultReferenceRange: { low: 20, high: 200, unit: 'ng/mL' },
    description: 'Protein that stores iron, reflects iron stores.',
    highIndication: 'May indicate iron overload or inflammation',
    lowIndication: 'May indicate iron deficiency',
  },
  {
    name: 'Total Iron Binding Capacity',
    aliases: ['TIBC', 'Iron Binding Capacity'],
    category: 'iron',
    canonicalUnit: 'µg/dL',
    alternativeUnits: ['µmol/L'],
    defaultReferenceRange: { low: 250, high: 400, unit: 'µg/dL' },
    description: 'Measures capacity of transferrin to bind iron.',
    highIndication: 'May indicate iron deficiency',
    lowIndication: 'May indicate iron overload or chronic disease',
  },
  {
    name: 'Transferrin Saturation',
    aliases: ['TSAT', 'Iron Saturation', 'Transferrin Sat'],
    category: 'iron',
    canonicalUnit: '%',
    alternativeUnits: [],
    defaultReferenceRange: { low: 20, high: 50, unit: '%' },
    description: 'Percentage of transferrin bound to iron.',
    highIndication: 'May indicate iron overload',
    lowIndication: 'May indicate iron deficiency',
  },
  {
    name: 'Transferrin',
    aliases: ['Serum Transferrin'],
    category: 'iron',
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
const vitaminBiomarkers: BiomarkerDefinition[] = [
  {
    name: 'Vitamin B12',
    aliases: ['B12', 'Cobalamin', 'Cyanocobalamin'],
    category: 'vitamin',
    canonicalUnit: 'pg/mL',
    alternativeUnits: ['pmol/L', 'ng/L'],
    defaultReferenceRange: { low: 200, high: 900, unit: 'pg/mL' },
    description: 'Essential vitamin for nerve function and blood cell formation.',
    highIndication: 'Rarely concerning, may indicate supplementation',
    lowIndication: 'May indicate deficiency causing anemia or neuropathy',
  },
  {
    name: 'Vitamin D',
    aliases: ['25-OH Vitamin D', '25-Hydroxyvitamin D', 'Calcidiol', 'Vitamin D Total'],
    category: 'vitamin',
    canonicalUnit: 'ng/mL',
    alternativeUnits: ['nmol/L'],
    defaultReferenceRange: { low: 30, high: 100, unit: 'ng/mL' },
    description: 'Vitamin important for bone health and immune function.',
    highIndication: 'May indicate toxicity from oversupplementation',
    lowIndication: 'May indicate deficiency affecting bones and immunity',
  },
  {
    name: 'Folate',
    aliases: ['Folic Acid', 'Vitamin B9', 'Serum Folate'],
    category: 'vitamin',
    canonicalUnit: 'ng/mL',
    alternativeUnits: ['nmol/L'],
    defaultReferenceRange: { low: 2.7, high: 17.0, unit: 'ng/mL' },
    description: 'B vitamin essential for cell division and DNA synthesis.',
    highIndication: 'Generally not concerning',
    lowIndication: 'May indicate deficiency causing anemia',
  },
  {
    name: 'Vitamin A',
    aliases: ['Retinol', 'Serum Retinol'],
    category: 'vitamin',
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
const glycemicBiomarkers: BiomarkerDefinition[] = [
  {
    name: 'Hemoglobin A1c',
    aliases: ['HbA1c', 'A1C', 'Glycated Hemoglobin', 'Glycohemoglobin'],
    category: 'metabolic',
    canonicalUnit: '%',
    alternativeUnits: ['mmol/mol'],
    defaultReferenceRange: { low: 4.0, high: 5.6, unit: '%' },
    description: 'Average blood sugar over past 2-3 months.',
    highIndication: 'May indicate diabetes or prediabetes',
    lowIndication: 'May indicate hypoglycemia or hemolytic conditions',
  },
  {
    name: 'Fructosamine',
    aliases: ['Glycated Albumin', 'Glycated Serum Protein'],
    category: 'metabolic',
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
const urinalysisBiomarkers: BiomarkerDefinition[] = [
  {
    name: 'Urine pH',
    aliases: ['pH', 'Urinary pH'],
    category: 'urinalysis',
    canonicalUnit: '',
    alternativeUnits: [],
    defaultReferenceRange: { low: 5.0, high: 8.0, unit: '' },
    description: 'Acidity or alkalinity of urine.',
    highIndication: 'May indicate UTI or alkaline diet',
    lowIndication: 'May indicate acidosis or high protein diet',
  },
  {
    name: 'Urine Specific Gravity',
    aliases: ['Specific Gravity', 'SG', 'Urine SG'],
    category: 'urinalysis',
    canonicalUnit: '',
    alternativeUnits: [],
    defaultReferenceRange: { low: 1.005, high: 1.030, unit: '' },
    description: 'Concentration of urine, reflects hydration status.',
    highIndication: 'May indicate dehydration',
    lowIndication: 'May indicate overhydration or kidney problems',
  },
  {
    name: 'Urine Protein',
    aliases: ['Protein', 'Proteinuria', 'Urine Protein Level'],
    category: 'urinalysis',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['g/L'],
    description: 'Protein in urine, normally minimal.',
    highIndication: 'May indicate kidney disease',
    lowIndication: 'Normal finding',
  },
  {
    name: 'Urine Glucose',
    aliases: ['Glucose', 'Glycosuria', 'Urine Sugar'],
    category: 'urinalysis',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    description: 'Glucose in urine, normally absent.',
    highIndication: 'May indicate diabetes or renal glycosuria',
    lowIndication: 'Normal finding',
  },
  {
    name: 'Urine Ketones',
    aliases: ['Ketones', 'Ketonuria'],
    category: 'urinalysis',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    description: 'Ketone bodies in urine from fat metabolism.',
    highIndication: 'May indicate diabetic ketoacidosis or fasting',
    lowIndication: 'Normal finding',
  },
  {
    name: 'Urine Blood',
    aliases: ['Blood', 'Hematuria', 'RBC in Urine'],
    category: 'urinalysis',
    canonicalUnit: 'RBC/HPF',
    alternativeUnits: [],
    description: 'Red blood cells in urine.',
    highIndication: 'May indicate UTI, kidney stones, or kidney disease',
    lowIndication: 'Normal finding',
  },
  {
    name: 'Urine Leukocyte Esterase',
    aliases: ['Leukocyte Esterase', 'LE', 'WBC Esterase'],
    category: 'urinalysis',
    canonicalUnit: '',
    alternativeUnits: [],
    description: 'Enzyme from white blood cells, indicates infection.',
    highIndication: 'May indicate urinary tract infection',
    lowIndication: 'Normal finding',
  },
  {
    name: 'Urine Nitrites',
    aliases: ['Nitrites', 'Nitrite'],
    category: 'urinalysis',
    canonicalUnit: '',
    alternativeUnits: [],
    description: 'Produced by bacteria, indicates infection.',
    highIndication: 'May indicate bacterial UTI',
    lowIndication: 'Normal finding',
  },
  {
    name: 'Microalbumin',
    aliases: ['Urine Microalbumin', 'MAU', 'Albumin/Creatinine Ratio'],
    category: 'urinalysis',
    canonicalUnit: 'mg/L',
    alternativeUnits: ['µg/min', 'mg/g creatinine'],
    defaultReferenceRange: { low: 0, high: 30, unit: 'mg/L' },
    description: 'Small amounts of albumin in urine, early kidney damage marker.',
    highIndication: 'May indicate early diabetic nephropathy',
    lowIndication: 'Normal finding',
  },
];

/**
 * Liver Function biomarkers
 */
const liverBiomarkers: BiomarkerDefinition[] = [
  {
    name: 'Alanine Aminotransferase',
    aliases: ['ALT', 'SGPT', 'Alanine Transaminase', 'S-ALT Alanina Amino Trasferasi', 'Alanina Amino Trasferasi', 'S-ALT'],
    category: 'metabolic',
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    defaultReferenceRange: { low: 7, high: 56, unit: 'U/L' },
    description: 'Liver enzyme, elevated in liver damage.',
    highIndication: 'May indicate liver disease or damage',
    lowIndication: 'Generally not concerning',
  },
  {
    name: 'Aspartate Aminotransferase',
    aliases: ['AST', 'SGOT', 'Aspartate Transaminase', 'S-AST Aspartato Amino Trasferasi', 'Aspartato Amino Trasferasi', 'S-AST'],
    category: 'metabolic',
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    defaultReferenceRange: { low: 10, high: 40, unit: 'U/L' },
    description: 'Enzyme found in liver, heart, and muscles.',
    highIndication: 'May indicate liver or muscle damage',
    lowIndication: 'Generally not concerning',
  },
  {
    name: 'Alkaline Phosphatase',
    aliases: ['ALP', 'Alk Phos'],
    category: 'metabolic',
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    defaultReferenceRange: { low: 44, high: 147, unit: 'U/L' },
    description: 'Enzyme from liver and bones.',
    highIndication: 'May indicate liver or bone disease',
    lowIndication: 'May indicate malnutrition or hypothyroidism',
  },
  {
    name: 'Bilirubin Total',
    aliases: ['Total Bilirubin', 'TBIL', 'Bilirubin'],
    category: 'metabolic',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L'],
    defaultReferenceRange: { low: 0.1, high: 1.2, unit: 'mg/dL' },
    description: 'Breakdown product of hemoglobin, processed by liver.',
    highIndication: 'May indicate liver disease or hemolysis',
    lowIndication: 'Generally not concerning',
  },
  {
    name: 'Bilirubin Direct',
    aliases: ['Direct Bilirubin', 'Conjugated Bilirubin', 'DBIL'],
    category: 'metabolic',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L'],
    defaultReferenceRange: { low: 0.0, high: 0.3, unit: 'mg/dL' },
    description: 'Bilirubin processed by the liver.',
    highIndication: 'May indicate liver or bile duct obstruction',
    lowIndication: 'Generally not concerning',
  },
  {
    name: 'Gamma-Glutamyl Transferase',
    aliases: ['GGT', 'Gamma GT', 'GGTP', 'S-GGT Gamma Glutamil Trasferasi', 'Gamma Glutamil Trasferasi', 'S-GGT'],
    category: 'metabolic',
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    defaultReferenceRange: { low: 0, high: 65, unit: 'U/L' },
    description: 'Liver enzyme, sensitive to alcohol and bile duct issues.',
    highIndication: 'May indicate liver disease or alcohol use',
    lowIndication: 'Generally not concerning',
  },
  {
    name: 'Albumin',
    aliases: ['Serum Albumin', 'ALB'],
    category: 'metabolic',
    canonicalUnit: 'g/dL',
    alternativeUnits: ['g/L'],
    defaultReferenceRange: { low: 3.5, high: 5.0, unit: 'g/dL' },
    description: 'Main protein made by the liver.',
    highIndication: 'May indicate dehydration',
    lowIndication: 'May indicate liver disease or malnutrition',
  },
  {
    name: 'Total Protein',
    aliases: ['Protein Total', 'TP', 'Serum Protein'],
    category: 'metabolic',
    canonicalUnit: 'g/dL',
    alternativeUnits: ['g/L'],
    defaultReferenceRange: { low: 6.0, high: 8.3, unit: 'g/dL' },
    description: 'Total albumin and globulin in blood.',
    highIndication: 'May indicate dehydration or chronic inflammation',
    lowIndication: 'May indicate liver disease or malnutrition',
  },
  {
    name: 'Amylase',
    aliases: ['S-Amilasi', 'Amilasi', 'S-Amilasi Totale', 'Amilasi Totale', 'Serum Amylase', 'AMY'],
    category: 'metabolic',
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    defaultReferenceRange: { low: 25, high: 125, unit: 'U/L' },
    description: 'Enzyme that helps digest carbohydrates, produced by pancreas and salivary glands.',
    highIndication: 'May indicate pancreatitis, salivary gland disorders, or bowel obstruction',
    lowIndication: 'May indicate pancreatic insufficiency or liver disease',
  },
  {
    name: 'Alpha-fetoprotein',
    aliases: ['AFP', 'S-AFP', 'α-fetoprotein', 'Alpha Fetoprotein', 'S-AFP alfa-fetoproteina', 'Alfa-fetoproteina', 'S-AFP Alfa-Fetoproteina'],
    category: 'metabolic',
    canonicalUnit: 'ng/mL',
    alternativeUnits: ['IU/mL', 'kU/L', 'µg/L'],
    defaultReferenceRange: { low: 0, high: 10, unit: 'ng/mL' },
    description: 'Protein produced by fetal liver, used as tumor marker in adults.',
    highIndication: 'May indicate liver cancer, germ cell tumors, or liver regeneration',
    lowIndication: 'Generally not clinically significant',
  },
];

/**
 * All biomarker definitions combined
 */
export const BIOMARKER_DEFINITIONS: BiomarkerDefinition[] = [
  ...cbcBiomarkers,
  ...metabolicBiomarkers,
  ...lipidBiomarkers,
  ...thyroidBiomarkers,
  ...ironBiomarkers,
  ...vitaminBiomarkers,
  ...glycemicBiomarkers,
  ...urinalysisBiomarkers,
  ...liverBiomarkers,
];

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
  other: 'Other',
};

/**
 * Find a biomarker by name or alias (case-insensitive)
 */
export function findBiomarker(nameOrAlias: string): BiomarkerDefinition | undefined {
  const searchTerm = nameOrAlias.toLowerCase().trim();
  return BIOMARKER_DEFINITIONS.find(
    (b) =>
      b.name.toLowerCase() === searchTerm ||
      b.aliases.some((a) => a.toLowerCase() === searchTerm)
  );
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
