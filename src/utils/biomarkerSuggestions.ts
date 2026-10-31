/**
 * Dictionary suggestions for typing a biomarker name in review
 */
import {
  BIOMARKER_DEFINITIONS,
  findBiomarker,
  matchBiomarkerName,
  nameKey,
  searchBiomarkers,
  type BiomarkerDefinition,
} from '@data/biomarkers/dictionary';
import type { AnalyzedValue, MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';
import {
  identifyAnalyzed,
  identifyByKey,
  identifyByPrintedName,
  learnedTest,
  notIdentified,
  testOfName,
  type IdentifiableValue,
  type LearnedAlias,
} from '@services/analysis/nameMatching';
import { normalizeUnit } from '@services/units';

/** Dictionary names for the text, the closest first */
export function suggestBiomarkerNames(search: string, limit = 10): string[] {
  return searchBiomarkers(search).slice(0, limit).map((b) => b.name);
}

/** Tests for a search, the closest first; every test for no text */
export function searchTests(search: string): readonly BiomarkerDefinition[] {
  return search.trim() ? searchBiomarkers(search) : BIOMARKER_DEFINITIONS;
}

/** Units the dictionary knows for a biomarker name or alias */
export function unitOptionsFor(name: string): string[] {
  const definition = findBiomarker(name);
  if (!definition) return [];
  return [...new Set([definition.canonicalUnit, ...definition.alternativeUnits].filter(Boolean))];
}

/**
 * Whether a value's test is the user's to keep: they picked it, or saved
 * the value as not in the dictionary. Review then never reads it again.
 */
function isPinned(biomarker: MatchedBiomarker): boolean {
  return biomarker.identifiedBy === 'user' || biomarker.savedAsUnknown === true;
}

/**
 * A row added in review: the test its name is (or the user's learned name
 * for it), read with its unit. A name edit fills an empty unit with that
 * test's standard unit, and it keeps following the name while the user has
 * not chosen one: typing passes through names of other tests ("Urea" on
 * the way to "Urea 24h"). Review checks the unit against the test the name
 * is before saving.
 */
function readAddedRow(
  biomarker: MatchedBiomarker,
  learned: LearnedAlias | undefined,
  { nameEdited }: { nameEdited: boolean }
): MatchedBiomarker {
  const named = matchBiomarkerName(biomarker.name) ?? learned?.(biomarker.name);
  const fillUnit = nameEdited && (!biomarker.unit || biomarker.unitFromName === true);
  const unit = fillUnit ? (named?.canonicalUnit ?? '') : biomarker.unit;
  const withUnit = { ...biomarker, unit };
  const test = testOfName(biomarker.name, unit) ?? learnedTest(withUnit, learned);
  return {
    ...withUnit,
    unitFromName: fillUnit && unit !== '',
    dictionaryMatch: test ?? named,
    isExactMatch: test !== undefined,
  };
}

/**
 * An analyzed value the user renamed, by the name typed, as the analyzer
 * reads a printed name (with the user's learned names), but with no label
 * to check: the user chose it. A test the name is but the unit fits not is
 * proposed.
 */
function readTypedName(biomarker: IdentifiableValue, learned: LearnedAlias | undefined): MatchedBiomarker {
  const byName = identifyByPrintedName(biomarker, learned);
  if (byName) {
    const noUnit = byName.identificationFlags?.includes('no-unit');
    return { ...byName, identificationFlags: noUnit ? ['no-unit'] : [] };
  }
  const unmatched = notIdentified(biomarker);
  return unmatched.suggestedMatch ? { ...unmatched, identificationFlags: ['unit-mismatch'] } : unmatched;
}

/**
 * An analyzed value as edited, identified from the analyzer's reading and
 * its current name and unit only, so nothing typed on the way counts: with
 * its printed name as the analyzer does (the matching model's test too),
 * renamed by the AI's key or the name typed. An emptied unit is one still
 * to choose: the test is the one the report's unit gives, and review asks
 * for the unit.
 */
function identifyEdited(
  biomarker: MatchedBiomarker & { analyzed: AnalyzedValue },
  learned: LearnedAlias | undefined
): MatchedBiomarker {
  const { analyzed } = biomarker;
  const identify = (unit: string) => {
    const value = { ...biomarker, unit };
    // A name edited only in case, spacing or accent encoding reads as printed
    return nameKey(biomarker.name) === nameKey(analyzed.name)
      ? identifyAnalyzed(value, learned)
      : (identifyByKey(value, learned) ?? readTypedName(value, learned));
  };
  // An emptied unit: the test the report's unit gives, else one measured
  // without a unit (a stray "pH" cleared from a urine pH)
  const emptied = biomarker.unit.trim() === '';
  const byReportUnit = identify(emptied ? analyzed.unit : biomarker.unit);
  const withoutUnit = emptied && !byReportUnit.dictionaryMatch ? identify('') : undefined;
  const identified = withoutUnit?.dictionaryMatch ? withoutUnit : byReportUnit;
  return {
    ...identified,
    unit: biomarker.unit,
    normalizedUnit: normalizeUnit(biomarker.unit),
  };
}

/** What the analyzer read a value as; for a value from elsewhere, the value before the edit */
function analyzedAs(biomarker: MatchedBiomarker): AnalyzedValue {
  return biomarker.analyzed ?? { name: biomarker.name, unit: biomarker.unit };
}

/**
 * A value edited in review, its test read again: a pinned test stays, a
 * row the user added is read by its name, an analyzed value as the
 * analyzer reads it
 */
function reidentify(
  original: MatchedBiomarker,
  changed: MatchedBiomarker,
  learned: LearnedAlias | undefined,
  { nameEdited }: { nameEdited: boolean }
): MatchedBiomarker {
  if (isPinned(original)) return changed;
  if (!original.identificationFlags) return readAddedRow(changed, learned, { nameEdited });
  return identifyEdited({ ...changed, analyzed: analyzedAs(original) }, learned);
}

/**
 * Rename a value. Its test is read again from the new name and its unit,
 * as the analyzer reads it: a test the AI identified stays (the name is its
 * label) with whether the name suggests another worked out again, and a
 * test the user picked, or "Not in dictionary", stays. Free text is saved
 * as an unknown biomarker rather than under its previous match.
 */
export function applyBiomarkerName(
  biomarker: MatchedBiomarker,
  name: string,
  learned?: LearnedAlias
): MatchedBiomarker {
  return reidentify(biomarker, { ...biomarker, name }, learned, { nameEdited: true });
}

/**
 * Change a value's unit. Its test is read again in the new unit, as the
 * analyzer reads it: a proposed test (by the AI, the typed name or the
 * matching model) becomes the value's test once the unit fits it, and a
 * count's name in % is its percentage. An emptied unit is one still to
 * choose: the test stays, and review asks for the unit.
 */
export function applyBiomarkerUnit(
  biomarker: MatchedBiomarker,
  unit: string,
  learned?: LearnedAlias
): MatchedBiomarker {
  return reidentify(biomarker, { ...biomarker, unit, unitFromName: false }, learned, { nameEdited: false });
}

/**
 * Save a value as a test the user chose in review, or as not in the
 * dictionary (null): the choice is final, so name edits no longer move it
 */
export function chooseTest(
  biomarker: MatchedBiomarker,
  definition: BiomarkerDefinition | null
): MatchedBiomarker {
  return {
    ...biomarker,
    dictionaryMatch: definition ?? undefined,
    suggestedMatch: undefined,
    identifiedBy: definition ? 'user' : undefined,
    identificationFlags: definition ? [] : ['not-identified'],
    nameSuggests: undefined,
    savedAsUnknown: definition === null,
  };
}

