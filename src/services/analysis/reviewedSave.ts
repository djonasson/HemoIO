/**
 * What an import saves from the reviewed files: the rules the review step
 * checks against and the wizard saves by
 */

import { isPerHundredCounted } from '@/utils/unitSpelling';
import { nameKey } from '@data/biomarkers/dictionary';
import { toUcum } from '@services/units/ucum';
import type { MatchedBiomarker } from './LabReportAnalyzer';

/** A reviewed file: its name and its values as edited */
export interface ReviewedFile {
  fileName: string;
  editedBiomarkers: MatchedBiomarker[];
}

/** A value an import leaves out, and the file it came from */
export interface SetAsideValue {
  fileName: string;
  biomarker: MatchedBiomarker;
}

/** The files an import saves and the values it leaves out */
export interface SavePlan<T extends ReviewedFile> {
  toSave: T[];
  notSaved: SetAsideValue[];
}

/** What a value lacks to be saved */
export type MissingField = 'name' | 'value' | 'unit';

/** The LOINC code a value is saved under; none while undecided or "Not a LOINC test" */
export function targetTest(biomarker: MatchedBiomarker): string | null {
  return biomarker.loincCode ?? null;
}

/**
 * What a value lacks to be saved: a name, a number, or a unit. A value the
 * report gave no unit may have none (a screening result, a ratio); one the
 * user emptied, or a row typed in review, needs one.
 */
export function missingFields(biomarker: MatchedBiomarker): MissingField[] {
  const missing: MissingField[] = [];
  if (!biomarker.name) missing.push('name');
  if (!Number.isFinite(biomarker.value)) missing.push('value');
  const reportGaveUnit = !biomarker.analyzed || biomarker.analyzed.unit.trim() !== '';
  if (!biomarker.unit.trim() && reportGaveUnit) missing.push('unit');
  return missing;
}

/** Whether a value has its test or "Not a LOINC test", and nothing missing */
function isReady(biomarker: MatchedBiomarker): boolean {
  return missingFields(biomarker).length === 0 && (!!biomarker.loincCode || !!biomarker.savedAsUnknown);
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
function setAside(values: readonly MatchedBiomarker[]): Set<MatchedBiomarker> {
  const candidates = values.filter(mayLeaveOut);
  if (candidates.length === 0) return new Set();
  const coded = new Set(
    values.filter((value) => value.loincCode && isReady(value)).map((value) => nameKey(value.name))
  );
  return new Set(candidates.filter((value) => coded.has(nameKey(value.name))));
}

/**
 * The files an import saves, without the values it leaves out, and those
 * values. A file left without values (a failed file the user did not fill
 * in) is not saved, but stays in the review so going back keeps its edits.
 */
export function planSave<T extends ReviewedFile>(results: readonly T[]): SavePlan<T> {
  const toSave: T[] = [];
  const notSaved: SetAsideValue[] = [];
  for (const result of results) {
    const left = setAside(result.editedBiomarkers);
    for (const biomarker of left) notSaved.push({ fileName: result.fileName, biomarker });
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
