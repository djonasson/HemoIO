/**
 * Record migrations from numeric biomarker IDs to biomarker keys.
 *
 * Shared by the IndexedDB upgrade and by backup import, so a database and a
 * backup written by the same old version migrate identically. All functions
 * are pure and idempotent.
 */

import { matchBiomarkerName, unknownBiomarkerKey } from '@data/biomarkers/dictionary';
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
    // A string is a map encrypted at rest, which only the encrypted layer reads
    if (map && typeof map === 'object') {
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
interface ReconcilableValue {
  biomarkerKey: string;
  rawText?: string;
  unit?: string;
}

/** Units compared ignoring case and how micro is spelled */
function sameUnit(a: string, b: string): boolean {
  const key = (unit: string) => unit.trim().replace(/\u03bc/g, '\u00b5').toLowerCase();
  return key(a) === key(b);
}

/**
 * The key a legacy unknown value gets today: the one a new import of its
 * extracted name would get, a dictionary entry when the name matches one
 * that lists the value's unit, else the unknown key of the name
 */
function reconciledKey(value: ReconcilableValue): string | undefined {
  if (!value.biomarkerKey.startsWith(LEGACY_UNKNOWN_PREFIX) || !value.rawText) return undefined;
  const match = matchBiomarkerName(value.rawText);
  const unitFits =
    match !== undefined &&
    [match.canonicalUnit, ...match.alternativeUnits].some((unit) =>
      sameUnit(unit, value.unit ?? '')
    );
  return match && unitFits ? match.key : unknownBiomarkerKey(value.rawText);
}

/**
 * A test value with its legacy unknown key reconciled. Values are keyed by
 * their own name: legacy hashes collide, so two names can share a legacy key.
 */
export function reconcileTestValueKey<T extends ReconcilableValue>(value: T): T {
  const key = reconciledKey(value);
  return key ? { ...value, biomarkerKey: key } : value;
}

/**
 * Legacy key → reconciled key, for the records keyed by biomarker alone
 * (notes, preference maps): each takes the key of the first value under it
 */
export function legacyUnknownKeyMapping(
  testValues: ReadonlyArray<ReconcilableValue>
): Map<string, string> {
  const mapping = new Map<string, string>();
  for (const value of testValues) {
    if (mapping.has(value.biomarkerKey)) continue;
    const key = reconciledKey(value);
    if (key) mapping.set(value.biomarkerKey, key);
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
