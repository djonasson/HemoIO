/**
 * What an import saves from the reviewed files: the rules the review step
 * checks against and the wizard saves by
 */

import { unitFitsBiomarker } from '@services/units/unitFit';
import { nameKey, type BiomarkerDefinition } from '@data/biomarkers/dictionary';
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

/**
 * The test a value is saved under: the one chosen for it, or the one
 * proposed (by the AI or the typed name). None for "Not in dictionary".
 */
export function targetTest(biomarker: MatchedBiomarker): BiomarkerDefinition | undefined {
  if (biomarker.savedAsUnknown) return undefined;
  return biomarker.dictionaryMatch ?? proposedTest(biomarker);
}

/** Whether a value has a name and a number, as every saved value must */
export function hasNameAndValue(biomarker: MatchedBiomarker): boolean {
  return !!biomarker.name && biomarker.value !== undefined && biomarker.value !== null;
}

/**
 * The test a value would be saved under when its unit is not a unit of
 * that test
 */
export function misfitTest(biomarker: MatchedBiomarker): BiomarkerDefinition | undefined {
  if (!biomarker.unit.trim()) return undefined;
  const test = targetTest(biomarker);
  return test && !unitFitsBiomarker(test, biomarker.unit) ? test : undefined;
}

/**
 * The values of a file the import leaves out: those whose unit fits no
 * test they could be saved under, when another value of their line (a
 * report that gives one test in two units) is saved. That value is kept,
 * so nothing is lost, and the user need not remove the other by hand.
 */
function setAside(values: readonly MatchedBiomarker[]): Set<MatchedBiomarker> {
  const misfits = values.filter((value) => misfitTest(value));
  if (misfits.length === 0) return new Set();
  const savedLines = new Set(
    values
      .filter((value) => hasNameAndValue(value) && !misfitTest(value))
      .map((value) => nameKey(value.name))
  );
  return new Set(misfits.filter((value) => savedLines.has(nameKey(value.name))));
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
