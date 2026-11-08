/**
 * Choosing and editing a value's LOINC test in review
 */
import { unitOptions } from '@data/loinc/display';
import { unitsMatch } from '@/utils/unitSpelling';
import { heldQualitative } from '../ai';
import { identifyLocally, type Identification, type LearnedTests } from './identification';
import { learnedKey } from './loincMatch';
import type { Catalog, CatalogTest } from '@data/loinc/catalog';
import type { MatchedBiomarker } from './LabReportAnalyzer';

/** Most tests a search lists */
const MAX_SEARCH_RESULTS = 30;

/** Tests in the catalog for a search, the closest first; a code typed comes first. None for no text. */
export function searchTests(catalog: Catalog, search: string): CatalogTest[] {
  const query = search.trim();
  if (!query) return [];
  const byCode = catalog.test(query);
  const found = catalog.search(query).slice(0, MAX_SEARCH_RESULTS);
  return byCode ? [byCode, ...found.filter((test) => test.code !== byCode.code)] : found;
}

/** Units offered for a value of a test: HemoIO's own for it, else LOINC's examples */
export function unitOptionsFor(catalog: Catalog, code: string | undefined): string[] {
  return code ? unitOptions(catalog, code) : [];
}

/** The value with every identification field set from `identification`, none left from before */
function identified(biomarker: MatchedBiomarker, identification: Identification): MatchedBiomarker {
  return {
    ...biomarker,
    loincCode: identification.loincCode,
    candidates: identification.candidates,
    aiPick: identification.aiPick,
    identifiedBy: identification.identifiedBy,
    identificationFlags: identification.identificationFlags,
    savedAsUnknown: identification.savedAsUnknown,
    unknownKey: identification.unknownKey,
  };
}

/** Nothing known yet: a row added in review before it has a unit */
const UNREAD: Identification = { candidates: [], identificationFlags: [] };

/**
 * A value edited in review, its test read again: a test the user chose
 * stays; back at the printed name and unit, the analyzer's test (the AI's
 * choice too) is the value's again; else it is read as the analyzer reads
 * a printed name, with the learned tests. An emptied unit is one still to
 * choose: the value is read in the report's unit, and review asks for one.
 */
function reidentify(
  original: MatchedBiomarker,
  changed: MatchedBiomarker,
  catalog: Catalog,
  learned: LearnedTests | undefined
): MatchedBiomarker {
  if (original.identifiedBy === 'user') return changed;
  const { analyzed } = original;
  const unit = changed.unit.trim() === '' && analyzed?.unit.trim() ? analyzed.unit : changed.unit;
  if (!analyzed && unit.trim() === '') return identified(changed, UNREAD);
  const reading = { name: changed.name, unit, specimenHint: changed.specimenHint, qualitative: heldQualitative(changed) };
  const identification =
    analyzed && learnedKey(reading) === learnedKey(analyzed)
      ? analyzed.identification
      : identifyLocally(catalog, reading, learned);
  return identified(changed, identification);
}

/** Rename a value; its test is read again from the new name (see reidentify) */
export function applyBiomarkerName(
  biomarker: MatchedBiomarker,
  name: string,
  catalog: Catalog,
  learned?: LearnedTests
): MatchedBiomarker {
  return reidentify(biomarker, { ...biomarker, name }, catalog, learned);
}

/** Change a value's unit; its test is read again in the new unit (see reidentify) */
export function applyBiomarkerUnit(
  biomarker: MatchedBiomarker,
  unit: string,
  catalog: Catalog,
  learned?: LearnedTests
): MatchedBiomarker {
  return reidentify(biomarker, { ...biomarker, unit, referenceRange: followingRange(biomarker) }, catalog, learned);
}

/**
 * A value's range once its unit is corrected: one in the value's unit (no
 * unit of its own, or the old value unit) follows the new unit, its numbers
 * kept as printed; one printed in a unit of its own keeps it
 */
function followingRange(biomarker: MatchedBiomarker): MatchedBiomarker['referenceRange'] {
  const range = biomarker.referenceRange;
  if (!range?.unit || !unitsMatch(range.unit, biomarker.unit)) return range;
  return { low: range.low, high: range.high };
}

/**
 * Save a value as the LOINC test the user chose in review, or as "Not a
 * LOINC test" (null): the choice is final, so edits no longer move it. The
 * candidates stay, to change the choice again.
 */
export function chooseTest(biomarker: MatchedBiomarker, code: string | null): MatchedBiomarker {
  return {
    ...biomarker,
    loincCode: code ?? undefined,
    identifiedBy: 'user',
    identificationFlags: [],
    savedAsUnknown: code === null,
    // The user's own choice: saved under the name they gave it
    unknownKey: undefined,
  };
}

/** Where a value sits in review: its file and its row */
export interface ValuePosition {
  resultIndex: number;
  biomarkerIndex: number;
}

/**
 * Whether two values are the same printed wording: name and unit, as they
 * are learned, and of the same sample, which learning does not tell apart
 * but a choice for "Glucosio" in urine must not reach the one in blood
 */
function isSameWording(a: MatchedBiomarker, b: MatchedBiomarker): boolean {
  const sample = (value: MatchedBiomarker): string => (value.specimenHint ?? '').trim().toLowerCase();
  // Rows added in review start with no name: blank rows are no wording
  return a.name.trim() !== '' && learnedKey(a) === learnedKey(b) && sample(a) === sample(b);
}

/**
 * The user's test choice for one value, shared with the values of the same
 * wording in every file of the import whose test the user has not chosen
 * themselves: a report's "Ematocrito %" is the same test in each file, as it
 * is once learned. A shared value is marked so, not as the user's own, so a
 * correction of the choice reaches it too and a rename reads it again.
 */
export function chooseTestForWording<T extends { editedBiomarkers: MatchedBiomarker[] }>(
  results: readonly T[],
  { resultIndex, biomarkerIndex }: ValuePosition,
  code: string | null
): T[] {
  const chosen = results[resultIndex]?.editedBiomarkers[biomarkerIndex];
  if (!chosen) return [...results];
  const choiceFor = (value: MatchedBiomarker, r: number, i: number): MatchedBiomarker | undefined => {
    if (r === resultIndex && i === biomarkerIndex) return chooseTest(value, code);
    if (value.identifiedBy === 'user' || !isSameWording(value, chosen)) return undefined;
    return { ...chooseTest(value, code), identifiedBy: 'shared' };
  };
  return results.map((result, r) => {
    const values = result.editedBiomarkers.map((value, i) => choiceFor(value, r, i) ?? value);
    return values.some((value, i) => value !== result.editedBiomarkers[i]) ? { ...result, editedBiomarkers: values } : result;
  });
}
