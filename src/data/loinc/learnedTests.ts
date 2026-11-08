/**
 * The tests the user taught HemoIO: a lab's wording plus its unit, and the
 * LOINC code it was saved under ("Not a LOINC test" is kept as the value's
 * unknown key). A later import matches that wording and unit to the code
 * without asking. Stored in the (sealed) preferences record.
 *
 * The keys are made by `learnedKey` in the analysis service: the printed
 * name, normalised, then "|" and the unit as UCUM, then the marks of how
 * the value was printed (see withMarks).
 */

/** How a value was printed, as learning tells wordings apart */
export interface PrintingMarks {
  /** Its result in words ("Assenti") */
  inWords: boolean;
  /** Of a urine sediment section, where it is what the microscope saw */
  ofSediment: boolean;
}

/** Each mark: as a key ends with it, and as the user reads it */
const MARKS: ReadonlyArray<readonly [keyof PrintingMarks, string, string]> = [
  ['inWords', '#words', 'in words'],
  ['ofSediment', '#sediment', 'urine sediment'],
];

/** A learned key of a wording and unit with the marks of how the value was printed */
export function withMarks(key: string, marks: PrintingMarks): string {
  return key + MARKS.filter(([mark]) => marks[mark]).map(([, suffix]) => suffix).join('');
}

/** A saved value as learning reads it */
export interface SavedValue {
  /** The value's learned key: its printed wording and unit */
  key: string;
  /** Its LOINC code, or its unknown key when saved as "Not a LOINC test" */
  code?: string;
  /**
   * The user decided its test: they chose it, saved the AI's choice, or
   * edited the value until it matched
   */
  confirmed: boolean;
}

/**
 * What is learned after saving these values: the code of each value the
 * user confirmed, replacing what was learned for its wording before. A test
 * nobody confirmed (matched by name and unit with no edit) is not learned:
 * it is matched the same way next time anyway.
 */
export function learnFromSaved(
  learned: Readonly<Record<string, string>>,
  values: ReadonlyArray<SavedValue>
): Record<string, string> {
  const next = { ...learned };
  for (const { key, code, confirmed } of values) {
    if (confirmed && key && code) next[key] = code;
  }
  return next;
}

/**
 * A learned key as the user reads it: "glucosio (mg/dL)", the wording alone
 * with no unit, and how it was printed: "batteri (in words, urine sediment)"
 */
export function learnedWording(key: string): string {
  const separator = key.lastIndexOf('|');
  if (separator === -1) return key;
  let unit = key.slice(separator + 1);
  const read = new Set<string>();
  for (let mark = MARKS.find(([, suffix]) => unit.endsWith(suffix)); mark; mark = MARKS.find(([, suffix]) => unit.endsWith(suffix))) {
    unit = unit.slice(0, -mark[1].length);
    read.add(mark[2]);
  }
  const notes = MARKS.map(([, , note]) => note).filter((note) => read.has(note));
  const said = [unit, ...notes].filter(Boolean).join(', ');
  const wording = key.slice(0, separator);
  return said ? `${wording} (${said})` : wording;
}
