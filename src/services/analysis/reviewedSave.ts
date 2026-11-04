/**
 * What an import saves from the reviewed files: the rules the review step
 * checks against and the wizard saves by
 */

import { unitFitsBiomarker } from '@services/units/unitFit';
import { isPerHundredCounted } from '@/utils/unitSpelling';
import {
  BIOMARKER_DEFINITIONS,
  findBiomarker,
  nameKey,
  type BiomarkerDefinition,
} from '@data/biomarkers/dictionary';
import { proposedTest } from './nameMatching';
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

/**
 * The test a value is checked against: the one it is saved as, or the one
 * proposed for it (by the AI or the typed name), which it is saved as once
 * its unit fits. None for "Not in dictionary".
 */
export function targetTest(biomarker: MatchedBiomarker): BiomarkerDefinition | undefined {
  if (biomarker.savedAsUnknown) return undefined;
  return biomarker.dictionaryMatch ?? proposedTest(biomarker);
}

/**
 * What a value lacks to be saved: a name, a number, or a unit when its test
 * has one. An analyzed value with no test may have none (specific gravity,
 * ratios), as the report gave it; a row added by hand is read by its name.
 */
export function missingFields(biomarker: MatchedBiomarker): MissingField[] {
  const missing: MissingField[] = [];
  if (!biomarker.name) missing.push('name');
  if (!Number.isFinite(biomarker.value)) missing.push('value');
  if (!biomarker.unit.trim()) {
    const test =
      targetTest(biomarker) ??
      (biomarker.identificationFlags ? undefined : findBiomarker(biomarker.name || ''));
    const unitRequired = test ? test.canonicalUnit !== '' : !biomarker.identificationFlags;
    if (unitRequired) missing.push('unit');
  }
  return missing;
}

/**
 * The test a value would be saved as when its unit is not a unit of that
 * test
 */
export function misfitTest(biomarker: MatchedBiomarker): BiomarkerDefinition | undefined {
  if (!biomarker.unit.trim()) return undefined;
  const test = targetTest(biomarker);
  return test && !unitFitsBiomarker(test, biomarker.unit) ? test : undefined;
}

/** Whether a value is saved as it stands: nothing missing, its unit fits */
function isReady(biomarker: MatchedBiomarker): boolean {
  return missingFields(biomarker).length === 0 && !misfitTest(biomarker);
}

/**
 * A share of 100 of something no test is counted per ("/100 HPF"): the same
 * test given a second time in a form the app cannot read. Any other unit no
 * test fits may be another measurement (a 24-hour amount in "mEq/24h" next
 * to a concentration), so it still asks for a fix.
 */
function isUnreadableShare(unit: string): boolean {
  return (
    isPerHundredCounted(unit) &&
    !BIOMARKER_DEFINITIONS.some((test) => unitFitsBiomarker(test, unit))
  );
}

/**
 * Whether a value is a twin the import may leave out on its own: a test
 * the analysis proposed, unchanged by the user, given as a share no test is
 * counted per. A test or row the user chose is theirs, so it still asks
 * for a fix.
 */
function mayLeaveOut(biomarker: MatchedBiomarker): boolean {
  const { analyzed } = biomarker;
  return (
    !!analyzed &&
    biomarker.identifiedBy !== 'user' &&
    !biomarker.dictionaryMatch &&
    !!misfitTest(biomarker) &&
    nameKey(biomarker.name) === nameKey(analyzed.name) &&
    biomarker.unit === analyzed.unit &&
    isUnreadableShare(biomarker.unit)
  );
}

/**
 * The values of a file the import leaves out: twins (see mayLeaveOut) of a
 * value of the same printed name saved as the same test. A report that gives
 * one test in two units keeps the one in a unit of that test, and the user
 * need not remove the other by hand.
 */
function setAside(values: readonly MatchedBiomarker[]): Set<MatchedBiomarker> {
  const candidates = values.filter(mayLeaveOut);
  if (candidates.length === 0) return new Set();
  const saved = new Set(
    values
      .filter(isReady)
      .map((value) => `${nameKey(value.name)}\u0000${targetTest(value)?.key ?? ''}`)
  );
  return new Set(
    candidates.filter((value) =>
      saved.has(`${nameKey(value.name)}\u0000${targetTest(value)!.key}`)
    )
  );
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
