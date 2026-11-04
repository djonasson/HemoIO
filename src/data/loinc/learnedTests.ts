/**
 * The tests the user taught HemoIO: a lab's wording plus its unit, and the
 * LOINC code it was saved under ("Not a LOINC test" is kept as the value's
 * unknown key). A later import matches that wording and unit to the code
 * without asking. Stored in the (sealed) preferences record.
 *
 * The keys are made by `learnedKey` in the analysis service: the printed
 * name, normalised, then "|" and the unit as UCUM.
 */

/** The prefix of a value's unknown key, which "Not a LOINC test" is learned as */
const NOT_A_LOINC_TEST_PREFIX = 'unknown:';

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

/** Whether a learned code is "Not a LOINC test" */
export function isNotALoincTest(code: string): boolean {
  return code.startsWith(NOT_A_LOINC_TEST_PREFIX);
}

/** A learned key as the user reads it: "glucosio (mg/dL)", or the wording alone with no unit */
export function learnedWording(key: string): string {
  const separator = key.lastIndexOf('|');
  if (separator === -1) return key;
  const unit = key.slice(separator + 1);
  const wording = key.slice(0, separator);
  return unit ? `${wording} (${unit})` : wording;
}
