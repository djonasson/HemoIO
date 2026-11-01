/**
 * How units are spelled: one form for each unit, whatever way a report or
 * a user writes it. Used by every layer that compares units.
 */

/**
 * One spelling for units written several ways, keyed by the lowercased unit
 * with the micro sign and single spaces (see normalizeUnitForLookup). A Map,
 * so a unit such as "toString" is never read as an inherited name.
 */
const UNIT_SPELLINGS = new Map<string, string>([
  // ASCII 'u' and micro sign, and case
  ['umol/l', 'µmol/L'],
  ['µmol/l', 'µmol/L'],
  ['nmol/l', 'nmol/L'],
  ['pmol/l', 'pmol/L'],
  ['mg/dl', 'mg/dL'],
  ['mmol/l', 'mmol/L'],
  ['g/dl', 'g/dL'],
  ['g/l', 'g/L'],
  ['ng/ml', 'ng/mL'],
  ['pg/ml', 'pg/mL'],
  ['ug/dl', 'µg/dL'],
  ['µg/dl', 'µg/dL'],
  ['ug/min', 'µg/min'],
  ['u/l', 'U/L'],
  ['iu/l', 'IU/L'],
  ['meq/l', 'mEq/L'],
  ['ml', 'mL'],
  ['cc', 'mL'],
  // Cell counts
  ['/ul', '/µL'],
  ['/µl', '/µL'],
  ['k/ul', 'K/µL'],
  ['k/µl', 'K/µL'],
  ['m/ul', 'M/µL'],
  ['m/µl', 'M/µL'],
  ['cells/ul', 'cells/µL'],
  ['cells/µl', 'cells/µL'],
  ['cell/ul', 'cells/µL'],
  ['cell/µl', 'cells/µL'],
  ['mil', 'million'],
  ['mil.', 'million'],
  // International units, also as Italian reports write them (UI); mU = mIU
  ['miu/l', 'mIU/L'],
  ['mui/l', 'mIU/L'],
  ['mu/l', 'mIU/L'],
  ['uiu/ml', 'µIU/mL'],
  ['µiu/ml', 'µIU/mL'],
  ['uui/ml', 'µIU/mL'],
  ['µui/ml', 'µIU/mL'],
  ['ui/ml', 'IU/mL'],
  ['ui/l', 'IU/L'],
  // HbA1c's IFCC unit, written per mol of haemoglobin
  ['mmol/mol hb', 'mmol/mol'],
  ['mmol/molhb', 'mmol/mol'],
  ['mmol/mol di hb', 'mmol/mol'],
  ['mmol/mol (ifcc)', 'mmol/mol'],
  // eGFR, with a decimal comma or ^2
  ['ml/min/1.73m²', 'mL/min/1.73m²'],
  ['ml/min/1,73m²', 'mL/min/1.73m²'],
  ['ml/min/1.73m^2', 'mL/min/1.73m²'],
  ['ml/min/1,73m^2', 'mL/min/1.73m²'],
  ['ml/min/1.73 m²', 'mL/min/1.73m²'],
  ['ml/min/1,73 m²', 'mL/min/1.73m²'],
  ['ml/min/1.73 m^2', 'mL/min/1.73m²'],
  ['ml/min/1,73 m^2', 'mL/min/1.73m²'],
]);

/**
 * Units reports write with a word that only names what they count per:
 * creatinine ratios ("mg/g cr", "mg/gcreat.", "mg/mmol creatinina") and
 * cells per 100 white cells ("/100WBC", "/100 GB", "/100 leucociti",
 * "/100 globuli bianchi")
 */
const UNIT_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/^mg\/ ?(g|mmol) ?(?:cr|crea|creat|creatinine|creatinina)\.?$/, 'mg/$1'],
  [/^(?:\/|per) ?100 ?(?:wbc|gb|leucociti|leukocytes|white (?:blood )?cells|globuli bianchi)$/, '/100 WBC'],
];

/**
 * A unit's standard spelling: trimmed, single spaces, the micro sign for
 * Greek mu, and one form for units written several ways (the one table every
 * unit check uses)
 */
export function normalizeUnitForLookup(unit: string): string {
  const spelled = unit.trim().replace(/\s+/g, ' ').replace(/\u03bc/g, '\u00b5');
  const lower = spelled.toLowerCase();
  const listed = UNIT_SPELLINGS.get(lower);
  if (listed) return listed;
  const match = UNIT_PATTERNS.find(([pattern]) => pattern.test(lower));
  return match ? lower.replace(match[0], match[1]) : spelled;
}

/** Whether two units are one unit, however each is spelled */
export function unitsMatch(a: string, b: string): boolean {
  return normalizeUnitForLookup(a).toLowerCase() === normalizeUnitForLookup(b).toLowerCase();
}

/**
 * "/100 X" or "per 100 X" where X is a thing counted: not a number
 * ("/100.000" is per 100,000), a volume ("/100 mL") or a mass ("/100 g"),
 * which make a concentration
 */
const PER_HUNDRED_COUNTED = /^(?:\/|per) ?100 ?(?![\d.,])(?!(?:[mµuncd]?[lg])$)\S/i;

/** Whether a unit is a share: so many per 100 of something counted */
export function isPerHundredCounted(unit: string): boolean {
  return PER_HUNDRED_COUNTED.test(normalizeUnitForLookup(unit));
}
