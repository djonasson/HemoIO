/**
 * The user's own aliases: printed names they saved under a dictionary test.
 * Consulted only after the dictionary's aliases, so they never override
 * them. Stored in the (sealed) preferences record.
 */
import { findBiomarker, getBiomarkerByKey, type BiomarkerDefinition } from './dictionary';

export function learnedAliasName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function lookupLearnedAlias(
  aliases: Readonly<Record<string, string>>,
  name: string
): BiomarkerDefinition | undefined {
  const key = aliases[learnedAliasName(name)];
  return key ? getBiomarkerByKey(key) : undefined;
}

export function learnFromSaved(
  aliases: Readonly<Record<string, string>>,
  values: ReadonlyArray<{ name: string; key?: string; savedAsUnknown?: boolean }>
): Record<string, string> {
  const next = { ...aliases };
  for (const { name, key, savedAsUnknown } of values) {
    const learned = learnedAliasName(name);
    if (!learned) continue;
    if (savedAsUnknown) {
      delete next[learned];
      continue;
    }
    if (!key || !getBiomarkerByKey(key) || findBiomarker(name)?.key === key) continue;
    next[learned] = key;
  }
  return next;
}
