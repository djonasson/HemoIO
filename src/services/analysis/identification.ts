/**
 * Giving each extracted value its LOINC code: a test learned for the
 * wording, the local match, then one AI call for the values several tests
 * fit; what is left is the user's to choose in review.
 */
import type { SavedValue } from '@data/loinc/learnedTests';
import { isUnknownKey, unknownBiomarkerKey } from '@data/loinc/keys';
import { learnedKey, matchLocally, type Candidate, type PrintedValue } from './loincMatch';
import type { Catalog } from '@data/loinc/catalog';
import type { ExtractedBiomarker, TestChoice, TestChoiceRequest } from '../ai';
import type { IdentificationFlag, IdentifiedBy, MatchedBiomarker } from './LabReportAnalyzer';

/** The user's learned tests: learned key → LOINC code, or an unknown key for "Not a LOINC test" */
export type LearnedTests = Readonly<Record<string, string>>;

/** What identification sets on a value */
export interface Identification {
  loincCode?: string;
  candidates: Candidate[];
  /** The candidate the AI picked but was not sure of */
  aiPick?: string;
  identifiedBy?: IdentifiedBy;
  identificationFlags: IdentificationFlag[];
  savedAsUnknown?: boolean;
  /** For "Not a LOINC test" learned for the wording: the unknown key it was saved under */
  unknownKey?: string;
}

/** Asks the AI which candidate each value is */
export type ChooseTests = (requests: TestChoiceRequest[]) => Promise<TestChoice[]>;

/**
 * A printed value's test as far as it is known without the AI: the one
 * learned for its wording and unit (a learned "Not a LOINC test" too), else
 * the one test that clearly fits. A value the report gives no unit is
 * matched only to a common test that has none (pH, specific gravity, a
 * dipstick's presence), never to a quantity a unit would tell apart; else
 * its candidates, of any property, are left to the AI and the user, as
 * those of any value several tests fit.
 */
export function identifyLocally(
  catalog: Catalog,
  value: PrintedValue,
  learned: LearnedTests = {}
): Identification {
  const taught = learned[learnedKey(value)];
  if (taught && isUnknownKey(taught)) {
    // Saved under the key learned, so a wording the user renamed joins the series it was saved in
    return { candidates: [], identifiedBy: 'learned', identificationFlags: [], savedAsUnknown: true, unknownKey: taught };
  }

  const match = matchLocally(catalog, value, (key) => learned[key]);
  if (match.status === 'match') {
    return {
      loincCode: match.code,
      candidates: match.candidates,
      identifiedBy: match.code === taught ? 'learned' : 'local',
      identificationFlags: [],
    };
  }
  // A name that fits no test still has the common tests of its unit to choose from
  const flags: IdentificationFlag[] = [match.status === 'none' ? 'not-identified' : 'ambiguous'];
  if (value.unit.trim() === '') flags.push('no-unit');
  return { candidates: match.candidates, identificationFlags: flags };
}

/** Whether a value has no test decided yet: no code, and not "Not a LOINC test" */
export function needsTest(identification: Pick<Identification, 'loincCode' | 'savedAsUnknown'>): boolean {
  return !identification.loincCode && !identification.savedAsUnknown;
}

/** Whether a value is still undecided among candidates: the AI, then the user, chooses */
export function needsChoice(
  identification: Pick<Identification, 'loincCode' | 'savedAsUnknown' | 'candidates'>
): boolean {
  return needsTest(identification) && identification.candidates.length > 0;
}

/** The AI's choice applied: a confident one is the value's test, an unsure one goes first among the candidates */
function withChoice(value: MatchedBiomarker, choice: TestChoice | undefined): MatchedBiomarker {
  if (!choice?.code) return value;
  if (choice.confident) {
    return { ...value, loincCode: choice.code, identifiedBy: 'ai', identificationFlags: [] };
  }
  const picked = value.candidates.find((candidate) => candidate.code === choice.code);
  return picked
    ? {
        ...value,
        candidates: [picked, ...value.candidates.filter((candidate) => candidate !== picked)],
        aiPick: picked.code,
      }
    : value;
}

/** The values identified, and whether the AI could not be asked */
export interface IdentifiedValues {
  values: MatchedBiomarker[];
  choiceFailed: boolean;
}

/**
 * Identify a report's values: each locally, then the undecided ones in one
 * request to the AI, if there is one to ask. A failed request leaves them
 * to the user.
 */
export async function identifyValues(
  catalog: Catalog,
  extracted: readonly ExtractedBiomarker[],
  { learned, choose }: { learned?: LearnedTests; choose?: ChooseTests }
): Promise<IdentifiedValues> {
  const values = extracted.map((biomarker) =>
    asAnalyzed(biomarker, identifyLocally(catalog, biomarker, learned))
  );

  const requests: TestChoiceRequest[] = values.flatMap((value, index) =>
    needsChoice(value)
      ? [
          {
            id: String(index),
            name: value.name,
            unit: value.unit,
            ...(value.specimenHint && { specimenHint: value.specimenHint }),
            candidates: value.candidates.map(({ code, name }) => ({ code, name })),
          },
        ]
      : []
  );
  if (!choose || requests.length === 0) return { values, choiceFailed: false };

  let choices: TestChoice[];
  try {
    choices = await choose(requests);
  } catch {
    return { values, choiceFailed: true };
  }
  const byId = new Map(choices.map((choice) => [choice.id, choice]));
  return {
    values: values.map((value, index) => {
      const chosen = withChoice(value, byId.get(String(index)));
      // Editing back to the printed name and unit restores the AI's choice too
      return chosen === value
        ? value
        : { ...chosen, analyzed: { name: value.name, unit: value.unit, identification: identificationOf(chosen) } };
    }),
    choiceFailed: false,
  };
}

/** An extracted value with the identification the analyzer gave it, kept to restore it after edits */
export function asAnalyzed(biomarker: ExtractedBiomarker, identification: Identification): MatchedBiomarker {
  return { ...biomarker, ...identification, analyzed: { name: biomarker.name, unit: biomarker.unit, identification } };
}

/** Whether a value's test was found without asking: learned, or the one test that fits */
export function isFoundWithoutAsking(value: Pick<MatchedBiomarker, 'identifiedBy'>): boolean {
  return value.identifiedBy === 'learned' || value.identifiedBy === 'local';
}

/** A value's identification fields */
export function identificationOf(value: MatchedBiomarker): Identification {
  return {
    loincCode: value.loincCode,
    candidates: value.candidates,
    aiPick: value.aiPick,
    identifiedBy: value.identifiedBy,
    identificationFlags: value.identificationFlags ?? [],
    savedAsUnknown: value.savedAsUnknown,
    unknownKey: value.unknownKey,
  };
}

/**
 * The key a "Not a LOINC test" value is stored under: the one learned for
 * its wording, else the unknown key of its name
 */
export function unknownKeyOf(value: Pick<MatchedBiomarker, 'name' | 'unknownKey'>): string {
  return value.unknownKey ?? unknownBiomarkerKey(value.name);
}

/**
 * What saving a value teaches: its code under the wording and unit the
 * report printed. It is the user's decision when they chose the test, saved
 * the AI's choice, or edited the value until it matched (by name and unit,
 * or through a wording learned before: a correction sticks); a test matched
 * with no edit, or learned, is matched the same way next time anyway.
 */
export function toLearn(value: MatchedBiomarker): SavedValue {
  const printed = value.analyzed ?? value;
  const edited = !value.analyzed || learnedKey(value) !== learnedKey(value.analyzed);
  const by = value.identifiedBy;
  return {
    key: learnedKey(printed),
    code: value.savedAsUnknown ? unknownKeyOf(value) : value.loincCode,
    confirmed: by === 'ai' || by === 'user' || (edited && isFoundWithoutAsking(value)),
  };
}
