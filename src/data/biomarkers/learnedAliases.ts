/**
 * The user's own aliases: printed names they saved under a dictionary test.
 * Consulted only after the dictionary's aliases, so they never override
 * them. Stored in the (sealed) preferences record.
 */
import { findBiomarker, getBiomarkerByKey, nameKey, type BiomarkerDefinition } from './dictionary';

/** A name as every lookup of the user's names reads it: case, spacing and accent encoding aside */
export const learnedAliasName = nameKey;

/** The test the user saved a printed name under; none before preferences load */
export function lookupLearnedAlias(
  aliases: Readonly<Record<string, string>> | undefined,
  name: string
): BiomarkerDefinition | undefined {
  const key = aliases?.[learnedAliasName(name)];
  return key ? getBiomarkerByKey(key) : undefined;
}

/** A saved value's printed name and the test it was saved under */
export interface SavedName {
  name: string;
  key?: string;
  /** The user picked the test in review */
  pickedByUser?: boolean;
  /** The user saved it as not in the dictionary */
  savedAsUnknown?: boolean;
}

/**
 * The aliases after saving these values: a name the user saved under a
 * test they picked is learned, one saved as not in the dictionary is
 * forgotten. A test the AI or the model chose is not learned: the user may
 * not have checked it, and a name alone (a urine report's "Proteine") can
 * be another test elsewhere (serum "Proteine").
 */
export function learnFromSaved(
  aliases: Readonly<Record<string, string>>,
  values: ReadonlyArray<SavedName>
): Record<string, string> {
  const next = { ...aliases };
  for (const { name, key, savedAsUnknown, pickedByUser } of values) {
    const learned = learnedAliasName(name);
    if (!learned) continue;
    if (savedAsUnknown) {
      delete next[learned];
      continue;
    }
    if (!pickedByUser || !key || !getBiomarkerByKey(key) || findBiomarker(name)?.key === key) {
      continue;
    }
    next[learned] = key;
  }
  return next;
}
