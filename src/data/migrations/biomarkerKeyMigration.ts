/**
 * Record migrations from numeric biomarker IDs to biomarker keys.
 *
 * Shared by the IndexedDB upgrade and by backup import, so a database and a
 * backup written by the same old version migrate identically. All functions
 * are pure and idempotent.
 */

import { legacyIdToKey } from './legacyBiomarkerIds';

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

/** Numeric map keys come back from JSON/IndexedDB as digit strings */
const LEGACY_MAP_KEY = /^-?\d+$/;

function rekey<V>(map: Record<string | number, V>): Record<string, V> {
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [
      LEGACY_MAP_KEY.test(key) ? legacyIdToKey(Number(key)) : key,
      value,
    ])
  );
}

export function migratePreferenceMaps<
  T extends {
    personalTargets?: Record<string | number, unknown>;
    unitPreferences?: Record<string | number, unknown>;
  },
>(prefs: T): T {
  return {
    ...prefs,
    ...(prefs.personalTargets && { personalTargets: rekey(prefs.personalTargets) }),
    ...(prefs.unitPreferences && { unitPreferences: rekey(prefs.unitPreferences) }),
  };
}
