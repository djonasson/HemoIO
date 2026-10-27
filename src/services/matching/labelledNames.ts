/**
 * Printed names no dictionary alias knows, with the test each is (or null
 * when no test is): the names the matching model is there for. Names only,
 * no values. Used to calibrate the model and its threshold.
 */
export const LABELLED_NAMES: ReadonlyArray<[name: string, key: string | null]> = [
  ['Globuli bianchi totali', 'white-blood-cell-count'],
  ['Conta piastrinica', 'platelet-count'],
  ['Emoglobina totale', 'hemoglobin'],
  ['Colesterolo LDL calcolato', 'ldl-cholesterol'],
  ['Transaminasi GPT', 'alanine-aminotransferase'],
  ['Transaminasi GOT', 'aspartate-aminotransferase'],
  ['Ferritina sierica', 'ferritin'],
  ['Vitamina B12 sierica', 'vitamin-b12'],
  ['Potassio sierico', 'potassium'],
  ['Sodiemia', 'sodium'],
  ['Azotemia', 'urea'],
  ['Fosfatasi alcalina', 'alkaline-phosphatase'],
  ['Bilirubina totale', 'bilirubin-total'],
  ['TSH reflex', 'thyroid-stimulating-hormone'],
  ['Neutrofili assoluti', 'neutrophils'],
  ['Creatinina urine per litro', 'urine-creatinine'],
  ['Total white cell count', 'white-blood-cell-count'],
  ['Serum ferritin level', 'ferritin'],
  ['Thyroid stimulating hormone (reflex)', 'thyroid-stimulating-hormone'],
  ['Sodio urinario 24h', null],
  ['Durata raccolta', null],
  ['Grado di maturazione alto', null],
  ['Zorblatin', null],
];
