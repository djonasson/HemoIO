/**
 * What HemoIO adds to LOINC for the tests it knows well: a standard adult
 * reference range, a patient-facing description, and the units it offers.
 * A code without an entry still works: it shows its LOINC name and the range
 * printed on the report.
 *
 * Entries are keyed by LOINC code. A code with no entry of its own uses the
 * entry of a code it trends with (see Catalog.trendGroup), so one entry can
 * cover, say, glucose in mg/dL and in mmol/L. Units are written so that
 * toUcum reads them.
 */
import type { Catalog } from './catalog';

export interface TestAddon {
  description?: string;
  /** General adult range; may differ by lab and patient */
  referenceRange?: { low?: number; high?: number; unit: string };
  /** The unit the test is shown in unless the user prefers another */
  canonicalUnit?: string;
  /** Other units the test is offered in */
  alternativeUnits?: string[];
  /** What a high value may indicate */
  highIndication?: string;
  /** What a low value may indicate */
  lowIndication?: string;
}

/** Add-ons by LOINC code; the comment above each is the test's former dictionary name */
export const TEST_ADDONS: Readonly<Record<string, TestAddon>> = {
  // White Blood Cell Count
  '6690-2': {
    description: 'Measures the total number of white blood cells, which fight infection.',
    referenceRange: { low: 4.5, high: 11, unit: '10^9/L' },
    canonicalUnit: '10^9/L',
    alternativeUnits: ['K/uL', 'cells/µL', '10^3/µL'],
    highIndication: 'May indicate infection, inflammation, or immune disorders',
    lowIndication: 'May indicate bone marrow problems or autoimmune conditions',
  },
  // Red Blood Cell Count
  '789-8': {
    description: 'Measures the number of red blood cells that carry oxygen.',
    referenceRange: { low: 4.5, high: 5.5, unit: '10^12/L' },
    canonicalUnit: '10^12/L',
    alternativeUnits: ['M/uL', 'million/µL', '10^6/µL'],
    highIndication: 'May indicate dehydration or polycythemia',
    lowIndication: 'May indicate anemia',
  },
  // Hemoglobin
  '718-7': {
    description: 'Protein in red blood cells that carries oxygen.',
    referenceRange: { low: 12, high: 17.5, unit: 'g/dL' },
    canonicalUnit: 'g/dL',
    alternativeUnits: ['g/L', 'mmol/L'],
    highIndication: 'May indicate dehydration or lung disease',
    lowIndication: 'May indicate anemia or blood loss',
  },
  // Hematocrit
  '4544-3': {
    description: 'Percentage of blood volume made up of red blood cells.',
    referenceRange: { low: 36, high: 50, unit: '%' },
    canonicalUnit: '%',
    alternativeUnits: ['L/L', 'ratio'],
    highIndication: 'May indicate dehydration or polycythemia',
    lowIndication: 'May indicate anemia',
  },
  // Platelet Count
  '777-3': {
    description: 'Cell fragments that help blood clot.',
    referenceRange: { low: 150, high: 400, unit: '10^9/L' },
    canonicalUnit: '10^9/L',
    alternativeUnits: ['K/uL', '10^3/µL'],
    highIndication: 'May indicate inflammation or bone marrow disorder',
    lowIndication: 'May indicate bleeding risk or bone marrow problems',
  },
  // Mean Corpuscular Volume
  '787-2': {
    description: 'Average size of red blood cells.',
    referenceRange: { low: 80, high: 100, unit: 'fL' },
    canonicalUnit: 'fL',
    alternativeUnits: ['µm³'],
    highIndication: 'May indicate B12/folate deficiency (macrocytic anemia)',
    lowIndication: 'May indicate iron deficiency (microcytic anemia)',
  },
  // Mean Corpuscular Hemoglobin
  '785-6': {
    description: 'Average amount of hemoglobin per red blood cell.',
    referenceRange: { low: 27, high: 33, unit: 'pg' },
    canonicalUnit: 'pg',
    alternativeUnits: ['fmol'],
    highIndication: 'May indicate macrocytic anemia',
    lowIndication: 'May indicate iron deficiency',
  },
  // Mean Corpuscular Hemoglobin Concentration
  '786-4': {
    description: 'Average concentration of hemoglobin in red blood cells.',
    referenceRange: { low: 32, high: 36, unit: 'g/dL' },
    canonicalUnit: 'g/dL',
    alternativeUnits: ['g/L', '%'],
    highIndication: 'May indicate spherocytosis',
    lowIndication: 'May indicate iron deficiency or thalassemia',
  },
  // Red Cell Distribution Width
  '788-0': {
    description: 'Variation in red blood cell size.',
    referenceRange: { low: 11.5, high: 14.5, unit: '%' },
    canonicalUnit: '%',
    highIndication: 'May indicate mixed anemia or nutritional deficiency',
    lowIndication: 'Generally not clinically significant',
  },
  // Neutrophils
  '751-8': {
    description: 'Most abundant white blood cell type, fights bacterial infections.',
    referenceRange: { low: 1.5, high: 8, unit: '10^9/L' },
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/uL', 'cells/µL'],
    highIndication: 'May indicate bacterial infection or inflammation',
    lowIndication: 'May indicate neutropenia, risk of infection',
  },
  // Neutrophils Percentage
  '770-8': {
    description: 'Percentage of white blood cells that are neutrophils.',
    referenceRange: { low: 40, high: 70, unit: '%' },
    canonicalUnit: '%',
    highIndication: 'May indicate bacterial infection',
    lowIndication: 'May indicate viral infection or other conditions',
  },
  // Lymphocytes
  '731-0': {
    description: 'White blood cells important for immune response.',
    referenceRange: { low: 1, high: 4, unit: '10^9/L' },
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/uL', 'cells/µL'],
    highIndication: 'May indicate viral infection or lymphoproliferative disorder',
    lowIndication: 'May indicate immunodeficiency or HIV',
  },
  // Lymphocytes Percentage
  '736-9': {
    description: 'Percentage of white blood cells that are lymphocytes.',
    referenceRange: { low: 20, high: 40, unit: '%' },
    canonicalUnit: '%',
    highIndication: 'May indicate viral infection',
    lowIndication: 'May indicate bacterial infection or immunodeficiency',
  },
  // Monocytes
  '742-7': {
    description: 'White blood cells that become macrophages in tissues.',
    referenceRange: { low: 0.2, high: 1, unit: '10^9/L' },
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/uL', 'cells/µL'],
    highIndication: 'May indicate chronic infection or inflammation',
    lowIndication: 'Generally not clinically significant',
  },
  // Monocytes Percentage
  '5905-5': {
    description: 'Percentage of white blood cells that are monocytes.',
    referenceRange: { low: 2, high: 10, unit: '%' },
    canonicalUnit: '%',
    highIndication: 'May indicate chronic infection',
    lowIndication: 'Generally not clinically significant',
  },
  // Eosinophils
  '711-2': {
    description: 'White blood cells involved in allergic responses and parasites.',
    referenceRange: { low: 0, high: 0.5, unit: '10^9/L' },
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/uL', 'cells/µL'],
    highIndication: 'May indicate allergies, parasitic infection, or asthma',
    lowIndication: 'Generally not clinically significant',
  },
  // Eosinophils Percentage
  '713-8': {
    description: 'Percentage of white blood cells that are eosinophils.',
    referenceRange: { low: 1, high: 6, unit: '%' },
    canonicalUnit: '%',
    highIndication: 'May indicate allergies or parasitic infection',
    lowIndication: 'Generally not clinically significant',
  },
  // Basophils
  '704-7': {
    description: 'Rarest white blood cell type, involved in allergic reactions.',
    referenceRange: { low: 0, high: 0.2, unit: '10^9/L' },
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/uL', 'cells/µL'],
    highIndication: 'May indicate allergic reaction or myeloproliferative disorder',
    lowIndication: 'Generally not clinically significant',
  },
  // Basophils Percentage
  '706-2': {
    description: 'Percentage of white blood cells that are basophils.',
    referenceRange: { low: 0, high: 2, unit: '%' },
    canonicalUnit: '%',
    highIndication: 'May indicate allergic reaction',
    lowIndication: 'Generally not clinically significant',
  },
  // Nucleated Red Blood Cells
  '30392-5': {
    description: 'Immature red blood cells, normally absent from adult blood.',
    referenceRange: { low: 0, high: 0.1, unit: '10^9/L' },
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/µL'],
    highIndication: 'May indicate bone marrow stress, severe anemia or hypoxia',
    lowIndication: 'Normal finding',
  },
  // Nucleated Red Blood Cells Percentage
  '58413-6': {
    description: 'Immature red blood cells per 100 white blood cells, normally zero in adults.',
    canonicalUnit: '/100 WBC',
    alternativeUnits: ['%'],
    highIndication: 'May indicate bone marrow stress, severe anemia or hypoxia',
    lowIndication: 'Normal finding',
  },
  // Reticulocyte Count
  '60474-4': {
    description: 'Young red blood cells in the blood, showing how fast the bone marrow makes red cells.',
    referenceRange: { low: 25, high: 100, unit: '10^9/L' },
    canonicalUnit: '10^9/L',
    alternativeUnits: ['10^3/µL', 'K/µL'],
    highIndication: 'May indicate blood loss, hemolysis or recovery from anemia',
    lowIndication: 'May indicate reduced red cell production by the bone marrow',
  },
  // Reticulocytes Percentage
  '17849-1': {
    description: 'Young red blood cells as a share of all red blood cells.',
    referenceRange: { low: 0.5, high: 2.5, unit: '%' },
    canonicalUnit: '%',
    alternativeUnits: ['‰'],
    highIndication: 'May indicate blood loss, hemolysis or recovery from anemia',
    lowIndication: 'May indicate reduced red cell production by the bone marrow',
  },
  // Erythrocyte Sedimentation Rate
  '30341-2': {
    description: 'Rate at which red blood cells settle, indicates inflammation.',
    referenceRange: { low: 0, high: 20, unit: 'mm/h' },
    canonicalUnit: 'mm/h',
    alternativeUnits: ['mm/hr'],
    highIndication: 'May indicate inflammation, infection, or autoimmune disease',
    lowIndication: 'Generally not clinically significant',
  },
  // C-Reactive Protein
  '1988-5': {
    description: 'Protein that rises with inflammation in the body.',
    referenceRange: { low: 0, high: 5, unit: 'mg/L' },
    canonicalUnit: 'mg/L',
    alternativeUnits: ['mg/dL'],
    highIndication: 'May indicate infection, inflammation, or cardiovascular risk',
    lowIndication: 'Generally indicates low inflammation',
  },
  // Glucose
  '2345-7': {
    description: 'Blood sugar level, primary energy source for cells.',
    referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    highIndication: 'May indicate diabetes or prediabetes',
    lowIndication: 'May indicate hypoglycemia',
  },
  // Creatinine
  '2160-0': {
    description: 'Waste product filtered by kidneys, indicates kidney function.',
    referenceRange: { low: 0.7, high: 1.3, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L'],
    highIndication: 'May indicate kidney dysfunction',
    lowIndication: 'May indicate low muscle mass',
  },
  // Blood Urea Nitrogen
  '3094-0': {
    description: 'Waste product from protein metabolism, filtered by kidneys.',
    referenceRange: { low: 7, high: 20, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    highIndication: 'May indicate kidney disease or dehydration',
    lowIndication: 'May indicate liver disease or malnutrition',
  },
  // Urea
  '3091-6': {
    description: 'Waste product from protein metabolism, filtered by kidneys. Reported as urea, not as its nitrogen (BUN).',
    referenceRange: { low: 17, high: 43, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    highIndication: 'May indicate kidney disease or dehydration',
    lowIndication: 'May indicate liver disease or malnutrition',
  },
  // Uric Acid
  '3084-1': {
    description: 'End product of purine metabolism, excreted by the kidneys.',
    referenceRange: { low: 3.5, high: 7.2, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L', 'mmol/L'],
    highIndication: 'May indicate gout, kidney disease or high purine intake',
    lowIndication: 'Rarely significant; may indicate liver disease',
  },
  // Sodium
  '2951-2': {
    description: 'Electrolyte important for fluid balance and nerve function.',
    referenceRange: { low: 136, high: 145, unit: 'mEq/L' },
    canonicalUnit: 'mEq/L',
    alternativeUnits: ['mmol/L'],
    highIndication: 'May indicate dehydration or hormone imbalance',
    lowIndication: 'May indicate overhydration or kidney problems',
  },
  // Potassium
  '2823-3': {
    description: 'Electrolyte critical for heart and muscle function.',
    referenceRange: { low: 3.5, high: 5, unit: 'mEq/L' },
    canonicalUnit: 'mEq/L',
    alternativeUnits: ['mmol/L'],
    highIndication: 'May indicate kidney disease or medication effects',
    lowIndication: 'May indicate diuretic use or GI losses',
  },
  // Chloride
  '2075-0': {
    description: 'Electrolyte that helps maintain fluid balance.',
    referenceRange: { low: 98, high: 106, unit: 'mEq/L' },
    canonicalUnit: 'mEq/L',
    alternativeUnits: ['mmol/L'],
    highIndication: 'May indicate dehydration or kidney disease',
    lowIndication: 'May indicate vomiting or hormone imbalance',
  },
  // Carbon Dioxide
  '2028-9': {
    description: 'Reflects acid-base balance in the blood.',
    referenceRange: { low: 23, high: 29, unit: 'mEq/L' },
    canonicalUnit: 'mEq/L',
    alternativeUnits: ['mmol/L'],
    highIndication: 'May indicate metabolic alkalosis or lung disease',
    lowIndication: 'May indicate metabolic acidosis or kidney disease',
  },
  // Calcium
  '17861-6': {
    description: 'Mineral essential for bones, nerves, and muscles.',
    referenceRange: { low: 8.5, high: 10.5, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    highIndication: 'May indicate hyperparathyroidism or cancer',
    lowIndication: 'May indicate vitamin D deficiency or kidney disease',
  },
  // Magnesium
  '19123-9': {
    description: 'Mineral essential for nerve and muscle function, bone health, and energy production.',
    referenceRange: { low: 1.7, high: 2.4, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L', 'mEq/L'],
    highIndication: 'May indicate kidney disease, excessive supplementation, or adrenal insufficiency',
    lowIndication: 'May indicate malnutrition, alcoholism, diabetes, or medication effects',
  },
  // eGFR
  '98979-8': {
    description: 'Estimate of how well kidneys filter waste.',
    referenceRange: { low: 90, high: 120, unit: 'mL/min/1.73m²' },
    canonicalUnit: 'mL/min/1.73m²',
    highIndication: 'Generally not concerning',
    lowIndication: 'May indicate chronic kidney disease',
  },
  // Total Cholesterol
  '2093-3': {
    description: 'Total amount of cholesterol in the blood.',
    referenceRange: { low: 0, high: 200, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L', 'mmo/L'],
    highIndication: 'Increased cardiovascular disease risk',
    lowIndication: 'May indicate malnutrition or hyperthyroidism',
  },
  // LDL Cholesterol
  '13457-7': {
    description: 'Low-density lipoprotein, deposits cholesterol in arteries.',
    referenceRange: { low: 0, high: 100, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    highIndication: 'Increased risk of atherosclerosis',
    lowIndication: 'Generally desirable',
  },
  // HDL Cholesterol
  '2085-9': {
    description: 'High-density lipoprotein, removes cholesterol from arteries.',
    referenceRange: { low: 40, high: 60, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L', 'mmo/L'],
    highIndication: 'Generally protective',
    lowIndication: 'Increased cardiovascular risk',
  },
  // Triglycerides
  '2571-8': {
    description: 'Type of fat in the blood from food and liver production.',
    referenceRange: { low: 0, high: 150, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    highIndication: 'Increased cardiovascular and pancreatitis risk',
    lowIndication: 'Generally not concerning',
  },
  // VLDL Cholesterol
  '13458-5': {
    description: 'Very low-density lipoprotein, carries triglycerides.',
    referenceRange: { low: 5, high: 40, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    highIndication: 'Increased cardiovascular risk',
    lowIndication: 'Generally not concerning',
  },
  // Non-HDL Cholesterol
  '43396-1': {
    description: 'Total cholesterol minus HDL, all atherogenic particles.',
    referenceRange: { low: 0, high: 130, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    highIndication: 'Increased cardiovascular risk',
    lowIndication: 'Generally desirable',
  },
  // Thyroid Stimulating Hormone
  '3016-3': {
    description: 'Pituitary hormone that controls thyroid function.',
    referenceRange: { low: 0.4, high: 4, unit: 'mIU/L' },
    canonicalUnit: 'mIU/L',
    alternativeUnits: ['µIU/mL'],
    highIndication: 'May indicate hypothyroidism',
    lowIndication: 'May indicate hyperthyroidism',
  },
  // Free T4
  '3024-7': {
    description: 'Unbound thyroid hormone available to tissues.',
    referenceRange: { low: 0.8, high: 1.8, unit: 'ng/dL' },
    canonicalUnit: 'ng/dL',
    alternativeUnits: ['pmol/L'],
    highIndication: 'May indicate hyperthyroidism',
    lowIndication: 'May indicate hypothyroidism',
  },
  // Total T4
  '3026-2': {
    description: 'Total thyroxine (bound and free) in blood.',
    referenceRange: { low: 4.5, high: 12, unit: 'µg/dL' },
    canonicalUnit: 'µg/dL',
    alternativeUnits: ['nmol/L'],
    highIndication: 'May indicate hyperthyroidism',
    lowIndication: 'May indicate hypothyroidism',
  },
  // Free T3
  '3051-0': {
    description: 'Active thyroid hormone available to tissues.',
    referenceRange: { low: 2.3, high: 4.2, unit: 'pg/mL' },
    canonicalUnit: 'pg/mL',
    alternativeUnits: ['pmol/L'],
    highIndication: 'May indicate hyperthyroidism',
    lowIndication: 'May indicate hypothyroidism or illness',
  },
  // Total T3
  '3053-6': {
    description: 'Total triiodothyronine in blood.',
    referenceRange: { low: 80, high: 200, unit: 'ng/dL' },
    canonicalUnit: 'ng/dL',
    alternativeUnits: ['nmol/L'],
    highIndication: 'May indicate hyperthyroidism',
    lowIndication: 'May indicate hypothyroidism',
  },
  // TPO Antibodies
  '8099-4': {
    description: 'Antibodies against thyroid peroxidase enzyme, marker for autoimmune thyroid disease.',
    referenceRange: { low: 0, high: 35, unit: 'IU/mL' },
    canonicalUnit: 'IU/mL',
    alternativeUnits: ['U/mL', 'kIU/L'],
    highIndication: 'May indicate Hashimoto thyroiditis or Graves disease',
    lowIndication: 'Normal finding - no autoimmune thyroid disease',
  },
  // Serum Iron
  '2498-4': {
    description: 'Amount of iron circulating in the blood.',
    referenceRange: { low: 60, high: 170, unit: 'µg/dL' },
    canonicalUnit: 'µg/dL',
    alternativeUnits: ['µmol/L'],
    highIndication: 'May indicate hemochromatosis or iron overload',
    lowIndication: 'May indicate iron deficiency',
  },
  // Ferritin
  '2276-4': {
    description: 'Protein that stores iron, reflects iron stores.',
    referenceRange: { low: 20, high: 200, unit: 'ng/mL' },
    canonicalUnit: 'ng/mL',
    alternativeUnits: ['µg/L', 'pmol/L'],
    highIndication: 'May indicate iron overload or inflammation',
    lowIndication: 'May indicate iron deficiency',
  },
  // Total Iron Binding Capacity
  '2500-7': {
    description: 'Measures capacity of transferrin to bind iron.',
    referenceRange: { low: 250, high: 400, unit: 'µg/dL' },
    canonicalUnit: 'µg/dL',
    alternativeUnits: ['µmol/L'],
    highIndication: 'May indicate iron deficiency',
    lowIndication: 'May indicate iron overload or chronic disease',
  },
  // Transferrin Saturation
  '2502-3': {
    description: 'Percentage of transferrin bound to iron.',
    referenceRange: { low: 20, high: 50, unit: '%' },
    canonicalUnit: '%',
    highIndication: 'May indicate iron overload',
    lowIndication: 'May indicate iron deficiency',
  },
  // Transferrin
  '3034-6': {
    description: 'Protein that transports iron in the blood.',
    referenceRange: { low: 200, high: 360, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['g/L'],
    highIndication: 'May indicate iron deficiency',
    lowIndication: 'May indicate iron overload or malnutrition',
  },
  // Vitamin B12
  '2132-9': {
    description: 'Essential vitamin for nerve function and blood cell formation.',
    referenceRange: { low: 200, high: 900, unit: 'pg/mL' },
    canonicalUnit: 'pg/mL',
    alternativeUnits: ['pmol/L', 'ng/L'],
    highIndication: 'Rarely concerning, may indicate supplementation',
    lowIndication: 'May indicate deficiency causing anemia or neuropathy',
  },
  // Vitamin D
  '62292-8': {
    description: 'Vitamin important for bone health and immune function.',
    referenceRange: { low: 30, high: 100, unit: 'ng/mL' },
    canonicalUnit: 'ng/mL',
    alternativeUnits: ['nmol/L'],
    highIndication: 'May indicate toxicity from oversupplementation',
    lowIndication: 'May indicate deficiency affecting bones and immunity',
  },
  // Folate
  '2284-8': {
    description: 'B vitamin essential for cell division and DNA synthesis.',
    referenceRange: { low: 2.7, high: 17, unit: 'ng/mL' },
    canonicalUnit: 'ng/mL',
    alternativeUnits: ['nmol/L'],
    highIndication: 'Generally not concerning',
    lowIndication: 'May indicate deficiency causing anemia',
  },
  // Vitamin A
  '2923-1': {
    description: 'Vitamin important for vision, immunity, and skin.',
    referenceRange: { low: 30, high: 65, unit: 'µg/dL' },
    canonicalUnit: 'µg/dL',
    alternativeUnits: ['µmol/L'],
    highIndication: 'May indicate toxicity',
    lowIndication: 'May indicate deficiency affecting vision',
  },
  // Hemoglobin A1c
  '4548-4': {
    description: 'Average blood sugar over past 2-3 months.',
    referenceRange: { low: 4, high: 5.6, unit: '%' },
    canonicalUnit: '%',
    alternativeUnits: ['mmol/mol'],
    highIndication: 'May indicate diabetes or prediabetes',
    lowIndication: 'May indicate hypoglycemia or hemolytic conditions',
  },
  // Fructosamine
  '15069-8': {
    description: 'Average blood sugar over past 2-3 weeks.',
    referenceRange: { low: 200, high: 285, unit: 'µmol/L' },
    canonicalUnit: 'µmol/L',
    highIndication: 'May indicate poor glycemic control',
    lowIndication: 'Generally not concerning',
  },
  // Urine pH
  '2756-5': {
    description: 'Acidity or alkalinity of urine.',
    referenceRange: { low: 5, high: 8, unit: '[pH]' },
    canonicalUnit: '[pH]',
    highIndication: 'May indicate UTI or alkaline diet',
    lowIndication: 'May indicate acidosis or high protein diet',
  },
  // Urine Specific Gravity
  '2965-2': {
    description: 'Concentration of urine, reflects hydration status.',
    referenceRange: { low: 1.005, high: 1.03, unit: '1' },
    canonicalUnit: '1',
    highIndication: 'May indicate dehydration',
    lowIndication: 'May indicate overhydration or kidney problems',
  },
  // Urine Protein
  '2888-6': {
    description: 'Protein in urine, normally minimal.',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['g/L', 'mg/L'],
    highIndication: 'May indicate kidney disease',
    lowIndication: 'Normal finding',
  },
  // Urine Glucose
  '2350-7': {
    description: 'Glucose in urine, normally absent.',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    highIndication: 'May indicate diabetes or renal glycosuria',
    lowIndication: 'Normal finding',
  },
  // Urine Ketones
  '5797-6': {
    description: 'Ketone bodies in urine from fat metabolism.',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mmol/L'],
    highIndication: 'May indicate diabetic ketoacidosis or fasting',
    lowIndication: 'Normal finding',
  },
  // Urine Blood
  '49137-3': {
    description: 'Haemoglobin in urine by dipstick, normally negative.',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['mg/L', 'Ery/µL'],
    highIndication: 'May indicate blood in the urine (UTI, stones, kidney disease) or haemoglobin from hemolysis',
    lowIndication: 'Normal finding',
  },
  // Urine Red Blood Cells
  '13945-1': {
    description: 'Red blood cells counted in urine, by microscopy or flow cytometry.',
    canonicalUnit: 'RBC/HPF',
    alternativeUnits: ['/HPF', 'per campo', 'eritrociti per campo', '/µL', 'cells/µL'],
    highIndication: 'May indicate UTI, kidney stones, or kidney disease',
    lowIndication: 'Normal finding',
  },
  // Urine WBC
  '5821-4': {
    description: 'White blood cells in urine, indicates infection.',
    canonicalUnit: 'WBC/HPF',
    alternativeUnits: ['/µL', 'cells/µL'],
    highIndication: 'May indicate urinary tract infection',
    lowIndication: 'Normal finding',
  },
  // Urine Leukocyte Esterase
  '5799-2': {
    description: 'Enzyme from white blood cells, indicates infection.',
    highIndication: 'May indicate urinary tract infection',
    lowIndication: 'Normal finding',
  },
  // Urine Nitrites
  '5802-4': {
    description: 'Produced by bacteria, indicates infection.',
    highIndication: 'May indicate bacterial UTI',
    lowIndication: 'Normal finding',
  },
  // Microalbumin
  '14957-5': {
    description: 'Small amounts of albumin in urine, early kidney damage marker.',
    referenceRange: { low: 0, high: 30, unit: 'mg/L' },
    canonicalUnit: 'mg/L',
    alternativeUnits: ['µg/min'],
    highIndication: 'May indicate early diabetic nephropathy',
    lowIndication: 'Normal finding',
  },
  // Urine Epithelial Cells
  '5787-7': {
    description: 'Cells from urinary tract lining in urine.',
    canonicalUnit: '/HPF',
    alternativeUnits: ['/µL', 'cells/µL'],
    highIndication: 'May indicate contamination or urinary tract issues',
    lowIndication: 'Normal finding',
  },
  // Urine Creatinine
  '2161-8': {
    description: 'Creatinine concentration in urine, used to assess kidney function and calculate ratios.',
    referenceRange: { low: 20, high: 300, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L', 'g/L', 'mmol/L'],
    highIndication: 'May indicate concentrated urine or high muscle mass',
    lowIndication: 'May indicate dilute urine or kidney dysfunction',
  },
  // Urine Urea
  '3092-4': {
    description: 'Urea concentration in urine.',
    canonicalUnit: 'g/L',
    alternativeUnits: ['mmol/L', 'mg/dL'],
    highIndication: 'May indicate high protein intake or catabolism',
    lowIndication: 'May indicate low protein intake or kidney dysfunction',
  },
  // Urine Bilirubin
  '20505-4': {
    description: 'Bilirubin in urine, normally absent.',
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L'],
    highIndication: 'May indicate liver disease or bile duct obstruction',
    lowIndication: 'Normal finding',
  },
  // Urine Urobilinogen
  '20405-7': {
    description: 'Breakdown product of bilirubin, normally present in small amounts.',
    referenceRange: { low: 0.1, high: 1, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L', 'EU/dL'],
    highIndication: 'May indicate hemolysis or liver disease',
    lowIndication: 'May indicate bile duct obstruction',
  },
  // Albumin Creatinine Ratio
  '9318-7': {
    description: 'Ratio of albumin to creatinine in urine, sensitive marker for kidney damage.',
    referenceRange: { low: 0, high: 30, unit: 'mg/g' },
    canonicalUnit: 'mg/g',
    alternativeUnits: ['mg/mmol'],
    highIndication: 'May indicate diabetic nephropathy or kidney disease',
    lowIndication: 'Normal finding',
  },
  // Protein Creatinine Ratio
  '2890-2': {
    description: 'Ratio of protein to creatinine in urine, estimates 24-hour protein excretion.',
    referenceRange: { low: 0, high: 150, unit: 'mg/g' },
    canonicalUnit: 'mg/g',
    alternativeUnits: ['mg/mmol'],
    highIndication: 'May indicate kidney disease or proteinuria',
    lowIndication: 'Normal finding',
  },
  // Urine Volume
  '3167-4': {
    description: 'Total urine output over 24 hours.',
    referenceRange: { low: 800, high: 2000, unit: 'mL' },
    canonicalUnit: 'mL',
    alternativeUnits: ['L', 'mL/24h'],
    highIndication: 'May indicate diabetes insipidus or excessive fluid intake',
    lowIndication: 'May indicate dehydration or kidney disease',
  },
  // 24-Hour Urine Albumin
  '1755-8': {
    description: 'Total albumin excreted in 24-hour urine collection.',
    referenceRange: { low: 0, high: 30, unit: 'mg/24h' },
    canonicalUnit: 'mg/24h',
    alternativeUnits: ['mg/day', 'g/24h'],
    highIndication: 'May indicate kidney disease or diabetic nephropathy',
    lowIndication: 'Normal finding',
  },
  // 24-Hour Urine Creatinine
  '2162-6': {
    description: 'Total creatinine excreted in 24-hour urine collection; also checks that the collection is complete.',
    referenceRange: { low: 0.8, high: 1.9, unit: 'g/24h' },
    canonicalUnit: 'g/24h',
    alternativeUnits: ['mg/24h', 'mmol/24h', 'µmol/24h'],
    highIndication: 'May indicate high muscle mass or over-collection',
    lowIndication: 'May indicate incomplete collection, low muscle mass or kidney dysfunction',
  },
  // 24-Hour Urine Urea
  '48999-7': {
    description: 'Total urea excreted in 24-hour urine collection, reflecting protein intake.',
    referenceRange: { low: 25, high: 42, unit: 'g/24h' },
    canonicalUnit: 'g/24h',
    alternativeUnits: ['mmol/24h'],
    highIndication: 'May indicate high protein intake or catabolism',
    lowIndication: 'May indicate low protein intake or kidney dysfunction',
  },
  // Alanine Aminotransferase
  '1742-6': {
    description: 'Liver enzyme, elevated in liver damage.',
    referenceRange: { low: 7, high: 56, unit: 'U/L' },
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    highIndication: 'May indicate liver disease or damage',
    lowIndication: 'Generally not concerning',
  },
  // Aspartate Aminotransferase
  '1920-8': {
    description: 'Enzyme found in liver, heart, and muscles.',
    referenceRange: { low: 10, high: 40, unit: 'U/L' },
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    highIndication: 'May indicate liver or muscle damage',
    lowIndication: 'Generally not concerning',
  },
  // Alkaline Phosphatase
  '6768-6': {
    description: 'Enzyme from liver and bones.',
    referenceRange: { low: 44, high: 147, unit: 'U/L' },
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    highIndication: 'May indicate liver or bone disease',
    lowIndication: 'May indicate malnutrition or hypothyroidism',
  },
  // Bilirubin Total
  '1975-2': {
    description: 'Breakdown product of hemoglobin, processed by liver.',
    referenceRange: { low: 0.1, high: 1.2, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L'],
    highIndication: 'May indicate liver disease or hemolysis',
    lowIndication: 'Generally not concerning',
  },
  // Bilirubin Direct
  '1968-7': {
    description: 'Bilirubin processed by the liver.',
    referenceRange: { low: 0, high: 0.3, unit: 'mg/dL' },
    canonicalUnit: 'mg/dL',
    alternativeUnits: ['µmol/L'],
    highIndication: 'May indicate liver or bile duct obstruction',
    lowIndication: 'Generally not concerning',
  },
  // Gamma-Glutamyl Transferase
  '2324-2': {
    description: 'Liver enzyme, sensitive to alcohol and bile duct issues.',
    referenceRange: { low: 0, high: 65, unit: 'U/L' },
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    highIndication: 'May indicate liver disease or alcohol use',
    lowIndication: 'Generally not concerning',
  },
  // Albumin
  '1751-7': {
    description: 'Main protein made by the liver.',
    referenceRange: { low: 3.5, high: 5, unit: 'g/dL' },
    canonicalUnit: 'g/dL',
    alternativeUnits: ['g/L'],
    highIndication: 'May indicate dehydration',
    lowIndication: 'May indicate liver disease or malnutrition',
  },
  // Total Protein
  '2885-2': {
    description: 'Total albumin and globulin in blood.',
    referenceRange: { low: 6, high: 8.3, unit: 'g/dL' },
    canonicalUnit: 'g/dL',
    alternativeUnits: ['g/L'],
    highIndication: 'May indicate dehydration or chronic inflammation',
    lowIndication: 'May indicate liver disease or malnutrition',
  },
  // Amylase
  '1798-8': {
    description: 'Enzyme that helps digest carbohydrates, produced by pancreas and salivary glands.',
    referenceRange: { low: 25, high: 125, unit: 'U/L' },
    canonicalUnit: 'U/L',
    alternativeUnits: ['IU/L'],
    highIndication: 'May indicate pancreatitis, salivary gland disorders, or bowel obstruction',
    lowIndication: 'May indicate pancreatic insufficiency or liver disease',
  },
  // Alpha-fetoprotein
  '1834-1': {
    description: 'Protein produced by fetal liver, used as tumor marker in adults.',
    referenceRange: { low: 0, high: 10, unit: 'ng/mL' },
    canonicalUnit: 'ng/mL',
    alternativeUnits: ['IU/mL', 'kU/L', 'µg/L'],
    highIndication: 'May indicate liver cancer, germ cell tumors, or liver regeneration',
    lowIndication: 'Generally not clinically significant',
  },
  // Semen Volume
  '3160-9': {
    description: 'Total volume of ejaculate.',
    referenceRange: { low: 1.5, high: 5, unit: 'mL' },
    canonicalUnit: 'mL',
    highIndication: 'May indicate inflammation or infection',
    lowIndication: 'May indicate obstruction, retrograde ejaculation, or hormonal issues',
  },
  // Liquefaction Time
  '10580-9': {
    description: 'Time for semen to liquefy after ejaculation.',
    referenceRange: { low: 0, high: 60, unit: 'min' },
    canonicalUnit: 'min',
    alternativeUnits: ['minutes', 'minuti'],
    highIndication: 'Delayed liquefaction may affect sperm motility',
    lowIndication: 'Normal finding',
  },
  // Sperm Concentration
  '9780-8': {
    description: 'Number of sperm per milliliter of semen.',
    referenceRange: { low: 15, high: 200, unit: '10^6/mL' },
    canonicalUnit: '10^6/mL',
    alternativeUnits: ['mil/mL', 'million/mL', 'M/mL'],
    highIndication: 'Generally positive for fertility',
    lowIndication: 'Oligozoospermia - may affect fertility',
  },
  // Total Sperm Count
  '107184-4': {
    description: 'Total number of sperm in the ejaculate.',
    referenceRange: { low: 39, high: 500, unit: '10^6' },
    canonicalUnit: '10^6',
    alternativeUnits: ['million'],
    highIndication: 'Generally positive for fertility',
    lowIndication: 'May indicate reduced fertility potential',
  },
  // Normal Sperm Morphology
  '10622-9': {
    description: 'Percentage of sperm with normal shape (WHO 5th edition criteria).',
    referenceRange: { low: 4, high: 100, unit: '%' },
    canonicalUnit: '%',
    highIndication: 'Positive for fertility',
    lowIndication: 'Teratozoospermia - may affect fertility',
  },
  // Sperm Vitality
  '10613-8': {
    description: 'Percentage of live sperm (eosin exclusion test).',
    referenceRange: { low: 58, high: 100, unit: '%' },
    canonicalUnit: '%',
    highIndication: 'Positive for fertility',
    lowIndication: 'Necrozoospermia - may indicate infection or epididymal dysfunction',
  },
  // Total Progressive Motility
  '14194-5': {
    description: 'Total percentage of sperm with progressive movement (rapid + slow).',
    referenceRange: { low: 32, high: 100, unit: '%' },
    canonicalUnit: '%',
    highIndication: 'Positive for fertility',
    lowIndication: 'Asthenozoospermia - may affect fertility',
  },
  // Total Motility
  '6800-7': {
    description: 'Total percentage of moving sperm (progressive + non-progressive).',
    referenceRange: { low: 40, high: 100, unit: '%' },
    canonicalUnit: '%',
    highIndication: 'Positive for fertility',
    lowIndication: 'May affect fertility potential',
  },
  // Semen pH
  '2752-4': {
    description: 'Acidity/alkalinity of semen.',
    referenceRange: { low: 7.2, high: 8, unit: '[pH]' },
    canonicalUnit: '[pH]',
    highIndication: 'May indicate infection',
    lowIndication: 'May indicate ejaculatory duct obstruction or seminal vesicle agenesis',
  },
  // Serum Albumin (Electrophoresis)
  '13980-8': {
    description: 'Albumin fraction in serum protein electrophoresis.',
    referenceRange: { low: 55, high: 65, unit: '%' },
    canonicalUnit: '%',
    alternativeUnits: ['g/dL', 'g/L'],
    highIndication: 'May indicate dehydration',
    lowIndication: 'May indicate liver disease, malnutrition, or inflammation',
  },
  // Alpha-1 Globulin
  '13978-2': {
    description: 'Alpha-1 globulin fraction including alpha-1 antitrypsin.',
    referenceRange: { low: 2, high: 5, unit: '%' },
    canonicalUnit: '%',
    alternativeUnits: ['g/dL', 'g/L'],
    highIndication: 'May indicate acute inflammation',
    lowIndication: 'May indicate alpha-1 antitrypsin deficiency',
  },
  // Alpha-2 Globulin
  '13981-6': {
    description: 'Alpha-2 globulin fraction including haptoglobin and macroglobulin.',
    referenceRange: { low: 6, high: 10, unit: '%' },
    canonicalUnit: '%',
    alternativeUnits: ['g/dL', 'g/L'],
    highIndication: 'May indicate acute inflammation or nephrotic syndrome',
    lowIndication: 'May indicate hemolysis or malnutrition',
  },
  // Beta Globulin
  '13982-4': {
    description: 'Beta globulin fraction including transferrin and complement.',
    referenceRange: { low: 8, high: 14, unit: '%' },
    canonicalUnit: '%',
    alternativeUnits: ['g/dL', 'g/L'],
    highIndication: 'May indicate iron deficiency or estrogen increase',
    lowIndication: 'May indicate malnutrition',
  },
  // Gamma Globulin
  '13983-2': {
    description: 'Gamma globulin fraction containing immunoglobulins.',
    referenceRange: { low: 12, high: 20, unit: '%' },
    canonicalUnit: '%',
    alternativeUnits: ['g/dL', 'g/L'],
    highIndication: 'May indicate chronic infection, liver disease, or myeloma',
    lowIndication: 'May indicate immunodeficiency',
  },
};

/**
 * The add-on for a code: its own entry, else the entry of its trend group,
 * else that of the first code in the group that has one
 */
export function getAddon(catalog: Catalog, code: string): TestAddon | undefined {
  const own = TEST_ADDONS[code];
  if (own) return own;
  const trendGroup = catalog.trendGroup(code);
  const groupEntry = TEST_ADDONS[trendGroup];
  if (groupEntry) return groupEntry;
  const member = catalog.groupCodes(trendGroup).find((other) => TEST_ADDONS[other]);
  return member ? TEST_ADDONS[member] : undefined;
}
