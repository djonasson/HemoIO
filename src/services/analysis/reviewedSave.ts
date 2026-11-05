/**
 * What an import saves from the reviewed files: the rules the review step
 * checks against and the wizard saves by
 */

import { isPerHundredCounted } from '@/utils/unitSpelling';
import { getAddon } from '@data/loinc/addons';
import { nameKey } from '@data/loinc/keys';
import { toUcum, ucumProperties } from '@services/units/ucum';
import {
  clusterMeasurements,
  comparable,
  groupBySameTest,
  groupUnit,
  isSettled,
  preferredValue,
} from './sameMeasurement';
import { quantityKind, type Catalog } from '@data/loinc/catalog';
import type { MatchedBiomarker } from './LabReportAnalyzer';

/** A reviewed file: its name and its values as edited */
export interface ReviewedFile {
  fileName: string;
  editedBiomarkers: MatchedBiomarker[];
}

/**
 * Why a value is left out: a twin in a unit that cannot be read next to a
 * value of its name with a code, or a duplicate, the same measurement as
 * another value of its test that is saved
 */
export type SetAsideReason = 'twin' | 'duplicate';

/** A value an import leaves out, and the file it came from */
export interface SetAsideValue {
  fileName: string;
  biomarker: MatchedBiomarker;
  reason: SetAsideReason;
  /** For a duplicate: the value saved in its place */
  savedAs?: MatchedBiomarker;
}

/** The files an import saves and the values it leaves out */
export interface SavePlan<T extends ReviewedFile> {
  toSave: T[];
  notSaved: SetAsideValue[];
}

/** What a value lacks to be saved */
export type MissingField = 'name' | 'value' | 'unit';

/** Standard units of tests whose results have no unit: pH, specific gravity */
const NO_UNIT = new Set(['', '1', '[pH]']);

/** Whether a LOINC test's results come with no unit: an ordinal, a pH, a specific gravity */
function hasNoUnit(catalog: Catalog, code: string): boolean {
  const test = catalog.test(code);
  if (!test) return false;
  const canonical = getAddon(catalog, code)?.canonicalUnit;
  return test.scale !== 'Qn' || test.property === 'SpGrav' || (canonical !== undefined && NO_UNIT.has(canonical));
}

/**
 * What a value lacks to be saved: a name, a number, or a unit. A value the
 * report gave no unit may have none (a screening result, a ratio), and so
 * may one of a test whose results have none; one the user emptied, or a
 * row typed in review, otherwise needs one.
 */
export function missingFields(biomarker: MatchedBiomarker, catalog?: Catalog): MissingField[] {
  const missing: MissingField[] = [];
  if (!biomarker.name) missing.push('name');
  if (!Number.isFinite(biomarker.value)) missing.push('value');
  const reportGaveUnit = !biomarker.analyzed || biomarker.analyzed.unit.trim() !== '';
  const testHasUnit = !(catalog && biomarker.loincCode && hasNoUnit(catalog, biomarker.loincCode));
  if (!biomarker.unit.trim() && reportGaveUnit && testHasUnit) missing.push('unit');
  return missing;
}

/**
 * Whether a value's unit is surely not one of its test's kind: a U/L value
 * saved as a mass concentration, a daily amount as a concentration. A unit
 * UCUM cannot read, or that tells nothing certain, is not judged.
 */
export function unitMisfits(biomarker: MatchedBiomarker, catalog: Catalog): boolean {
  const test = biomarker.loincCode ? catalog.test(biomarker.loincCode) : undefined;
  const ucum = biomarker.unit.trim() ? toUcum(biomarker.unit) : null;
  if (!test || !ucum) return false;
  const kinds = ucumProperties(ucum).map(quantityKind);
  return kinds.length > 0 && !kinds.includes(quantityKind(test.property));
}

/** Whether a value has its test or "Not a LOINC test", and nothing missing */
function isReady(biomarker: MatchedBiomarker, catalog: Catalog): boolean {
  return (
    missingFields(biomarker, catalog).length === 0 && (!!biomarker.loincCode || !!biomarker.savedAsUnknown)
  );
}

/**
 * Whether a value is a twin the import may leave out on its own: one with
 * no test, unchanged by the user, given as a share of 100 of something UCUM
 * cannot read ("/100 HPF"). Any other unit may be another measurement (a
 * 24-hour amount next to a concentration), and a value the user chose a
 * test for, or typed, is theirs: they still ask for a test.
 */
function mayLeaveOut(biomarker: MatchedBiomarker): boolean {
  const { analyzed } = biomarker;
  return (
    !!analyzed &&
    biomarker.identifiedBy !== 'user' &&
    !biomarker.loincCode &&
    !biomarker.savedAsUnknown &&
    nameKey(biomarker.name) === nameKey(analyzed.name) &&
    biomarker.unit === analyzed.unit &&
    isPerHundredCounted(biomarker.unit) &&
    toUcum(biomarker.unit) === null
  );
}

/**
 * The values of a file the import leaves out: twins (see mayLeaveOut) of a
 * value of the same printed name saved with a code. A report that gives one
 * test in two forms keeps the one it can read, and the user need not remove
 * the other by hand.
 */
function twins(values: readonly MatchedBiomarker[], catalog: Catalog): MatchedBiomarker[] {
  const candidates = values.filter(mayLeaveOut);
  if (candidates.length === 0) return [];
  const coded = new Set(
    values.filter((value) => value.loincCode && isReady(value, catalog)).map((value) => nameKey(value.name))
  );
  return candidates.filter((value) => coded.has(nameKey(value.name)));
}

/**
 * The values of a file that are the same measurement as another value of
 * their test, each with the one saved in its place (in the standard unit,
 * else the first): a value the analyzer could not merge, as it had no test
 * then, is merged once the user gives it one. Values the analyzer would
 * call a conflict (see isSettled) are all kept, for the user to settle.
 */
function duplicates(
  values: readonly MatchedBiomarker[],
  catalog: Catalog
): Map<MatchedBiomarker, MatchedBiomarker> {
  const left = new Map<MatchedBiomarker, MatchedBiomarker>();
  const coded = values.filter((value) => value.loincCode && isReady(value, catalog));
  for (const group of groupBySameTest(coded, catalog)) {
    if (group.length === 1) continue;
    const unit = groupUnit(group, catalog);
    const values = group.map((b) => comparable(b, unit));
    const clusters = clusterMeasurements(values);
    if (!isSettled(values, clusters)) continue;
    for (const cluster of clusters) {
      const kept = preferredValue(cluster, unit).biomarker;
      for (const { biomarker } of cluster) if (biomarker !== kept) left.set(biomarker, kept);
    }
  }
  return left;
}

/** The values of a file the import leaves out, and why */
function setAside(
  values: readonly MatchedBiomarker[],
  catalog: Catalog
): Map<MatchedBiomarker, Omit<SetAsideValue, 'fileName'>> {
  const left = new Map<MatchedBiomarker, Omit<SetAsideValue, 'fileName'>>();
  for (const biomarker of twins(values, catalog)) left.set(biomarker, { biomarker, reason: 'twin' });
  for (const [biomarker, savedAs] of duplicates(values, catalog)) {
    left.set(biomarker, { biomarker, reason: 'duplicate', savedAs });
  }
  return left;
}

/**
 * The files an import saves, without the values it leaves out, and those
 * values. A file left without values (a failed file the user did not fill
 * in) is not saved, but stays in the review so going back keeps its edits.
 */
export function planSave<T extends ReviewedFile>(results: readonly T[], catalog: Catalog): SavePlan<T> {
  const toSave: T[] = [];
  const notSaved: SetAsideValue[] = [];
  for (const result of results) {
    const left = setAside(result.editedBiomarkers, catalog);
    for (const value of left.values()) notSaved.push({ fileName: result.fileName, ...value });
    const kept =
      left.size === 0
        ? result
        : { ...result, editedBiomarkers: result.editedBiomarkers.filter((b) => !left.has(b)) };
    if (kept.editedBiomarkers.length > 0) toSave.push(kept);
  }
  return { toSave, notSaved };
}

/** Whether a value still needs its test chosen, or "Not a LOINC test", before it can be saved */
export function needsTest(biomarker: MatchedBiomarker): boolean {
  return !biomarker.loincCode && !biomarker.savedAsUnknown;
}
