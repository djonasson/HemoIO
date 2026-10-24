/**
 * Curated groups of biomarkers that are read together. Every member of a
 * group is related to every other member, so relations are symmetric.
 */
export const RELATED_BIOMARKER_GROUPS: Readonly<Record<string, readonly string[]>> = {
  lipids: [
    'total-cholesterol',
    'ldl-cholesterol',
    'hdl-cholesterol',
    'triglycerides',
    'vldl-cholesterol',
    'non-hdl-cholesterol',
  ],
  'cbc-indices': [
    'red-blood-cell-count',
    'hemoglobin',
    'hematocrit',
    'mean-corpuscular-volume',
    'mean-corpuscular-hemoglobin',
    'mean-corpuscular-hemoglobin-concentration',
    'red-cell-distribution-width',
  ],
  thyroid: [
    'thyroid-stimulating-hormone',
    'free-t4',
    'total-t4',
    'free-t3',
    'total-t3',
    'tpo-antibodies',
  ],
  kidney: [
    'creatinine',
    'blood-urea-nitrogen',
    'egfr',
    'urine-creatinine',
    'microalbumin',
    'albumin-creatinine-ratio',
    'protein-creatinine-ratio',
  ],
  liver: [
    'alanine-aminotransferase',
    'aspartate-aminotransferase',
    'alkaline-phosphatase',
    'bilirubin-total',
    'bilirubin-direct',
    'gamma-glutamyl-transferase',
    'albumin',
    'total-protein',
  ],
  iron: [
    'serum-iron',
    'ferritin',
    'total-iron-binding-capacity',
    'transferrin-saturation',
    'transferrin',
  ],
  'glucose-metabolism': ['glucose', 'hemoglobin-a1c', 'fructosamine', 'urine-glucose'],
  electrolytes: ['sodium', 'potassium', 'chloride', 'carbon-dioxide', 'calcium', 'magnesium'],
};

/** Keys related to `key`: the other members of every group it belongs to */
export function relatedKeysFor(key: string): string[] {
  const related = new Set<string>();
  for (const group of Object.values(RELATED_BIOMARKER_GROUPS)) {
    if (!group.includes(key)) continue;
    for (const member of group) if (member !== key) related.add(member);
  }
  return [...related];
}
