/**
 * Record migrations from numeric biomarker IDs to biomarker keys.
 *
 * Shared by the IndexedDB upgrade and by backup import, so a database and a
 * backup written by the same old version migrate identically. All functions
 * are pure and idempotent.
 */

import {
  getBiomarkerByKey,
  matchBiomarkerName,
  unknownBiomarkerKey,
} from '@data/biomarkers/dictionary';
import { unitsMatch } from '../../services/units/definitions';
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
interface ReconcilableValue {
  biomarkerKey: string;
  rawText?: string;
  unit?: string;
}

/**
 * The key a legacy unknown value gets today: the one a new import of its
 * extracted name would get, a dictionary entry when the name matches one
 * that lists the value's unit, else the unknown key of the name
 */
function reconciledKey(value: ReconcilableValue): string | undefined {
  // A value with no key yet (stored by a version before keys) is not legacy-unknown
  if (
    typeof value.biomarkerKey !== 'string' ||
    !value.biomarkerKey.startsWith(LEGACY_UNKNOWN_PREFIX) ||
    !value.rawText
  ) {
    return undefined;
  }
  const match = matchBiomarkerName(value.rawText);
  const unitFits =
    match !== undefined &&
    [match.canonicalUnit, ...match.alternativeUnits].some((unit) =>
      unitsMatch(unit, value.unit ?? '')
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

/**
 * Values filed under the wrong biomarker before the dictionary told them
 * apart: urea under Blood Urea Nitrogen, whose alias it was (urea is the
 * whole molecule, a different measurement), and urine red cell counts under
 * Urine Blood, which then held the dipstick haemoglobin too. Each moves to
 * the entry it is: urea by the name it was reported under, a red cell
 * count by its unit.
 */
const UREA_KEY = 'urea';
const BUN_KEY = 'blood-urea-nitrogen';
const URINE_BLOOD_KEY = 'urine-blood';
const URINE_RED_CELLS_KEY = 'urine-red-blood-cells';

/** Whether a biomarker's dictionary entry lists this unit */
function listsUnit(key: string, unit: string): boolean {
  const definition = getBiomarkerByKey(key);
  return (
    definition !== undefined &&
    [definition.canonicalUnit, ...definition.alternativeUnits].some((u) => unitsMatch(u, unit))
  );
}

/** A red cell count's unit, which the dipstick haemoglobin is never in */
function isRedCellCountUnit(unit: string): boolean {
  return listsUnit(URINE_RED_CELLS_KEY, unit) && !listsUnit(URINE_BLOOD_KEY, unit);
}

export function refileMisfiledValue<T extends ReconcilableValue>(value: T): T {
  if (
    value.biomarkerKey === BUN_KEY &&
    value.rawText !== undefined &&
    matchBiomarkerName(value.rawText)?.key === UREA_KEY
  ) {
    return { ...value, biomarkerKey: UREA_KEY };
  }
  if (value.biomarkerKey === URINE_BLOOD_KEY && isRedCellCountUnit(value.unit ?? '')) {
    return { ...value, biomarkerKey: URINE_RED_CELLS_KEY };
  }
  return value;
}

/**
 * Preferences filed under the wrong biomarker: a preferred red cell count
 * unit moves from Urine Blood to Urine Red Blood Cells (unless one is set
 * there). Other preferences stay: a target or acknowledgement cannot tell
 * which of the two tests it was set for.
 */
export function refileMisfiledPreferences<T extends { unitPreferences?: Record<string, string> }>(
  prefs: T
): T {
  const units = prefs.unitPreferences;
  const unit = units?.[URINE_BLOOD_KEY];
  if (!units || unit === undefined || !isRedCellCountUnit(unit) || URINE_RED_CELLS_KEY in units) {
    return prefs;
  }
  const refiled: Record<string, string> = { ...units, [URINE_RED_CELLS_KEY]: unit };
  delete refiled[URINE_BLOOD_KEY];
  return { ...prefs, unitPreferences: refiled };
}

