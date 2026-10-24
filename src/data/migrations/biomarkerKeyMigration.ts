/**
 * Record migrations from numeric biomarker IDs to biomarker keys.
 *
 * Shared by the IndexedDB upgrade and by backup import, so a database and a
 * backup written by the same old version migrate identically. All functions
 * are pure and idempotent.
 */

import { unknownBiomarkerKey } from '@data/biomarkers/dictionary';
import { LEGACY_UNKNOWN_PREFIX, legacyIdToKey } from './legacyBiomarkerIds';

export interface LegacyKeyed {
  biomarkerId?: number;
  biomarkerKey?: string;
}

export function migrateTestValueRecord<T extends object>(
  record: T
): Omit<T, 'biomarkerId'> & { biomarkerKey: string } {
  const { biomarkerId, biomarkerKey, ...rest } = record as T & LegacyKeyed;
  return {
    ...(rest as Omit<T, 'biomarkerId'>),
    // A record with neither field maps to "unknown:legacy-NaN": visible, not dropped
    biomarkerKey: biomarkerKey ?? legacyIdToKey(biomarkerId ?? Number.NaN),
  };
}

export function migrateNoteRecord<T extends object>(
  record: T
): Omit<T, 'biomarkerId'> & { biomarkerKey?: string } {
  const { biomarkerId, ...rest } = record as T & LegacyKeyed;
  if (rest.biomarkerKey !== undefined || biomarkerId === undefined) {
    return rest as Omit<T, 'biomarkerId'>;
  }
  return { ...(rest as Omit<T, 'biomarkerId'>), biomarkerKey: legacyIdToKey(biomarkerId) };
}

/** Preference maps keyed by biomarker: every key migration applies to all of them */
const BIOMARKER_KEYED_PREFERENCES = ['personalTargets', 'unitPreferences', 'acknowledgedAlerts'] as const;

type BiomarkerKeyedPreferences = Partial<
  Record<(typeof BIOMARKER_KEYED_PREFERENCES)[number], Record<string | number, unknown>>
>;

function mapPreferenceKeys<T extends BiomarkerKeyedPreferences>(
  prefs: T,
  newKey: (key: string) => string
): T {
  const result = { ...prefs };
  for (const field of BIOMARKER_KEYED_PREFERENCES) {
    const map = prefs[field];
    if (map) {
      result[field] = Object.fromEntries(
        Object.entries(map).map(([key, value]) => [newKey(key), value])
      ) as T[typeof field];
    }
  }
  return result;
}

/** Numeric map keys come back from JSON/IndexedDB as digit strings */
const LEGACY_MAP_KEY = /^-?\d+$/;

export function migratePreferenceMaps<T extends BiomarkerKeyedPreferences>(prefs: T): T {
  return mapPreferenceKeys(prefs, (key) =>
    LEGACY_MAP_KEY.test(key) ? legacyIdToKey(Number(key)) : key
  );
}

/**
 * Reconciling legacy unknown keys.
 *
 * Unknown biomarkers stored before keys existed have "unknown:legacy-<hash>"
 * keys, but new imports of the same name get "unknown:<name>", which would
 * split one biomarker's history in two. The old hash came from the extracted
 * name (stored as rawText), so each legacy key maps to the key that name gets
 * today. rawText is encrypted in the database, so this runs where plaintext is
 * available: during backup import, and after unlock for stored data.
 */
export function legacyUnknownKeyMapping(
  testValues: ReadonlyArray<{ biomarkerKey: string; rawText?: string }>
): Map<string, string> {
  const mapping = new Map<string, string>();
  for (const { biomarkerKey, rawText } of testValues) {
    if (biomarkerKey.startsWith(LEGACY_UNKNOWN_PREFIX) && rawText && !mapping.has(biomarkerKey)) {
      mapping.set(biomarkerKey, unknownBiomarkerKey(rawText));
    }
  }
  return mapping;
}

export function remapBiomarkerKey<T extends object>(
  record: T,
  mapping: ReadonlyMap<string, string>
): T {
  const { biomarkerKey } = record as T & LegacyKeyed;
  const remapped = biomarkerKey !== undefined ? mapping.get(biomarkerKey) : undefined;
  return remapped ? { ...record, biomarkerKey: remapped } : record;
}

export function remapPreferenceMaps<T extends BiomarkerKeyedPreferences>(
  prefs: T,
  mapping: ReadonlyMap<string, string>
): T {
  return mapPreferenceKeys(prefs, (key) => mapping.get(key) ?? key);
}
