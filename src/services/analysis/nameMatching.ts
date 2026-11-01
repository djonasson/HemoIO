/**
 * Which test a printed name is, read with its unit: reports name some tests
 * alike (a count and its percentage, a 24-hour collection's amount and its
 * concentration) and tell them apart by the unit. Shared by the analyzer
 * and by review, so a name typed in review is read as an analyzed one.
 */
import type { ExtractedBiomarker } from '../ai';
import {
  findBiomarker,
  getBiomarkerByKey,
  isBareAnalyteName,
  isBloodSpecimen,
  matchBiomarkerName,
  isNameOf,
  nameMeasuresTest,
  namedSpecimen,
  percentageOf,
  sameAnalyteIn,
  sameSpecimen,
} from '../../data/biomarkers/dictionary';
import type { BiomarkerDefinition, NamedSpecimen } from '../../data/biomarkers/dictionary';
import { normalizeUnit } from '../units';
import { unitFitsBiomarker } from '../units/unitFit';
import type { AnalyzedValue, MatchedBiomarker } from './LabReportAnalyzer';

/**
 * A 24-hour urine collection's amount per day and its concentration, which
 * reports name alike ("Creatinina (urine, 24h)" in g/24h and in µmol/L)
 */
export const UNIT_PAIRS: Readonly<Record<string, string>> = Object.fromEntries(
  [
    ['24-hour-urine-creatinine', 'urine-creatinine'],
    ['24-hour-urine-urea', 'urine-urea'],
  ].flatMap(([perDay, concentration]) => [
    [perDay, concentration],
    [concentration, perDay],
  ])
);

/**
 * The test a value in `unit` is, of `definition` and the tests reported
 * alike with it (a count's percentage, a 24-hour urine collection's
 * concentration or amount): `definition` when the unit fits it or none of
 * them, else the alike test the unit fits
 */
export function readWithUnit(definition: BiomarkerDefinition, unit: string): BiomarkerDefinition {
  if (unitFitsBiomarker(definition, unit)) return definition;
  const pair = UNIT_PAIRS[definition.key];
  // A percentage test lists only shares, so a unit that fits it is a share
  return (
    [percentageOf(definition), pair && getBiomarkerByKey(pair)]
      .find((alike) => alike && unitFitsBiomarker(alike, unit)) || definition
  );
}

/**
 * Match an extracted biomarker to the dictionary by its printed name
 */
function matchByName(
  biomarker: ExtractedBiomarker
): MatchedBiomarker {
  // Only the name and unit count: a test read before (an edited value) never survives
  const cleared = unidentified(biomarker);

  // Exact name or alias first, then variations (punctuation, spacing)
  const exactMatch = findBiomarker(biomarker.name);
  const named = exactMatch ?? matchBiomarkerName(biomarker.name);

  // Reports name some tests alike and tell them apart by the unit: a
  // count's percentage ("Eritroblasti", "Neutrophils" in %), or a 24-hour
  // urine collection's concentration, which reports name after the collection
  const candidate = named && readWithUnit(named, biomarker.unit);

  if (candidate) {
    // An incompatible unit means the name may be misread: suggest, don't assume
    return unitFitsBiomarker(candidate, biomarker.unit)
      ? {
          ...cleared,
          dictionaryMatch: candidate,
          // Exact when the name matched exactly, also when the unit then
          // chose the entry reported alike
          isExactMatch: exactMatch !== undefined,
        }
      : { ...cleared, suggestedMatch: candidate };
  }

  return cleared;
}

/** The test a name is, read with its unit; none when the unit fits no test of that name */
export function testOfName(name: string, unit: string): BiomarkerDefinition | undefined {
  return matchByName({ name, unit, value: 0, confidence: 1 }).dictionaryMatch;
}

/** A value to identify: as extracted, with what the analyzer read it as */
export interface IdentifiableValue extends ExtractedBiomarker {
  analyzed?: AnalyzedValue;
}

/** Whether the value has no unit, and the report gave it none (a dipstick screening, "< 15") */
function reportGaveNoUnit(biomarker: IdentifiableValue): boolean {
  return biomarker.unit.trim() === '' && (biomarker.analyzed?.unit ?? biomarker.unit).trim() === '';
}

/** The user's learned name for a printed name */
export type LearnedAlias = (name: string) => BiomarkerDefinition | undefined;

/**
 * The test the printed name suggests instead of `test`, read with its unit
 * (a count's name in % is its percentage), or the one the user taught for
 * it if its unit fits; none when they agree. Only a different test is
 * worth a check. A name of what the test measures agrees whatever the
 * unit (see `agrees`). With `fitting`, only a test the unit fits; else also
 * the test the name is, in a unit that test is not measured in
 * ("Emoglobina" in % keyed as hematocrit, "Glicemia" in % keyed as HbA1c).
 */
export function nameSuggestion(
  biomarker: ExtractedBiomarker,
  test: BiomarkerDefinition,
  learned: LearnedAlias | undefined,
  { fitting }: { fitting: boolean }
): BiomarkerDefinition | undefined {
  const exact = matchBiomarkerName(biomarker.name);
  // Only a name that is a test says a specimen worth weighing
  const says = exact && namedSpecimen(biomarker.name);
  const fits = (candidate: BiomarkerDefinition) => unitFitsBiomarker(candidate, biomarker.unit);
  if (exact && exact.key !== test.key && agrees(biomarker.name, says, exact, test)) {
    if (!fitting) return undefined;
    // A unit the AI's test does not fit makes a test of the same analyte
    // worth saying: in the AI test's specimen when the unit fits it there
    // ("Leukocytes" in cells/µL keyed as the esterase pad is Urine WBC),
    // else the one the name gives
    const there = sameAnalyteIn(exact, test, fits);
    if (there && there.key !== test.key && fits(there)) return there;
  }
  const named =
    testOfName(biomarker.name, biomarker.unit) ??
    learnedTest(biomarker, learned) ??
    (!fitting && exact ? nameSuggestsOther(says, exact, test, fits) : undefined);
  return named && named.key !== test.key ? named : undefined;
}

/** A test's specimen family: blood, urine (spot or 24-hour), or its own */
function family(definition: BiomarkerDefinition): string {
  if (isBloodSpecimen(definition.specimenType)) return 'blood';
  return definition.specimenType?.startsWith('urine') ? 'urine' : (definition.specimenType ?? 'blood');
}

/**
 * Whether the printed name, whose test is `named`, agrees with the AI's
 * `test`: it is one of the test's own names ("PCR" is also CRP's, marks
 * aside), or names what the test measures or screens for ("Creatinina"
 * keyed as 24-hour urine creatinine, "Leucociti" as the leukocyte esterase
 * pad) in the test's specimen family. The specimen is the one the name
 * says ("Proteine (urine)" keyed as serum protein, "Urea plasmatica" as
 * urine urea do not agree), else its own test's ("Glicemia" is blood
 * glucose, "Semen pH" no urine pH); a bare analyte name says none.
 */
function agrees(
  name: string,
  says: NamedSpecimen | undefined,
  named: BiomarkerDefinition,
  test: BiomarkerDefinition
): boolean {
  if (isNameOf(test, name)) return true;
  if (!nameMeasuresTest(named, test)) return false;
  const specimen = says ?? (isBareAnalyteName(name) ? undefined : family(named));
  return specimen === undefined || specimen === family(test);
}

/**
 * The test to suggest when the printed name is `named`, which does not
 * agree with `test`, in a unit it is not measured in: the name's test in
 * one specimen, in another specimen family the name says ("Emoglobina
 * (urine)" in % keyed as hematocrit is urine blood), or the 24-hour
 * collection the name says ("Creatinina 24h"); else, as reports print
 * bare names under a urine heading, what it is in the test's specimen if
 * the dictionary has it there ("Creatinina" in g/24h keyed as 24-hour
 * urine urea is 24-hour urine creatinine), or its own test ("Sodio" keyed
 * as 24-hour urine urea).
 */
function nameSuggestsOther(
  says: NamedSpecimen | undefined,
  named: BiomarkerDefinition,
  test: BiomarkerDefinition,
  fits: (candidate: BiomarkerDefinition) => boolean
): BiomarkerDefinition {
  const saysOwn = says !== undefined && (says !== family(test) || named.specimenType === 'urine-24h');
  if (sameSpecimen(named, test) || saysOwn) return named;
  return sameAnalyteIn(named, test, fits) ?? named;
}

/** The test the user taught for the printed name, read with its unit; none when the unit fits it not */
export function learnedTest(
  biomarker: ExtractedBiomarker,
  learned: LearnedAlias | undefined
): BiomarkerDefinition | undefined {
  const taught = learned?.(biomarker.name);
  const test = taught && readWithUnit(taught, biomarker.unit);
  return test && unitFitsBiomarker(test, biomarker.unit) ? test : undefined;
}

/** A value with no test yet: the identification fields cleared */
function unidentified(biomarker: ExtractedBiomarker): MatchedBiomarker {
  return {
    ...biomarker,
    dictionaryMatch: undefined,
    suggestedMatch: undefined,
    nameSuggests: undefined,
    identifiedBy: undefined,
    isExactMatch: false,
    normalizedUnit: normalizeUnit(biomarker.unit),
  };
}

/**
 * A value the report gives no unit (a dipstick screening, "< 15") is not
 * the measured test its name or key is: saved under its own name
 */
function unitless(biomarker: IdentifiableValue): MatchedBiomarker {
  return { ...unidentified(biomarker), identificationFlags: ['no-unit'] };
}

/**
 * A value's test by the AI's key, read with its unit (its percentage, its
 * 24-hour pair): saved as it when the unit fits, else only proposed; a
 * value with no unit is saved under its own name. Undefined when the value
 * has no key the dictionary knows.
 */
export function identifyByKey(
  biomarker: IdentifiableValue,
  learned?: LearnedAlias
): MatchedBiomarker | undefined {
  const aiKey = biomarker.biomarkerKey ? getBiomarkerByKey(biomarker.biomarkerKey) : undefined;
  if (!aiKey) return undefined;
  const choice = readWithUnit(aiKey, biomarker.unit);
  const base = { ...unidentified(biomarker), identifiedBy: 'ai' as const };
  if (unitFitsBiomarker(choice, biomarker.unit)) {
    const named = nameSuggestion(biomarker, choice, learned, { fitting: false });
    return {
      ...base,
      dictionaryMatch: choice,
      isExactMatch: true,
      identificationFlags: named ? ['name-disagrees'] : [],
      nameSuggests: named,
    };
  }
  if (reportGaveNoUnit(biomarker)) return unitless(biomarker);
  // A unit emptied in review is one still to choose: the test stays, and
  // review asks for the unit
  if (biomarker.unit.trim() === '') {
    return { ...base, dictionaryMatch: choice, isExactMatch: true, identificationFlags: [] };
  }
  // A test the name or a learned alias gives that does fit is worth saying
  const fitting = nameSuggestion(biomarker, choice, learned, { fitting: true });
  return {
    ...base,
    suggestedMatch: choice,
    identificationFlags: fitting ? ['unit-mismatch', 'name-disagrees'] : ['unit-mismatch'],
    nameSuggests: fitting,
  };
}

/**
 * A value's test by its printed name, then by a learned alias, each read
 * with its unit and only with a fitting unit; a value with no unit whose
 * name is a test with one is saved under its own name. Undefined when
 * neither gives a test.
 */
export function identifyByPrintedName(
  biomarker: IdentifiableValue,
  learned?: LearnedAlias
): MatchedBiomarker | undefined {
  const cleared = unidentified(biomarker);
  const byName = matchByName(biomarker);
  const named = byName.dictionaryMatch ?? byName.suggestedMatch;
  const noUnit = biomarker.unit.trim() === '' && named !== undefined && named.canonicalUnit !== '';
  if (noUnit && reportGaveNoUnit(biomarker)) return unitless(biomarker);
  // A unit emptied in review is one still to choose: the test stays
  const test = (noUnit ? named : byName.dictionaryMatch) ?? learnedTest(biomarker, learned);
  if (!test) return undefined;
  return {
    ...cleared,
    dictionaryMatch: test,
    isExactMatch: byName.isExactMatch,
    identifiedBy: 'name',
    identificationFlags: ['name-only'],
  };
}

/**
 * A value whose test the matching model chose for its printed name, read
 * with its unit (a count's name in % is its percentage): kept while the
 * unit fits it, else proposed
 */
export function identifyByModel(
  biomarker: IdentifiableValue,
  modelMatch: BiomarkerDefinition
): MatchedBiomarker {
  const test = readWithUnit(modelMatch, biomarker.unit);
  if (unitFitsBiomarker(test, biomarker.unit)) {
    return {
      ...unidentified(biomarker),
      dictionaryMatch: test,
      identifiedBy: 'model',
      identificationFlags: ['similar-name'],
    };
  }
  return { ...unidentified(biomarker), suggestedMatch: test, identificationFlags: ['unit-mismatch'] };
}

/**
 * The analyzer's steps that need no download: by the AI's key, the printed
 * name, a learned name, then the test the matching model chose for the
 * printed name when it was analyzed
 */
export function identifyAnalyzed(biomarker: IdentifiableValue, learned?: LearnedAlias): MatchedBiomarker {
  const modelMatch = biomarker.analyzed?.modelMatch;
  return (
    identifyByKey(biomarker, learned) ??
    identifyByPrintedName(biomarker, learned) ??
    (modelMatch ? identifyByModel(biomarker, modelMatch) : undefined) ??
    notIdentified(biomarker)
  );
}

/** A value nothing identifies, with the test its name nearly is, if any, as a suggestion */
export function notIdentified(biomarker: IdentifiableValue): MatchedBiomarker {
  return {
    ...unidentified(biomarker),
    suggestedMatch: matchByName(biomarker).suggestedMatch,
    identificationFlags: ['not-identified'],
  };
}

/** The test proposed for a value whose unit does not fit it: by the AI, or by the name typed in review */
export function proposedTest(biomarker: MatchedBiomarker): BiomarkerDefinition | undefined {
  return biomarker.identificationFlags?.includes('unit-mismatch')
    ? biomarker.suggestedMatch
    : undefined;
}
