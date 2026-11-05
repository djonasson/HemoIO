/**
 * Printed names a name lookup may not know, with the LOINC code of the test
 * each is (or null when it is no test HemoIO describes): the names the
 * matching model is there for. Names only, no values. Used to calibrate the
 * model and its threshold.
 */
export const LABELLED_NAMES: ReadonlyArray<[name: string, key: string | null]> = [
  ['Globuli bianchi totali', '6690-2'],
  ['Conta piastrinica', '777-3'],
  ['Emoglobina totale', '718-7'],
  ['Colesterolo LDL calcolato', '13457-7'],
  ['Transaminasi GPT', '1742-6'],
  ['Transaminasi GOT', '1920-8'],
  ['Ferritina sierica', '2276-4'],
  ['Vitamina B12 sierica', '2132-9'],
  ['Potassio sierico', '2823-3'],
  ['Sodiemia', '2951-2'],
  ['Azotemia', '3091-6'],
  ['Fosfatasi alcalina', '6768-6'],
  ['Bilirubina totale', '1975-2'],
  ['TSH reflex', '3016-3'],
  ['Neutrofili assoluti', '751-8'],
  ['Creatinina urine per litro', '2161-8'],
  ['Total white cell count', '6690-2'],
  ['Serum ferritin level', '2276-4'],
  ['Thyroid stimulating hormone (reflex)', '3016-3'],
  ['Sodio urinario 24h', null],
  ['Durata raccolta', null],
  ['Grado di maturazione alto', null],
  ['Zorblatin', null],
];
