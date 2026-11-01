/**
 * What an import saves from the reviewed files
 */

import { unitFitsBiomarker } from '@services/units/unitFit';
import { proposedTest } from '@services/analysis/nameMatching';
import type { BiomarkerDefinition } from '@data/biomarkers/dictionary';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

interface ReviewedFile {
  fileName: string;
  editedBiomarkers: MatchedBiomarker[];
}

/** A value an import leaves out, and the file it came from */
export interface SetAsideValue {
  fileName: string;
  biomarker: MatchedBiomarker;
}

/**
 * The test a value would be saved as when its unit is not a unit of that
 * test: the test it is saved as, or the one proposed for it
 */
export function misfitTest(biomarker: MatchedBiomarker): BiomarkerDefinition | undefined {
  if (biomarker.savedAsUnknown || !biomarker.unit.trim()) return undefined;
  const test = biomarker.dictionaryMatch ?? proposedTest(biomarker);
  return test && !unitFitsBiomarker(test, biomarker.unit) ? test : undefined;
}

function lineName(biomarker: MatchedBiomarker): string {
  return biomarker.name.trim().toLowerCase();
}

function isSaveable(biomarker: MatchedBiomarker): boolean {
  return (
    !!biomarker.name &&
    biomarker.value !== undefined &&
    biomarker.value !== null &&
    !misfitTest(biomarker)
  );
}

/**
 * Whether a value is left out of the save: its unit fits no test it could
 * be saved as, and another value of its line (a report that gives one test
 * in two units) is saved. That value is kept, so nothing is lost, and the
 * user need not remove the other by hand.
 */
export function isSetAside(
  biomarker: MatchedBiomarker,
  fileValues: readonly MatchedBiomarker[]
): boolean {
  return (
    !!misfitTest(biomarker) &&
    fileValues.some(
      (other) => other !== biomarker && lineName(other) === lineName(biomarker) && isSaveable(other)
    )
  );
}

/** The values the import leaves out, with their files */
export function setAsideValues(results: readonly ReviewedFile[]): SetAsideValue[] {
  return results.flatMap((result) =>
    result.editedBiomarkers
      .filter((biomarker) => isSetAside(biomarker, result.editedBiomarkers))
      .map((biomarker) => ({ fileName: result.fileName, biomarker }))
  );
}

/**
 * The reviewed files an import saves, without the values it leaves out. A
 * file left without values (a failed file the user did not fill in) is not
 * saved, but stays in the review so going back keeps it and its edits.
 */
export function resultsToSave<T extends ReviewedFile>(results: readonly T[]): T[] {
  return results
    .map((result) => {
      const kept = result.editedBiomarkers.filter(
        (biomarker) => !isSetAside(biomarker, result.editedBiomarkers)
      );
      return kept.length === result.editedBiomarkers.length
        ? result
        : { ...result, editedBiomarkers: kept };
    })
    .filter((result) => result.editedBiomarkers.length > 0);
}
