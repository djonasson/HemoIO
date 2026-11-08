/**
 * The tests the user taught HemoIO: a lab's wording plus its unit, and the
 * LOINC code it was saved under ("Not a LOINC test" is kept as the value's
 * unknown key). A later import matches that wording and unit to the code
 * without asking. Stored in the (sealed) preferences record.
 *
 * The keys are made by `learnedKey` in the analysis service: the printed
 * name, normalised, then "|" and the unit as UCUM, then the marks of a
 * result in words and of a urine sediment section.
 */

/** Marks a learned key ends with: a result printed in words, and a value of a urine sediment section */
export const LEARNED_IN_WORDS = '#words';
export const LEARNED_IN_SEDIMENT = '#sediment';

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
  const notes: string[] = [];
  if (unit.endsWith(LEARNED_IN_SEDIMENT)) {
    unit = unit.slice(0, -LEARNED_IN_SEDIMENT.length);
    notes.push('urine sediment');
  }
  if (unit.endsWith(LEARNED_IN_WORDS)) {
    unit = unit.slice(0, -LEARNED_IN_WORDS.length);
    notes.unshift('in words');
  }
  const said = [unit, ...notes].filter(Boolean).join(', ');
  const wording = key.slice(0, separator);
  return said ? `${wording} (${said})` : wording;
}
