/**
 * The local step of giving a printed value its LOINC code: the lab's test
 * name, read with its sample and unit, searched in the shipped catalog. A
 * code is taken without asking only when one test clearly fits; otherwise
 * the candidates go on to the AI and the user.
 */
import { getAddon, TEST_ADDONS } from '@data/loinc/addons';
import { foldDashes, nameKey } from '@data/loinc/keys';
import { withMarks, type PrintingMarks } from '@data/loinc/learnedTests';
import {
  dimerMarkerIn,
  isCatalyticUnit,
  readUnitMarker,
  toUcum,
  ucumProperties,
  type DimerMarker,
} from '@services/units/ucum';
import {
  byRank,
  isDayUrine,
  isPanel,
  isStopWord,
  type Catalog,
  type CatalogTest,
  type ScoredTest,
} from '@data/loinc/catalog';
import type { QualitativeReading } from '../ai';

/** A value as the report prints it */
export interface PrintedValue {
  name: string;
  unit: string;
  /** The sample the report section or the AI names: "urine", "24h urine", "urine sediment" */
  specimenHint?: string;
  /** A result printed in words ("Assenti", "++"), which only a test whose results are words can have */
  qualitative?: QualitativeReading;
}

/** A test that may be the printed one */
export interface Candidate {
  code: string;
  /** LOINC long common name */
  name: string;
  score: number;
}

export type LocalMatch =
  | { status: 'match'; code: string; candidates: Candidate[] }
  | { status: 'ambiguous' | 'none'; candidates: Candidate[] };

/** Lowest score of a test taken without asking */
export const MATCH_SCORE = 0.9;
/**
 * How far that test must score above a rival to be taken over it: a name
 * equal to the printed one (1) is taken over tests that only share all its
 * words (0.9)
 */
export const MATCH_MARGIN = 0.1;
/**
 * Among rivals that fit as well, how many times more common (by LOINC's
 * rank) one test must be than all others to be the one meant
 */
export const RANK_DOMINANCE = 10;
/**
 * The rank under which LOINC's tests are common ones: its "Top 2000+"
 * laboratory observations, which make up about 98% of results. A rarer
 * test's related names hold many wordings of other tests ("beta 1" of an
 * integrin, "total vitamin D"), so a name fitting it says less.
 */
export const COMMON_RANK = 2000;
/** Most candidates passed on */
const MAX_CANDIDATES = 8;
/** How many of the unit's most common tests are looked through for ones the name is near */
const COMMON_POOL = 40;
/** Letters two words share at their start to be near ("fosforo" and "fosfato") */
const NEAR_STEM = 4;
/** Absorbs float error in score differences (0.9 - 0.75 is not exactly 0.15) */
const SCORE_EPSILON = 1e-9;

/**
 * The matcher's name for urine collected over 24 hours. LOINC writes it as
 * system "Urine" with time "24H", and the catalog keeps only the system.
 */
const DAY_URINE = '24H urine';

/** A spot urine sample, and its sediment (the cells and casts seen per field) */
const URINE_SEDIMENT = 'Urine sed';
const URINE = ['Urine', URINE_SEDIMENT];

/** Where a value with no sample named most likely comes from, likeliest first */
const DEFAULT_SYSTEMS = ['Ser/Plas', 'Ser', 'Plas', 'Ser/Plas/Bld', 'Bld', 'RBC', 'PPP'];

/**
 * Sample prefixes labs print before a test name, and the systems they mean.
 * "Ser/Plas/Bld" is LOINC's system for a test of any of the three (eGFR);
 * "PPP", platelet-poor plasma, that of the clotting tests; "RBC", that of
 * the red cell indices of a blood count (MCV, MCH, MCHC). "Er-", the red
 * cells ("Er-Emoglobina glicata"), names the tests of blood and its cells.
 */
const SAMPLE_PREFIXES: ReadonlyArray<[string, string[]]> = [
  ['U24', [DAY_URINE]],
  ['dU', [DAY_URINE]],
  ['Er', ['Bld', 'RBC']],
  ['Se', ['Ser', 'Ser/Plas', 'Ser/Plas/Bld']],
  ['Pl', ['Plas', 'Ser/Plas', 'PPP', 'Ser/Plas/Bld']],
  ['Sg', ['Bld', 'RBC', 'Ser/Plas/Bld']],
  ['S', ['Ser', 'Ser/Plas', 'Ser/Plas/Bld']],
  ['P', ['Plas', 'Ser/Plas', 'PPP', 'Ser/Plas/Bld']],
  ['B', ['Bld', 'RBC', 'Ser/Plas/Bld']],
  ['U', URINE],
];

/**
 * Samples the AI may name for a value (its specimen hint) besides urine,
 * which splitSamplePrefix reads. "Blood" is said loosely of serum tests
 * too, so it only makes blood the likelier.
 */
const SERUM_WORDS = 'serum|siero|sieric[oaie]|sieriche';
const PLASMA_WORDS = 'plasma|plasmatic[oaie]|plasmatiche';
// The red cells: "Folati eritrocitari"
const RED_CELL_WORDS = 'erythrocytes?|eritrocitari[oae]?';
const BLOOD_WORDS = 'blood|sangue|ematic[oaie]|ematiche';
// The blood count, whose values are all of blood and its cells: "Emocromo - Emoglobina"
const BLOOD_COUNT_WORDS = 'emocromo|emocromocitometrico';
const wordsOf = (words: string, flags: string): RegExp => new RegExp(`\\b(?:${words})\\b`, flags);
const BLOOD_HINT = wordsOf(BLOOD_WORDS, 'i');
// Said loosely too: a report's blood count heading also stands over tests of serum
const BLOOD_COUNT_HINT = wordsOf(BLOOD_COUNT_WORDS, 'i');
const BLOOD_FIRST = ['Bld', 'RBC', ...DEFAULT_SYSTEMS.filter((system) => system !== 'Bld' && system !== 'RBC')];
const SAMPLE_HINTS: ReadonlyArray<[RegExp, string[]]> = [
  [wordsOf(SERUM_WORDS, 'i'), ['Ser/Plas', 'Ser', 'Ser/Plas/Bld']],
  [wordsOf(PLASMA_WORDS, 'i'), ['Ser/Plas', 'Plas', 'PPP', 'Ser/Plas/Bld']],
  [wordsOf(RED_CELL_WORDS, 'i'), ['RBC']],
  [BLOOD_COUNT_HINT, BLOOD_FIRST],
  [BLOOD_HINT, BLOOD_FIRST],
];

/**
 * Words naming serum, plasma, red cells, the blood count or blood in a printed name:
 * "Glucosio sangue", "Calcium, Blood", "Piombo ematico", "Folati eritrocitari"
 */
const SAMPLE_WORDS = wordsOf([SERUM_WORDS, PLASMA_WORDS, RED_CELL_WORDS, BLOOD_COUNT_WORDS, BLOOD_WORDS].join('|'), 'gi');

/**
 * What says the value's sample: nothing; a prefix or a hint, which rule
 * out other samples; or a "blood" hint, which only makes blood the likelier
 */
type SampleSaid = 'none' | 'named' | 'loosely';

/** The urinalysis section prefix, read before the plain "U-" */
const URINALYSIS_PREFIX = /^U\s*-\s*Esame standard\b[\s\-.:]*/i;
const URINE_WORD = /\burin(?:a|e|ari[oaie]?|ary)\b/gi;
/** A substance said of urine by its ending: "Microalbuminuria", "Proteinuria" */
const URINE_ENDING = /(\p{L}{4,})uria\b/giu;
const DAY_WORD = /\b24\s*-?\s*(?:h|hrs?|hours?|ore)\b/gi;

/**
 * The Italian and English words for an antibody, and their usual
 * abbreviations: "anticorpi anti-", "Ac anti", "Ab anti" before what it
 * binds, "anticorpi" after it, or "anti-" opening the name. A lab's own
 * abbreviation ("A.A.") is learned once chosen, not written here.
 */
const ANTIBODY_BEFORE = /^(?:(?:anticorp[oi]|ac\.?|ab)\s+anti(?:[\s-]+|(?=\p{L}))|anti[\s-]+(?=\p{L}))/iu;
const ANTIBODY_WORD = /\(?\banticorp[oi]\b\)?/iu;

/**
 * A name of an antibody as LOINC names it, with "Ab" after what it binds
 * ("Anticorpi anti tireoperossidasi" is "tireoperossidasi Ab"), else the
 * name as it is
 */
export function readAntibody(name: string): string {
  const before = name.match(ANTIBODY_BEFORE);
  if (before) return `${name.slice(before[0].length).trim()} ab`;
  const rest = name.replace(ANTIBODY_WORD, ' ');
  return rest === name ? name : `${squeeze(rest)} ab`;
}

/** Words saying a count is one, not a share: "Neutrophil, Absolute", "Neutrofili assoluti" */
const COUNT_WORDS = /[\s,;:-]*\b(?:absolute|assolut[oiae]|abs)\b\.?/giu;

/** A name without the words saying its value is a count, if more is left */
function withoutCountWords(name: string): string {
  const rest = squeeze(name.replace(COUNT_WORDS, ' '));
  return /\p{L}/u.test(rest) ? rest : name;
}

/** Text with its runs of spaces made one, and none at its ends */
function squeeze(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Greek letters as their names: "α1-antitripsina", "β2-microglobulina" */
const GREEK_LETTERS: Readonly<Record<string, string>> = {
  α: 'alfa', β: 'beta', γ: 'gamma', δ: 'delta', κ: 'kappa', λ: 'lambda',
  a: 'alfa', b: 'beta', g: 'gamma',
};
const spelledLetter = (_all: string, letter: string): string => `${GREEK_LETTERS[letter]}-`;

/** A name with its Greek letters spelled out, as LOINC's names have them */
function spellGreekLetters(name: string): string {
  return name.replace(/(?<!\p{L})([αβγδκλ])(?!\p{L})-?/gu, spelledLetter);
}

/**
 * A name with its Greek letters spelled out, and the Latin letters a PDF's
 * symbol font gives for them: a lowercase "a", "b" or "g" before a number
 * or a hyphen ("a1-antitripsina", "b-2 microglobulina",
 * "17-a-idrossiprogesterone"). Only one reading of the name: "g-GT" and
 * "vitamina b12" are read as printed too.
 */
export function spellGreek(name: string): string {
  return spellGreekLetters(name).replace(/(?<=^|[\s(-])([abg])(?:-|(?=\d))/gu, spelledLetter);
}

/** A letter and its two-digit number written apart, as one word: "Vitamina B 12" is "Vitamina B12" */
function joinLetterNumbers(name: string): string {
  return name.replace(/(?<=^|\s)(\p{L}) (\d{2})(?=\s|$)/gu, '$1$2');
}

/**
 * The ways a name may be read, each searched and the best fit kept: as
 * printed, with an antibody as LOINC names it, and with the Latin
 * stand-ins of Greek letters and a letter apart from its number joined.
 * Each is only another reading, so the printed one still competes ("Anti-
 * Xa", "g-GT", "Glucosio a 30 min").
 */
function readingsOf(name: string): string[] {
  return [...new Set([name, readAntibody(name)].flatMap((reading) => [reading, joinLetterNumbers(spellGreek(reading))]))];
}

/** The name without a leading sample prefix, and the systems the prefix means */
function stripPrefix(name: string): { name: string; systems?: string[] } {
  if (URINALYSIS_PREFIX.test(name)) return { name: name.replace(URINALYSIS_PREFIX, ''), systems: URINE };
  for (const [prefix, systems] of SAMPLE_PREFIXES) {
    // A urine prefix may stand apart by a space alone: "U Albumina 24h"
    const separator = systems.includes('Urine') || systems.includes(DAY_URINE) ? '(?:\\s*[-.:]\\s*|\\s+(?=\\p{Lu}))' : '\\s*[-.:]\\s*';
    const match = name.match(new RegExp(`^${prefix}${separator}`, 'u'));
    const rest = match ? name.slice(match[0].length) : '';
    // "P.C.R." is an abbreviation, not plasma's "C.R."
    if (rest && !/^\p{L}\./u.test(rest)) return { name: rest, systems };
  }
  return { name };
}

/**
 * A printed test name without its sample prefix ("S-", "P.", "U:", "U-Esame
 * standard") or urine words ("urina", "urinario", "24h", "24 ore", the
 * ending of "proteinuria"), and the LOINC systems they name. "24H urine"
 * stands for 24-hour urine. A name naming no sample has no systems.
 */
export function splitSamplePrefix(name: string): { name: string; systems?: string[] } {
  const prefixed = stripPrefix(name.trim());
  const urine = prefixed.name.search(URINE_WORD) !== -1 || prefixed.name.search(URINE_ENDING) !== -1;
  const day = prefixed.name.search(DAY_WORD) !== -1;
  if (!urine && !day) return prefixed;

  const rest = prefixed.name
    .replace(URINE_ENDING, '$1')
    .replace(URINE_WORD, ' ')
    .replace(DAY_WORD, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const named = prefixed.systems;
  // The words only narrow a urine sample, or name one; another prefix stands
  if (named && !named.includes('Urine')) return { name: rest, systems: named };
  return { name: rest, systems: day ? [DAY_URINE] : URINE };
}

/** A specimen hint naming the urine sediment: "urine sediment", "sedimento urinario" */
const SEDIMENT_HINT = /\bsediment[oi]?\b/i;

/**
 * The LOINC systems a specimen hint names, if any: a urine sediment one,
 * the sediment before the urine, whose machine counts per volume a sediment
 * section prints too
 */
function hintSystems(hint: string): string[] | undefined {
  if (SEDIMENT_HINT.test(hint)) return [URINE_SEDIMENT, 'Urine'];
  return splitSamplePrefix(hint).systems ?? SAMPLE_HINTS.find(([words]) => words.test(hint))?.[1];
}

/** How a value was printed, as learning tells its wording apart: its result in words, and of a urine sediment section */
function printingOf(value: PrintedValue): PrintingMarks {
  return { inWords: value.qualitative !== undefined, ofSediment: SEDIMENT_HINT.test(value.specimenHint ?? '') };
}

/**
 * The key a value's code is remembered under: its printed name and unit,
 * with the D-dimer units the unit names ("ng/mL (FEU)" and "ng/mL FEU" are
 * one unit, apart from "ng/mL DDU"); and how it was printed (see
 * printingOf), as "Batteri" "Assenti" in the sediment is neither the count
 * nor the strip's reading of the urine. A result in words has no unit of
 * its own: one given in review for its test leaves it the same wording.
 */
export function learnedKey(value: PrintedValue): string {
  const printing = printingOf(value);
  const { unit, marker } = readUnitMarker(printing.inWords ? '' : value.unit);
  return withMarks(`${nameKey(value.name)}|${toUcum(unit) ?? nameKey(unit)}${marker ? ` ${marker}` : ''}`, printing);
}

interface Found {
  test: CatalogTest;
  score: number;
  /** Index of the test's sample among the samples searched: lower is likelier */
  preference: number;
}

/** Where a search looks: samples by likelihood, and the properties and UCUM unit the printed unit reads as */
interface Scope {
  systems: string[];
  properties: string[];
  ucum: string | null;
  /** Whether tests HemoIO describes in the unit fit it too (see fitsDescribedUnit) */
  described?: boolean;
}

/**
 * Whether the test fits a unit LOINC files under another property: HemoIO
 * describes it in that unit, and no test it trends with has the unit's
 * property ("mmol/mol" HbA1c, but not "mmol/L" for mass glucose). Only
 * asked when no test of the unit's property fits the name: a description
 * never moves a value off the LOINC test of its own property.
 */
function fitsDescribedUnit(catalog: Catalog, test: CatalogTest, { properties, ucum }: Scope): boolean {
  const addon = ucum ? getAddon(catalog, test.code) : undefined;
  if (!addon?.canonicalUnit) return false;
  if (![addon.canonicalUnit, ...(addon.alternativeUnits ?? [])].some((unit) => toUcum(unit) === ucum)) return false;
  return !catalog
    .groupCodes(catalog.trendGroup(test.code))
    .some((code) => properties.includes(catalog.test(code)?.property ?? ''));
}

/**
 * Whether a test's property fits the unit as LOINC measures the test.
 * International units per volume are read as catalytic only because labs
 * print enzymes in them ("ALT 30 UI/L"): an activity LOINC gives in other
 * units (renin's ng/mL/h, a rate of what the enzyme makes) is not one.
 */
function fitsProperty(test: CatalogTest, { properties, ucum }: Scope): boolean {
  if (!properties.includes(test.property)) return false;
  if ((test.property !== 'CCnc' && test.property !== 'CRat') || !ucum?.includes('[IU]') || test.units.length === 0) return true;
  return test.units.some((unit) => isCatalyticUnit(unit) || unit.includes('[IU]'));
}

/** Tests whose names fit, of the given samples, and of the unit's properties or described in it, best first */
function findTests(catalog: Catalog, name: string, scope: Scope): Found[] {
  const { systems, properties } = scope;
  return catalog
    .scoredSearch(name, { systems: [...new Set(systems.map((system) => (system === DAY_URINE ? 'Urine' : system)))] })
    .filter(
      ({ test }) =>
        properties.length === 0 ||
        fitsProperty(test, scope) ||
        (scope.described === true && fitsDescribedUnit(catalog, test, scope))
    )
    .map(({ test, score }) => ({
      test,
      score,
      preference: systems.findIndex((system) => fitsSystem(test, system)),
    }))
    // A printed value is one test, never a panel of them
    .filter(({ test, preference }) => preference !== -1 && !isPanel(test));
}

/**
 * The catalog with each search's result kept for the value being matched:
 * the name's forms, the described-unit pass and the prefix checks repeat
 * the same searches.
 */
function withSearchesKept(catalog: Catalog): Catalog {
  const kept = new Map<string, ScoredTest[]>();
  const scoredSearch: Catalog['scoredSearch'] = (query, filter) => {
    const key = JSON.stringify([query, filter?.properties, filter?.systems]);
    let result = kept.get(key);
    if (!result) {
      result = catalog.scoredSearch(query, filter);
      kept.set(key, result);
    }
    return result;
  };
  return { ...catalog, scoredSearch };
}

/**
 * LOINC scales whose results are words: ordinal ("Absent", "2+"),
 * semi-quantitative steps (a strip's, a RAST class), and nominal ("Negative")
 */
const WORD_SCALES: ReadonlySet<string> = new Set(['Ord', 'OrdQn', 'SemiQn', 'Nom']);

/** A name saying its test looks for an organism: a culture, a search ("Urinocoltura", "Ricerca parassiti") */
const ORGANISM_SEARCH = /\b(?:\p{L}*coltur\p{L}*|cultur\p{L}*|ricerca|search|identif\p{L}*)\b/iu;

/**
 * Whether a test's results are words a report prints as a presence, a step
 * or a reading; an organism a culture names only when the name looks for one
 */
function hasWordResults(test: CatalogTest, organisms: boolean): boolean {
  return WORD_SCALES.has(test.scale) && (organisms || test.property !== 'Prid');
}

/** The items, each key's first only */
function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => unknown): T[] {
  const seen = new Set<unknown>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Each key's item of the best score, of two as good the first, in the order each key first comes */
function bestBy<T extends { score: number }>(items: readonly T[], keyOf: (item: T) => unknown): T[] {
  const best = new Map<unknown, T>();
  for (const item of items) {
    const key = keyOf(item);
    if (item.score > (best.get(key)?.score ?? -Infinity)) best.set(key, item);
  }
  return [...best.values()];
}

/** The catalog searched only for the tests kept */
function withTestsKept(catalog: Catalog, kept: (test: CatalogTest) => boolean): Catalog {
  const scoredSearch: Catalog['scoredSearch'] = (query, filter) =>
    catalog.scoredSearch(query, filter).filter(({ test }) => kept(test));
  return { ...catalog, scoredSearch };
}

/**
 * The tests a value is first looked for among, if its printing narrows
 * them: a result printed in words ("Assenti") is a presence test's or an
 * interpretation's, never a count, nor a culture's organism unless the name
 * looks for one; a result in words or a bare number in a urine sediment
 * section is what the microscope saw, not a strip's reading
 */
function firstLookedAmong(value: PrintedValue): ((test: CatalogTest) => boolean) | undefined {
  const printing = printingOf(value);
  const inWords = printing.inWords;
  const ofSediment = printing.ofSediment && (inWords || value.unit.trim() === '');
  if (!inWords && !ofSediment) return undefined;
  const organisms = ORGANISM_SEARCH.test(value.name);
  return (test) => (!inWords || hasWordResults(test, organisms)) && (!ofSediment || test.system !== 'Urine');
}

/**
 * The ways a printed name may name its test: whole, without its brackets,
 * and each bracket alone, each with what it leaves out. A bracket holds
 * another name ("Tirotropina (TSH)") or a qualifier the catalog does not
 * name ("(metodo enzimatico)"); so does a part set off by a spaced dash
 * ("Creatina chinasi - CK").
 */
function nameForms(name: string): { form: string; left: string; part?: 'bracket' | 'dashed' }[] {
  const brackets = [...name.matchAll(/\(([^()]*)\)/g)].map(([, inner]) => inner.trim());
  const outside = squeeze(name.replace(/\([^()]*\)/g, ' '));
  const dashed = outside.split(/\s+[-–]\s+/);
  const dashedParts = dashed.length > 1 ? dashed : [];
  const parts = [...brackets, ...dashedParts];
  const forms = [
    { form: name, left: '' },
    { form: outside, left: brackets.join(' ') },
    ...parts.map((part, i) => ({
      form: part,
      left: [...(dashedParts.length ? [] : [outside]), ...parts.filter((_, j) => j !== i)].join(' '),
      part: i < brackets.length ? ('bracket' as const) : ('dashed' as const),
    })),
  ];
  const seen = new Set<string>();
  return forms.filter(({ form }) => /\p{L}/u.test(form) && !seen.has(form) && seen.add(form));
}

/**
 * The tests each form of the name finds, each at its best score, best
 * first. A part of the name some tests carry says which test it is: a test
 * without it is found by the whole name only ("Vitamina D (25-OH)" is not
 * "Vitamin D+Metabolites", although "Vitamina D" is its name). A bracket
 * or dashed part alone finds only the tests it is a name of: one it only
 * shares words with is a qualifier of the rest ("C3 attivatore
 * (complemento)" is not every complement protein).
 */
function findByForms(catalog: Catalog, name: string, scope: Scope): Found[] {
  const isFit = (score: number): boolean => score >= MATCH_SCORE - SCORE_EPSILON;
  const best = new Map<string, Found>();
  // Tests found only by a form leaving out words that name no test, and those a form reading more fits
  const unread = new Set<string>();
  const fitByMore = new Set<string>();
  const keep = (found: Found, score: number, isUnread: boolean): void => {
    const known = best.get(found.test.code);
    if (!isUnread && isFit(score)) fitByMore.add(found.test.code);
    if (known && known.score >= score) return;
    best.set(found.test.code, { ...found, score });
    if (isUnread) unread.add(found.test.code);
    else unread.delete(found.test.code);
  };
  const readings = readingsOf(name);
  // The whole name, brackets read, fits a test or a panel: then what a bracket says may matter
  const wholeFits = readings.some((reading) =>
    catalog
      .scoredSearch(reading, { systems: [...new Set(scope.systems.map((system) => (system === DAY_URINE ? 'Urine' : system)))] })
      .some(({ test, score }) => isFit(score) && (scope.properties.length === 0 || scope.properties.includes(test.property)))
  );
  for (const { form, left, part } of readings.flatMap(nameForms)) {
    // Searched only once a test is found that the rest may rule out
    let carriers: Map<string, number> | undefined;
    let tellsApart: boolean | undefined;
    const formFound = findTests(catalog, form, scope);
    // How well the rest fits the tests the form fits best: of the tests a bracket names, those the rest fits less are not meant
    let restBest: number | undefined;
    const bestByRest = (): number =>
      Math.max(-1, ...formFound.filter(({ score }) => isFit(score)).map(({ test }) => carriers?.get(test.code) ?? -1));
    for (const found of formFound) {
      if (part && !isFit(found.score)) continue;
      if (left) carriers ??= new Map(findTests(catalog, left, scope).map(({ test, score }) => [test.code, score]));
      const byRest = carriers?.get(found.test.code);
      const restNames = byRest !== undefined && isFit(byRest);
      // The rest of the name fits another test well: "Troponina I (hs)" is not troponin T hs
      const restNamesOther = !restNames && [...(carriers?.values() ?? [])].some(isFit);
      // A dashed part that tells none of the tests the rest fits from another: it says only how the test is used
      // ("Rapporto albumina/creatinina - screening") or names the test again ("Ferro - sideremia"), else it says
      // what the catalog cannot read (a fluid, a time: "Glucosio - liquor", "Cortisolo - ore 8"), and the rest
      // alone is no full fit. "Bilirubina - diretta" and "Cortisolo - salivare" tell tests apart.
      if (part === 'dashed' && !restNames && !restNamesOther && !(tellsApart ??= partTellsApart(catalog, form, left))) {
        const saysNothing = saysOnlyUse(left) || namesTestAgain(found.test, left);
        keep(found, saysNothing ? found.score : Math.min(found.score, MATCH_SCORE - MATCH_MARGIN), false);
        continue;
      }
      if (carriers?.size && byRest === undefined) continue;
      if (part === 'dashed' || (part === 'bracket' && found.score < 1 && carriers?.size)) {
        // Another name of the test the rest names too ("Creatina chinasi - CK", "eGFR (CKD-EPI)")
        if (!restNames) continue;
        keep(found, Math.min(found.score, byRest), false);
      } else if (part === 'bracket' && restNamesOther) {
        continue;
      } else if (part === 'bracket' && byRest !== undefined && byRest < (restBest ??= bestByRest()) - SCORE_EPSILON) {
        // "AA Saccaromyces cer. IgA (ASCA)": ASCA names the yeast antibodies of every class, the rest the IgA one
        continue;
      } else {
        keep(found, found.score, carriers?.size === 0 && !part);
      }
    }
  }
  // Words left out that name no test say nothing of it, but set it above no test the name fits
  // when they are read: "Bilirubina (diretta)" is direct bilirubin as well as total bilirubin
  if (wholeFits || [...fitByMore].some((code) => !unread.has(code))) {
    for (const code of unread) {
      const found = best.get(code)!;
      if (!fitByMore.has(code)) best.set(code, { ...found, score: Math.min(found.score, MATCH_SCORE) });
    }
  }
  // Equal scores in equally likely samples go to the more common test
  return [...best.values()].sort(
    (a, b) => b.score - a.score || a.preference - b.preference || byRank(a.test, b.test)
  );
}

/**
 * Italian words for a method, as LOINC's methods name it: "Ematocrito
 * (calcolato)" is hematocrit by calculation, "eGFR (cistatina C)" a
 * cystatin C-based formula. Keyed by the word without its final vowel.
 */
const METHOD_READINGS: Readonly<Record<string, string>> = {
  calcolat: 'calculated',
  cistatin: 'cystatin',
  derivat: 'derived',
  dirett: 'direct',
};

/** The words of a text as lookups read them: "Creatinine-based formula (CKD-EPI 2021)" is creatinine, based, formula, ckd, epi, 2021 */
function wordsIn(text: string): string[] {
  return nameKey(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** A word as a method would say it: its LOINC reading if it is an Italian one (see METHOD_READINGS) */
function methodReading(word: string): string {
  return METHOD_READINGS[word.replace(/[aeio]$/, '')] ?? word;
}

/**
 * Whether a part of a name tells some of the tests the rest fits, of any
 * sample, from the others: one of its words, or its method reading, is in
 * the names of some ("diretta" of direct bilirubin, "salivare" of cortisol
 * in saliva, "HPLC")
 */
function partTellsApart(catalog: Catalog, rest: string, part: string): boolean {
  const words = wordsIn(part).filter((word) => !isStopWord(word) && /\p{L}/u.test(word));
  const readings = words.map(methodReading);
  return catalog
    .scoredSearch(rest)
    .filter(({ score }) => score >= MATCH_SCORE - SCORE_EPSILON)
    .some(({ test }) =>
      [test.name, test.method, ...test.names].some((testName) =>
        wordsIn(testName).some((other) => readings.includes(other) || words.some((word) => isNearForm(word, other)))
      )
    );
}

/**
 * Words saying only why or when a test is done, never which test: a
 * screening, a check-up. Short on purpose: any other word a dashed part
 * holds may name a sample, a time or a test the catalog cannot read.
 */
const USAGE_WORDS: ReadonlySet<string> = new Set(['screening', 'controllo', 'monitoraggio']);

/** Whether a part of a name says only how its test is used (see USAGE_WORDS) */
function saysOnlyUse(part: string): boolean {
  return wordsIn(part).every((word) => isStopWord(word) || USAGE_WORDS.has(word));
}

/**
 * Whether every telling word of a part of a name is a word of the test's
 * own names, LOINC's or HemoIO's: the part is another name of that test
 * ("ALT - GPT", "Glucosio - glicemia"), not a sample or a time it lacks
 */
function namesTestAgain(test: CatalogTest, part: string): boolean {
  const words = wordsIn(part).filter((word) => !isStopWord(word));
  const own = new Set([test.name, ...test.names].flatMap(wordsIn));
  return words.length > 0 && words.every((word) => own.has(word));
}

/** A year a formula is named by: "CKD-EPI 2021" */
const YEAR = /^(?:19|20)\d\d$/;

/** The parts of a printed name in brackets or set off by a spaced dash: "eGFR (CKD-EPI)", "Rapporto albumina/creatinina - screening" */
function namePartsOf(name: string): string[] {
  const brackets = [...name.matchAll(/\(([^()]*)\)/g)].map(([, inner]) => inner.trim());
  const dashed = squeeze(name.replace(/\([^()]*\)/g, ' ')).split(/\s+-\s+/);
  return [...brackets, ...(dashed.length > 1 ? dashed : [])].filter((part) => /\p{L}/u.test(part));
}

/**
 * The tests found, as the words of the name's brackets and dashed parts
 * say. A word naming the method of some of the tests that fit ("HPLC",
 * "MDRD", "CKD-EPI", "calcolato") narrows them to those, words naming no
 * test (a brand, "Tosoh") aside; of those, the one HemoIO describes, else
 * the ones whose method says least the name does not ("by MDRD" before
 * "by MDRD among black population"). An Italian method word none of the
 * tests that fit has reads as their variants by that method (see
 * variantsBy). A year rules out a formula of another year ("CKD-EPI 2009"
 * is not the 2021 one). A word read neither way may name a method LOINC
 * has no test for, when the tests that fit all name a method and either
 * are estimates by different formulas or none has the method the word
 * names: then no test fits fully, and the value is asked. A filtration rate
 * by a formula LOINC lacks, or of creatinine and cystatin C together, is
 * read as readEstimate says. A brand or a technique of a measured value
 * says nothing ("Fibrinogeno (Clauss)").
 */
function readParts(catalog: Catalog, name: string, found: Found[]): Found[] {
  const estimate = readEstimate(catalog, name, found);
  if (estimate) return estimate;
  let result = found;
  for (const part of namePartsOf(name)) {
    // The tests that fit about as well as the best: a name equal to the printed one sets aside those only sharing its words
    const least = Math.max(MATCH_SCORE - SCORE_EPSILON, ...result.map(({ score }) => score - MATCH_MARGIN + SCORE_EPSILON));
    let fitting = result.filter(({ score }) => score >= least);
    if (fitting.length === 0) break;
    const words = wordsIn(part).filter((word) => !isStopWord(word));
    // A method the name says in Italian that no test fitting has: those tests by that method, when LOINC has them
    const unmet = words
      .filter((word) => isMethodWord(word))
      .map(methodReading)
      .filter((reading) => !fitting.some(({ test }) => wordsIn(test.method).includes(reading)));
    if (unmet.length > 0) {
      const variants = fitting.flatMap((one) => variantsBy(catalog, one, unmet)).filter(
        (variant, i, all) => !result.some(({ test }) => test === variant.test) && all.findIndex(({ test }) => test === variant.test) === i
      );
      result = [...variants, ...result];
      fitting = [...variants, ...fitting];
    }
    const methodOf = new Map(fitting.map(({ test }) => [test, new Set(wordsIn(test.method))]));
    const read = new Set<string>();
    let narrowed = fitting;
    for (const word of words.filter((one) => YEAR.test(one))) {
      const ofYear = narrowed.filter(({ test }) => ![...methodOf.get(test)!].some((other) => YEAR.test(other) && other !== word));
      if (ofYear.length < narrowed.length || ofYear.some(({ test }) => methodOf.get(test)!.has(word))) read.add(word);
      narrowed = ofYear;
    }
    const methodWords = words.filter((word) => fitting.some(({ test }) => methodOf.get(test)!.has(methodReading(word))));
    narrowed = narrowed.filter(({ test }) => methodWords.every((word) => methodOf.get(test)!.has(methodReading(word))));
    for (const word of methodWords) read.add(word);
    if (narrowed.length > 0 && narrowed.length < fitting.length) {
      const described = narrowed.filter(({ test }) => TEST_ADDONS[test.code]);
      const saidBy = new Set(words.map(methodReading));
      const unsaid = ({ test }: Found): number => [...methodOf.get(test)!].filter((word) => !saidBy.has(word)).length;
      const fewest = Math.min(...narrowed.map(unsaid));
      const kept = described.length ? described : narrowed.filter((one) => unsaid(one) === fewest);
      result = result.filter((one) => !fitting.includes(one) || kept.includes(one));
    }
    const still = result.filter((one) => fitting.includes(one));
    // A word no test that still fits has in its names: a brand, a standard, or a method LOINC lacks
    const isNamed = (word: string): boolean =>
      still.some(({ test }) =>
        [test.name, ...test.names].some((testName) => wordsIn(testName).some((other) => isNearForm(word, other)))
      );
    const unread = words.filter((word) => !read.has(word) && /\p{L}/u.test(word) && !isNamed(word));
    const methods = new Set(still.map(({ test }) => test.method));
    // An estimate by formulas: one LOINC lacks is none of them. A measured value's brand or technique says nothing ("Fibrinogeno (Clauss)")
    const byFormulas = methods.size > 1 && [...methods].some((method) => method === CALCULATED || namesFormula(method));
    const mayNameMethod = unread.length > 0 && !methods.has('') && (unread.some(isMethodWord) || byFormulas);
    if (mayNameMethod) {
      const cap = MATCH_SCORE - MATCH_MARGIN;
      return result.map((one) => (one.score > cap ? { ...one, score: cap } : one));
    }
  }
  return result;
}

/**
 * Estimating formulas LOINC has no test for, by the words naming them, each
 * the formula it names: the European Kidney Function Consortium's, the
 * Berlin Initiative Study's (BIS1 of creatinine, BIS2 with cystatin C, two
 * formulas), the bedside Schwartz, the full age spectrum, CAPA (of cystatin
 * C alone) and Lund-Malmö. Words as wordsIn reads them: "Malmö" is "malmo".
 */
const UNLISTED_FORMULAS: Readonly<Record<string, string>> = {
  ekfc: 'ekfc',
  bis: 'bis',
  bis1: 'bis1',
  bis2: 'bis2',
  schwartz: 'schwartz',
  fas: 'fas',
  capa: 'capa',
  lmr: 'lmr',
  lund: 'lmr',
  malmo: 'lmr',
  malmoe: 'lmr',
};

function isUnlistedFormula(word: string): boolean {
  return Object.hasOwn(UNLISTED_FORMULAS, word);
}

/** Formulas LOINC lacks that always read creatinine */
const CREATININE_FORMULAS = new Set(['bis', 'bis1', 'bis2', 'lmr']);

/** A filtration rate's name word saying creatinine: "creatinina", "SCr", "Krea", "eGFRcr" */
const CREATININE_WORD = /^(?:s?cr|cre|crea|creat\p{L}*|krea\p{L}*|kreat\p{L}*|egfrcr)$/u;

/** A filtration rate's name word saying cystatin C: "cistatina", "cist.", "Cis C", "CysC", "eGFRcys" */
const CYSTATIN_WORD = /^(?:cys|cysc|cyst|cystc|cis|cisc|cist|cistat|cistatin\p{L}*|cystatin\p{L}*|egfrcys)$/u;

/** A filtration rate's name word saying both: "eGFRcrcys" */
const BOTH_BASES_WORD = /^egfrcr-?cys$/u;

/** A name of a glomerular filtration rate: "eGFR", "eGFRcr", "GFR stimato", "Filtrato glomerulare", "eVFG", "Glomerulär filtration" */
const GFR_NAME = /\b(?:e?gfr\p{L}*|e?vfg|filtra(?:to|zione)\s+glomerulare|glomerul\p{L}*\s+filtra\p{L}*)\b/u;

/** Whether a printed name is a glomerular filtration rate's, however its accents are stored */
function isGfrName(name: string): boolean {
  return GFR_NAME.test(nameKey(name));
}

/**
 * Words of a filtration rate's name that say only that it is one, or join
 * its words: "eGFR", "e-GFR", "Velocità di filtrazione glomerulare stimata",
 * "formula", "creatinina e cistatina C"
 */
const GFR_WORDS = new Set([
  'e',
  'egfr',
  'gfr',
  'vfg',
  'evfg',
  'velocita',
  'rate',
  'filtrato',
  'filtrazione',
  'filtration',
  'filtrationsrate',
  'glomerulare',
  'glomerular',
  'glomerulaere',
  'stimato',
  'stimata',
  'stima',
  'calcolato',
  'calcolata',
  'estimated',
  'formula',
  'di',
  'del',
  'della',
  'and',
  'based',
  'baserat',
  'basiert',
  'och',
  'und',
  'con',
  'with',
]);

/**
 * A word of a filtration rate's name as what it says: a formula however
 * spelled ("lund" is "lmr"), a basis however spelled ("SCr" is
 * "creatinine"), or the word itself; nothing for one saying only that it is
 * a filtration rate or joining its words ("by", "-based"), for the "C" of
 * cystatin C, and for a number that is no year (a footnote's "[1]")
 */
function gfrWordSays(word: string, saysCystatin: boolean): string[] {
  if (GFR_WORDS.has(word) || isStopWord(word) || (saysCystatin && word === 'c')) return [];
  if (/^\d+$/.test(word) && !YEAR.test(word)) return [];
  if (BOTH_BASES_WORD.test(word)) return ['creatinine', 'cystatin'];
  if (CREATININE_WORD.test(word)) return ['creatinine'];
  if (CYSTATIN_WORD.test(word)) return ['cystatin'];
  return [UNLISTED_FORMULAS[word] ?? word];
}

/** What each word of a filtration rate's name says (see gfrWordSays): "BIS 1" and "BIS-1" are BIS1 */
function gfrSaid(name: string): string[] {
  const words = wordsIn(name).reduce<string[]>((joined, word) => {
    const last = joined.length - 1;
    if (joined[last] === 'bis' && /^[12]$/.test(word)) joined[last] = `bis${word}`;
    else joined.push(word);
    return joined;
  }, []);
  const saysCystatin = words.some((word) => CYSTATIN_WORD.test(word) || BOTH_BASES_WORD.test(word));
  return words.flatMap((word) => gfrWordSays(word, saysCystatin));
}

/**
 * What a filtration rate's printed name says beyond being one, if it is
 * one: its formula, basis and any other word ("eGFR (Lund-Malmö)" and
 * "eGFR - LMR" say "lmr"; a plain "eGFR" says nothing). Two estimates
 * saying different things are two measurements, however close: no estimate
 * is set aside unseen as another's duplicate.
 */
export function gfrQualifier(name: string): string | undefined {
  if (!isGfrName(name)) return undefined;
  return [...new Set(gfrSaid(name))].sort().join(' ');
}

/** Whether a method names a formula: "Creatinine-based formula (MDRD)" */
function namesFormula(method: string): boolean {
  return /\bformula\b/i.test(method);
}

/** LOINC's component of a glomerular filtration rate */
const GFR_COMPONENT = 'Glomerular filtration rate';

/** Whether a test is a glomerular filtration rate, an estimate of one formula or another */
export function isFiltrationRate(test: CatalogTest | undefined): boolean {
  return test?.component === GFR_COMPONENT;
}

/**
 * The tests found for a filtration rate by a formula LOINC lacks, or of
 * creatinine and cystatin C together (which LOINC's catalog here has no
 * test for), if the name is one: the estimate of cystatin C, by a formula
 * it does not name ("Cystatin C-based formula"), when the name says only
 * cystatin C ("eGFR (cistatina C) (EKFC)") or the formula is CAPA; else the
 * estimate of no formula ("based on 1.73 sq M": "eGFR (EKFC)", "eGFR -
 * Lund-Malmö 2021", "eGFR (creatinina e cistatina C)"). Taken without asking
 * when the name says nothing else (a year of the formula, a word that it is
 * an estimate); else asked, that test first ("eGFR (EKFC) (IDMS)").
 * Whatever its brackets' order.
 */
function readEstimate(catalog: Catalog, name: string, found: Found[]): Found[] | undefined {
  if (!isGfrName(name)) return undefined;
  const said = gfrSaid(name);
  const formulas = said.filter(isUnlistedFormula);
  const creatinine = said.includes('creatinine');
  const cystatin = said.includes('cystatin');
  if (formulas.length === 0 && !(creatinine && cystatin)) return undefined;
  const gfr = found
    .filter(({ test }) => test.component === GFR_COMPONENT)
    .reduce<Found | undefined>((best, one) => (!best || one.score > best.score ? one : best), undefined);
  if (!gfr) return undefined;
  // Read from the formulas named, whatever their order: CAPA alone is of cystatin C, one reading creatinine never
  const cystatinOnly =
    !creatinine &&
    !formulas.some((formula) => CREATININE_FORMULAS.has(formula)) &&
    (cystatin || (formulas.length > 0 && formulas.every((formula) => formula === 'capa')));
  const fits = (method: string): boolean =>
    cystatinOnly
      ? /^Cystatin C-based formula\b/i.test(method) && !method.includes('(')
      : method !== '' && !method.startsWith(CALCULATED) && !namesFormula(method);
  const estimates = [gfr, ...variantsBy(catalog, gfr, [])].filter(({ test }) => fits(test.method));
  if (estimates.length !== 1) return undefined;
  const others = found.filter(({ test }) => test !== estimates[0].test);
  const cap = MATCH_SCORE - MATCH_MARGIN;
  const saysMore = said.some(
    (word) => !isUnlistedFormula(word) && word !== 'creatinine' && word !== 'cystatin' && !YEAR.test(word)
  );
  // Asked, the estimate first: the others below it
  const below = saysMore ? cap - MATCH_MARGIN / 2 : cap;
  return [
    { ...estimates[0], score: saysMore ? cap : Math.max(estimates[0].score, MATCH_SCORE) },
    ...others.map((one) => (one.score > below ? { ...one, score: below } : one)),
  ];
}

/** Whether a word is an Italian one for a method (see METHOD_READINGS) */
function isMethodWord(word: string): boolean {
  return methodReading(word) !== word;
}

/**
 * The tests that are a found one by the methods read (its component,
 * property and sample, by a method naming them all), each fitting as that
 * one does: "Ematocrito (calcolato)" is hematocrit by calculation, which
 * HemoIO's "Ematocrito" of the automated count does not name
 */
function variantsBy(catalog: Catalog, { test, score, preference }: Found, readings: string[]): Found[] {
  return catalog
    .scoredSearch(test.component, { properties: [test.property], systems: [test.system] })
    .filter(({ test: other }) => {
      const method = wordsIn(other.method);
      return other.code !== test.code && other.component === test.component && readings.every((reading) => method.includes(reading));
    })
    .map(({ test: other }) => ({ test: other, score, preference }));
}

/** Whether two words are one in other forms: "ossea" and "osso", "salivare" and "saliva" */
function isNearForm(a: string, b: string): boolean {
  const [short, long] = [a.replace(/[aeio]$/, ''), b.replace(/[aeio]$/, '')].sort((x, y) => x.length - y.length);
  return a === b || (short.length >= 3 && long.length - short.length <= 2 && long.startsWith(short));
}

/** Whether a test is from a sample the matcher names, with 24-hour urine apart */
function fitsSystem(test: CatalogTest, system: string): boolean {
  if (system === DAY_URINE) return isDayUrine(test);
  if (system === 'Urine') return test.system === 'Urine' && !isDayUrine(test);
  return test.system === system;
}

/** A rank to compare: an unranked test (0) last */
function rankOf(rank: number): number {
  return rank || Number.POSITIVE_INFINITY;
}

/** The D-dimer units a test names in its component or method ("Fibrin D-dimer FEU", "Immunoassay.DDU") */
export function testDimerUnits(test: CatalogTest): DimerMarker | undefined {
  return dimerMarkerIn(`${test.component} ${test.method}`);
}

/** A test's component without the D-dimer units it may name ("Fibrin D-dimer FEU") */
function plainComponent(test: CatalogTest): string {
  return squeeze(test.component.replace(/\b(?:FEU|DDU)\b/gi, ' '));
}

/**
 * Whether two tests trend together, or are one measurement of one sample
 * by methods the name does not tell apart: one is the other with a method
 * or collection time named, or each names a way of measuring it (a strip
 * read by eye or by machine, D-dimer FEU by immunoassay). Values in other
 * units of it (D-dimer FEU and DDU), a calculated value and a measured
 * one, and two named methods of a property the method defines (see
 * METHOD_BOUND_PROPERTIES) mean different things, so they stay apart.
 */
function isSameFit(catalog: Catalog, a: CatalogTest, b: CatalogTest): boolean {
  if (catalog.trendGroup(a.code) === catalog.trendGroup(b.code)) return true;
  if (a.property !== b.property || a.system !== b.system) return false;
  if (a.component === b.component && (!a.method || !b.method)) return true;
  return (
    plainComponent(a) === plainComponent(b) &&
    testDimerUnits(a) === testDimerUnits(b) &&
    (a.method === CALCULATED) === (b.method === CALCULATED) &&
    !METHOD_BOUND_PROPERTIES.has(a.property)
  );
}

/**
 * Properties whose value the method itself defines, so two named methods
 * give different numbers: an enzyme's activity depends on the reaction
 * measured (LDH lactate to pyruvate or back), and a clotting time, or a
 * ratio of two, on what starts the clotting (a PT after heparin is
 * neutralised, ROTEM's EXTEM and INTEM)
 */
const METHOD_BOUND_PROPERTIES: ReadonlySet<string> = new Set(['CCnc', 'Time', 'RelTime']);

/** Serum, plasma, or a test of either: one kind of sample, to tell from blood or urine (with its sediment) */
const SERUM_OR_PLASMA: ReadonlySet<string> = new Set(['Ser', 'Ser/Plas', 'Plas', 'Ser/Plas/Bld', 'PPP']);

function sampleKind(system: string): string {
  if (SERUM_OR_PLASMA.has(system)) return 'Ser/Plas';
  if (system === 'RBC') return 'Bld';
  return URINE.includes(system) ? 'Urine' : system;
}

/** The rank of the most common test a code trends with */
function groupRank(catalog: Catalog, code: string): number {
  return Math.min(
    ...catalog.groupCodes(catalog.trendGroup(code)).map((member) => rankOf(catalog.test(member)?.rank ?? 0))
  );
}

/**
 * The test meant among rivals the name fits as well, if the name says no
 * more: of the likeliest sample, when a sample is named; else the one
 * HemoIO describes, if it describes only one (the tests it describes are
 * the usual ones); else one far more common than all others. Undefined
 * when none stands out. "Blood", said loosely, leaves the sample open
 * between blood and serum tests: a serum test is then never the one
 * meant, a blood test only when it stands out as well ("Platelet count"
 * said of blood is not a rare plasma count).
 */
function usualMeaning(catalog: Catalog, rivals: Found[], systems: string[], sample: SampleSaid): Found | undefined {
  const kindOf = ({ preference }: Found): string => sampleKind(systems[preference]);
  const likeliest = sampleKind(systems[Math.min(...rivals.map(({ preference }) => preference))]);
  const fits = sample === 'named' ? rivals.filter((rival) => kindOf(rival) === likeliest) : rivals;
  const meant = standingOut(catalog, fits);
  const isOpen = sample === 'loosely' && new Set(rivals.map(kindOf)).size > 1;
  return isOpen && meant && kindOf(meant) !== 'Bld' ? undefined : meant;
}

/** The one of the fits, the one HemoIO describes if only one, or one far more common than all others */
function standingOut(catalog: Catalog, fits: Found[]): Found | undefined {
  if (fits.length === 1) return fits[0];

  const described = fits.filter(({ test }) => getAddon(catalog, test.code));
  if (described.length === 1) return described[0];

  const [first, second] = fits
    .map((found) => ({ found, rank: groupRank(catalog, found.test.code) }))
    .sort((a, b) => a.rank - b.rank);
  // An unranked test is common to no one
  return Number.isFinite(first.rank) && first.rank * RANK_DOMINANCE <= second.rank ? first.found : undefined;
}

/**
 * A name's serum, plasma or blood words read as its sample, as a prefix
 * is: "Glucosio sangue" is glucose said of blood. Blood is said loosely
 * of serum tests too, so a blood word alone leaves the sample open.
 */
function sampleInName(name: string): { name: string; systems: string[]; loosely: boolean } | undefined {
  const words = name.match(SAMPLE_WORDS)?.join(' ') ?? '';
  const [pattern, systems] = SAMPLE_HINTS.find(([sampleWords]) => sampleWords.test(words)) ?? [];
  if (!systems) return undefined;
  const rest = name
    .replace(SAMPLE_WORDS, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '')
    .trim();
  return rest ? { name: rest, systems, loosely: pattern === BLOOD_HINT || pattern === BLOOD_COUNT_HINT } : undefined;
}

function toCandidate(test: CatalogTest, score: number): Candidate {
  return { code: test.code, name: test.name, score };
}

/** Whether a UCUM unit is per day: a 24-hour collection's ("mg/(24.h)", "mmol/d") */
function isPerDay(ucum: string | null): boolean {
  return ucum !== null && /\/\(?(?:24\.h|d)\)?$/.test(ucum);
}

/** Whether samples are urine, of a spot or a 24-hour collection */
function isUrine(systems: string[] | undefined): boolean {
  return systems !== undefined && systems.some((system) => system === DAY_URINE || URINE.includes(system));
}

/** The kind of sample a matcher system is, with 24-hour urine as urine */
function systemKind(system: string): string {
  return system === DAY_URINE ? 'Urine' : sampleKind(system);
}

/**
 * Where a value's test is looked for: the samples its name says (a
 * prefix, urine words or serum words), else its specimen hint (a urine
 * sediment one narrowing urine to its sediment), else serum, plasma or
 * blood; and whether that sample is said, or only loosely by "blood". A day's unit ("mg/24h") says its urine was
 * collected over 24 hours, as does the AI's "24h urine".
 */
function sampleOf(
  split: { systems?: string[] },
  worded: { systems: string[]; loosely: boolean } | undefined,
  hint: string | undefined,
  perDay: boolean
): { systems: string[]; sample: SampleSaid } {
  const hinted = hint ? hintSystems(hint) : undefined;
  let said = split.systems ?? worded?.systems;
  if (isUrine(said) && hinted?.includes(DAY_URINE)) said = [DAY_URINE];
  // A urine sediment section puts what a microscope sees in its fields before the urine a name says
  if (hinted?.[0] === URINE_SEDIMENT && said?.every((system) => URINE.includes(system))) said = hinted;
  let systems = said ?? hinted;
  if (perDay && (systems === undefined || isUrine(systems))) systems = [DAY_URINE];
  if (systems === undefined) return { systems: DEFAULT_SYSTEMS, sample: 'none' };
  const loosely = said === undefined ? BLOOD_HINT.test(hint ?? '') : !split.systems && worded?.loosely === true;
  return { systems, sample: loosely ? 'loosely' : 'named' };
}

/**
 * Whether LOINC names a test's component with an adjustment ("Hemoglobin
 * A1c/Hemoglobin.total^^standardized per IFCC-RMP for CDT"): a variant of
 * the plain test, which a printed name means unless it says more
 */
function isAdjusted(test: CatalogTest): boolean {
  return test.component.includes('^^');
}

/**
 * Whether LOINC names a test's component with a challenge or a collection
 * time ("Cortisol^1H post 250 ug corticotropin", "Insulin^post CFst",
 * "Gastrin^1st specimen"): the plain test taken at that time
 */
function isChallenged(test: CatalogTest): boolean {
  return test.component.split('^^')[0].includes('^');
}

/**
 * The tests found, without those LOINC names with a challenge or a time
 * that fit no better than a test without one: a name that does not say the
 * challenge means the plain test ("Calcitonina" is not its "--1st specimen
 * post XXX challenge" variant, "ACTH" not cortisol "--post 250 ug
 * corticotropin")
 */
function withoutUnsaidChallenges(found: Found[]): Found[] {
  const plainBest = Math.max(-1, ...found.filter(({ test }) => !isChallenged(test)).map(({ score }) => score));
  return found.filter(({ test, score }) => !isChallenged(test) || score > plainBest + SCORE_EPSILON);
}

/** A lupus anticoagulant test, by its component or method: a clotting time made lupus sensitive, or compared with one in excess phospholipid */
const LUPUS_TEST = /\blupus\b|\bexcess phospholipid\b/i;
/** Words of a printed name saying it is a lupus anticoagulant test: "LA", "lupus", "screening", "conferma", "dRVVT" */
const LUPUS_WORDS = /\b(?:la|lac|lupus|lupic[oaie]|screen(?:ing)?|confirm(?:ation|atory)?|conferma|drvvt)\b/i;

/**
 * The tests found, with a lupus anticoagulant test set below a full fit
 * unless the name says it is one: "aPTT" in "ratio" is the aPTT over a
 * normal one, never the lupus screen-to-confirm ratio, unasked
 */
function withoutUnsaidLupus(found: Found[], name: string): Found[] {
  if (LUPUS_WORDS.test(name)) return found;
  const cap = MATCH_SCORE - MATCH_MARGIN;
  return found
    .map((one) => (LUPUS_TEST.test(`${one.test.component} ${one.test.method}`) && one.score > cap ? { ...one, score: cap } : one))
    .sort((a, b) => b.score - a.score || a.preference - b.preference || byRank(a.test, b.test));
}

/** LOINC's method of a value calculated from other tests ("Cholesterol in LDL ... by calculation") */
const CALCULATED = 'Calculated';

/**
 * Whether the test meant is calculated from other tests, and a variant
 * measuring it that trends apart fits the name as well and is about as
 * common: then the name may mean either ("Colesterolo LDL" calculated or
 * by direct assay, which differ in what they are). LOINC's names do not
 * have the Italian "calcolato": a bracket saying it is read as a method
 * (see readParts), but a name saying it otherwise is asked too, and the
 * choice is learned. Counts by machine or by hand, or strips read by eye
 * or by machine, measure one thing alike.
 */
function mayBeMeasured(catalog: Catalog, meant: Found, variants: Found[]): boolean {
  if (meant.test.method !== CALCULATED) return false;
  const trend = catalog.trendGroup(meant.test.code);
  const rank = groupRank(catalog, meant.test.code);
  return variants.some(
    ({ test, score }) =>
      test.method !== '' &&
      test.method !== CALCULATED &&
      score >= meant.score - SCORE_EPSILON &&
      catalog.trendGroup(test.code) !== trend &&
      groupRank(catalog, test.code) < rank * RANK_DOMINANCE
  );
}

/** Most blood tests offered beside a serum test said loosely of blood */
const MAX_BLOOD_CANDIDATES = 2;

/**
 * Blood tests of a serum test's component, in any unit, that trend apart
 * from it: a value said of blood may be one of them ("Etanolo ematico" in
 * g/L is the blood alcohol LOINC gives in mmol/L, not the serum one)
 */
function bloodTestsApart(catalog: Catalog, name: string, test: CatalogTest, ucum: string | null): Candidate[] {
  const trend = catalog.trendGroup(test.code);
  return findByForms(catalog, name, { systems: ['Bld'], properties: [], ucum })
    .filter(
      ({ test: blood }) =>
        blood.component === test.component && blood.scale === test.scale && catalog.trendGroup(blood.code) !== trend
    )
    .slice(0, MAX_BLOOD_CANDIDATES)
    .map((found) => toCandidate(found.test, found.score));
}

/** Whether the most common test a code trends with is among LOINC's common ones */
export function isCommon(catalog: Catalog, code: string): boolean {
  return groupRank(catalog, code) <= COMMON_RANK;
}

/**
 * The most common tests of the unit's properties and the samples, those
 * with a name word starting as one of the printed name's first: a name
 * LOINC does not have may still be near one ("Fosforo" of "fosfato")
 */
function commonTests(catalog: Catalog, name: string, properties: string[], systems: string[]): CatalogTest[] {
  if (properties.length === 0) return [];
  const pool = catalog
    .common({ properties, systems: [...new Set(systems.map((system) => (system === DAY_URINE ? 'Urine' : system)))] }, COMMON_POOL)
    .filter((test) => systems.some((system) => fitsSystem(test, system)));
  const stems = new Set(
    nameKey(name)
      .split(/[^\p{L}]+/u)
      .filter((word) => word.length >= NEAR_STEM)
      .map((word) => word.slice(0, NEAR_STEM))
  );
  const isNear = (test: CatalogTest): boolean =>
    [...test.names, nameKey(test.name)].some((testName) =>
      testName.split(/[^\p{L}]+/u).some((word) => word.length >= NEAR_STEM && stems.has(word.slice(0, NEAR_STEM)))
    );
  const near = pool.filter(isNear);
  return [...near, ...pool.filter((test) => !near.includes(test))].slice(0, MAX_CANDIDATES);
}

/**
 * The LOINC properties of results given with no unit: a presence or a
 * reading on a scale (a dipstick's "negative", "++"), an identity or kind
 * (a blood group, a colour), an interpretation, and pH and specific
 * gravity, which have no unit. A value printed with no unit is one of
 * these, never a quantity a unit would tell apart (Mass/volume or
 * Moles/volume).
 */
const NO_UNIT_PROPERTIES = ['PrThr', 'Arb', 'Prid', 'Type', 'Imp', 'Aper', 'Color', 'LsCnc', 'SpGrav'];

/**
 * The tests found that give their value in the D-dimer units printed (FEU
 * or DDU), when any does: never one in the other units
 */
function inUnits(found: Found[], units: DimerMarker | undefined): Found[] {
  if (!units) return found;
  const named = found.filter(({ test }) => testDimerUnits(test) === units);
  return named.length ? named : found.filter(({ test }) => testDimerUnits(test) === undefined);
}

/** A method of counting what a microscope field shows: "Microscopy high power field" ("Microscopy.light.HPF") */
const FIELD_METHOD = /\b[HL]PF\b/;

/** Methods counting what a high- or low-power field shows ("Microscopy.light.HPF"); "per campo" and "/HPF" mean a high-power one */
const HIGH_POWER = /\bHPF\b/;
const LOW_POWER = /\bLPF\b/;

/**
 * The tests found that count as the unit does, when any does: a count per
 * microscope field ("per campo", "/HPF", "/LPF") is one of the tests counted
 * per field (#/area) of that power, and a count per volume ("/µL") one of the urine's, which
 * a machine counts, not of its sediment, which a microscope's field shows.
 * The two give other numbers, as do counts per high- and low-power field.
 */
function countedAsPrinted(found: Found[], ucum: string | null): Found[] {
  if (ucum === null) return found;
  const perField = ucum.includes('[HPF]') || ucum.includes('[LPF]');
  if (!perField && !ucumProperties(ucum).includes('NCnc')) return found;
  const isField = (test: CatalogTest): boolean => test.system === URINE_SEDIMENT || FIELD_METHOD.test(test.method);
  const counted = found.filter(({ test }) =>
    perField ? test.property === 'Naric' : test.property !== 'NCnc' || !isField(test)
  );
  if (!counted.length) return found;
  if (!perField) return counted;
  // A high-power field shows less than a low-power one: a count per one is not of the other, though maybe a misprint
  const [power, otherPower] = ucum.includes('[LPF]') ? [LOW_POWER, HIGH_POWER] : [HIGH_POWER, LOW_POWER];
  const ofPower = counted.filter(({ test }) => !otherPower.test(test.method));
  const cap = MATCH_SCORE - MATCH_MARGIN;
  if (!ofPower.length) return counted.map((one) => ({ ...one, score: Math.min(one.score, cap) }));
  // Of the best fits, the ones counted per field of the printed power
  const best = Math.max(...ofPower.map(({ score }) => score));
  const isBest = ({ score }: Found): boolean => score >= best - SCORE_EPSILON;
  const byPower = ofPower.filter((one) => isBest(one) && power.test(one.test.method));
  return byPower.length ? ofPower.filter((one) => !isBest(one) || byPower.includes(one)) : ofPower;
}

/**
 * The tests found as candidates are listed: among those that fit as well
 * and are as likely of the sample, the one HemoIO describes first (the
 * eGFR it describes before older formulas LOINC ranks higher)
 */
function describedFirst(found: Found[]): Found[] {
  const described = (one: Found): number => Number(TEST_ADDONS[one.test.code] !== undefined);
  // The search's order otherwise: by score, then sample, then rank (kept, as the sort is stable)
  return [...found].sort((a, b) => b.score - a.score || a.preference - b.preference || described(b) - described(a));
}

/** A printed unit's UCUM reading, and the D-dimer units it names ("µg/L FEU": a mass per volume, in FEU) */
interface ReadUnit {
  ucum: string | null;
  units?: DimerMarker;
}

function readUnit(printed: string): ReadUnit {
  const { unit, marker } = readUnitMarker(printed);
  return { ucum: unit ? toUcum(unit) : null, units: marker };
}

/**
 * The LOINC test a printed value is, if one clearly fits, and the best
 * candidates. A code learned for this wording and unit wins, unless the
 * value's sample is said to be another. Otherwise the name is searched
 * among tests of its sample (see sampleOf) and of the properties its unit
 * implies. A test is taken when its name fits best by a margin, or when
 * the tests that fit as well differ in what the name does not say and one
 * is the usual meaning; a test LOINC does not count among its common ones
 * only when the name is one of its own and fits nothing else as well, and
 * one LOINC names with an adjustment (see isAdjusted) never. A value
 * whose unit cannot be read is never matched, as nothing tells its tests
 * apart. A value with no unit is matched only as matchUnitless says.
 * When no name of a common test is the
 * printed one, the most common tests of the sample and unit are candidates
 * too: the AI or the user may know a wording LOINC does not ("Glicemia").
 */
export function matchLocally(
  fullCatalog: Catalog,
  printed: PrintedValue,
  learned?: (key: string) => string | undefined
): LocalMatch {
  const catalog = withSearchesKept(fullCatalog);
  const value = { ...printed, name: foldDashes(printed.name) };
  const unit = readUnit(value.unit);
  const matchWith = (searched: Catalog, learnedTests: typeof learned): LocalMatch =>
    value.unit.trim() === ''
      ? matchUnitless(searched, value, unit, learnedTests)
      : matchIn(searched, value, unit, unit.ucum ? unitProperties(unit.ucum, value.name) : [], learnedTests);
  const kept = firstLookedAmong(value);
  if (!kept) return matchWith(catalog, learned);
  // First among the tests its printing narrows to (a learned test is learned for the printing too); else the name's own
  // tests, of any kind, after those
  const narrowed = matchWith(withTestsKept(catalog, kept), learned);
  if (narrowed.status === 'match' || narrowed.candidates.some(({ score }) => score >= MATCH_SCORE - SCORE_EPSILON)) return narrowed;
  const any = matchWith(catalog, learned);
  if (any.status === 'match') return any;
  // By how well they fit, each as well as either search found it: the name's own tests ("NT-proBNP") before a word test
  // of another, a word test first of those that fit as well
  const candidates = bestBy([...narrowed.candidates, ...any.candidates], ({ code }) => code)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
  return { status: candidates.length ? 'ambiguous' : 'none', candidates };
}

/** A plain ratio as UCUM writes it: "ratio" is 1, "{ratio}" an annotation */
export const PLAIN_RATIO = /^(?:1|\{ratio\})$/i;

/**
 * Words of a printed name naming a clotting time: "PT", "aPTT", "TT",
 * "INR", "Protrombina", "Tempo di trombina", "Quick". "Antitrombina" and
 * "Fattore VIII" name none.
 */
const CLOTTING_TIME_WORDS =
  /\b(?:a?ptt?|tt|inr|quick|tempo|time|drvvt|protrombin\w*|prothrombin\w*|trombin\w*|thrombin\w*|tromboplastin\w*|thromboplastin\w*|cefalin\w*|coagul\w*|clotting)\b/i;

/** The properties of a ratio said of a printed name: a clotting time over a normal one (RelTime) only when it names one, instead of a time ratio */
function ratioProperties(properties: readonly string[], name: string): string[] {
  // A clotting time's plain ratio is it over a normal one, not a time ratio after an addition ("aPTT -- after protein C activator")
  return CLOTTING_TIME_WORDS.test(name) ? [...properties.filter((property) => property !== 'TRto'), 'RelTime'] : [...properties];
}

/** LOINC's ratios of like quantities, which a plain ratio may be: of masses (cholesterol/HDL), amounts, numbers, volumes or times */
export const RATIO_KINDS: readonly string[] = ['Ratio', 'MRto', 'SRto', 'NRto', 'VRto', 'TRto'];

/**
 * The LOINC properties a printed unit reads as (see ucumProperties). A
 * plain ratio of a name naming a clotting time is also that time over a
 * normal one (RelTime): "aPTT" in "ratio" is LOINC's aPTT actual/normal,
 * but "Fattore VIII" in "ratio" is no clotting time.
 */
function unitProperties(ucum: string, name: string): string[] {
  const properties = ucumProperties(ucum);
  return PLAIN_RATIO.test(ucum) ? ratioProperties([...new Set([...properties, ...RATIO_KINDS])], name) : properties;
}

/** A clotting time over a normal one, or the INR, as LOINC names its component; a factor's or a protein's activity over a normal one is another */
const CLOTTING_TIME_COMPONENT = /^Coagulation(?: actual\/normal| normal\/actual)?$/i;
/** A clotting time over a normal one turned around: "Coagulation normal/actual" */
const INVERSE_RATIO = /\bnormal\/actual\b/i;
/** Words of a printed name saying it is an activity: "Attività protrombinica", "Fattore II" */
const ACTIVITY_WORDS = /\b(?:attivit\w*|activity|fattore|factor)\b/i;
/** LOINC's method of the prothrombin time (PT) */
const PT_METHOD = 'Coag.tissue factor induced';

/**
 * The tests found of a name naming a clotting time in a ratio (see
 * ratioProperties), read as that time over a normal one. A factor's or a
 * protein's activity over a normal one is set below a full fit: it is no
 * clotting time, so never the one meant unasked. Italian reports call
 * the PT "Protrombina": a name saying it, and no activity, is the PT
 * over a normal one ("Protrombina ratio") as well as it fits prothrombin's
 * activity (factor II). A ratio of the patient's time over the normal one
 * is listed before the same turned around.
 */
function asClottingTimes(catalog: Catalog, found: Found[], name: string): Found[] {
  const cap = MATCH_SCORE - MATCH_MARGIN;
  const isActivity = (test: CatalogTest): boolean => test.property === 'RelTime' && !CLOTTING_TIME_COMPONENT.test(test.component);
  const ofProthrombin = ACTIVITY_WORDS.test(name)
    ? []
    : found.filter(({ test }) => isActivity(test) && /^Prothrombin\b/i.test(test.component));
  const prothrombinTimes = ofProthrombin.flatMap(({ test, score, preference }) =>
    catalog
      .scoredSearch('prothrombin time', { properties: ['RelTime'], systems: [test.system] })
      .filter(({ test: other }) => other.method === PT_METHOD && CLOTTING_TIME_COMPONENT.test(other.component))
      .map(({ test: other }) => ({ test: other, score, preference }))
  );
  const all = [...found, ...prothrombinTimes];
  return bestBy(all, ({ test }) => test)
    .map((one) => (isActivity(one.test) && one.score > cap ? { ...one, score: cap } : one))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.preference - b.preference ||
        Number(INVERSE_RATIO.test(a.test.component)) - Number(INVERSE_RATIO.test(b.test.component)) ||
        byRank(a.test, b.test)
    );
}

/**
 * The match of a value printed with no unit. Its unit may be missing, so
 * the tests its name fits are weighed whatever their unit: it is taken to
 * be a test that has none (see NO_UNIT_PROPERTIES) only when its sample is
 * named, that test's name is the printed one, and no test of the sample
 * measured in a unit (a quantitative one, not a strip's semi-quantitative
 * reading) fits the name as well, unless it is far rarer: "pH" or
 * "Nitriti" of urine, but not "Albumina", nor "pH" of no sample said.
 * Otherwise the tests it may be are its candidates, those with no unit
 * first.
 */
function matchUnitless(
  catalog: Catalog,
  value: PrintedValue,
  unit: ReadUnit,
  learned?: (key: string) => string | undefined
): LocalMatch {
  const seen: Seen = {};
  const unitless = matchIn(catalog, value, unit, NO_UNIT_PROPERTIES, learned, seen);
  if (unitless.status === 'match' && seen.learned) return unitless;
  const any = matchIn(catalog, value, unit, [], learned, {}, Number.POSITIVE_INFINITY);
  // A name saying it is a ratio: a ratio, or a clotting time over a normal one ("aPTT ratio")
  const ratioKinds = ratioProperties(RATIO_KINDS, value.name);
  // Only ratios: with none fitting, matchIn falls back to tests of any kind, which must not lead
  const ratios = RATIO_WORD.test(value.name)
    ? matchIn(catalog, value, unit, ratioKinds, learned).candidates.filter(({ code }) =>
        ratioKinds.includes(catalog.test(code)?.property ?? '')
      )
    : [];
  if (unitless.status === 'match' && seen.sample === 'named' && unitless.candidates[0].score === 1) {
    // A test measured in a unit that fits as well, unless far rarer than the one with none ("Nitrite [Mass/volume] in Urine")
    const rank = groupRank(catalog, unitless.code);
    const measured = any.candidates.some(({ code, score }) => {
      const test = catalog.test(code);
      return (
        test !== undefined &&
        test.scale === 'Qn' &&
        !NO_UNIT_PROPERTIES.includes(test.property) &&
        score >= MATCH_SCORE - SCORE_EPSILON &&
        rank * RANK_DOMINANCE > groupRank(catalog, code)
      );
    });
    if (!measured) return unitless;
  }
  const others = [...unitless.candidates, ...any.candidates];
  // A ratio leads the others it fits better; as well, only when the name
  // says ratio in words or is the ratio's own name ("Colesterolo/HDL"): a
  // slash may join two names of one test ("Glucosio/Glukose") or two
  // results ("Borrelia IgG/IgM"), whose tests are not pushed out of the list
  const inWords = RATIO_IN_WORDS.test(value.name);
  const ownName = nameKey(value.name);
  const leadsTie = (code: string): boolean => inWords || !!getAddon(catalog, code)?.names?.includes(ownName);
  const merged: Candidate[] = [];
  for (const candidate of others) {
    while (
      ratios.length &&
      (ratios[0].score > candidate.score || (ratios[0].score === candidate.score && leadsTie(ratios[0].code)))
    ) {
      merged.push(ratios.shift()!);
    }
    merged.push(candidate);
  }
  const candidates = uniqueBy([...merged, ...ratios], ({ code }) => code).slice(0, MAX_CANDIDATES);
  return { status: candidates.length ? 'ambiguous' : 'none', candidates };
}

/** A printed name saying its value is a ratio, in words or by a slash between its parts ("Colesterolo totale/HDL") */
const RATIO_WORD = /\b(?:ratio|rapporto)\b|[a-z]\s*\/\s*[a-z]/i;

/** A printed name saying in words that its value is a ratio ("Rapporto A/G", "aPTT ratio") */
const RATIO_IN_WORDS = /\b(?:ratio|rapporto)\b/i;

/** What a match read on the way: the value's sample, and whether its code was learned */
interface Seen {
  sample?: SampleSaid;
  learned?: boolean;
}

/**
 * The local match of a value among tests of these properties (any, when
 * none, with at most `limit` candidates)
 */
function matchIn(
  catalog: Catalog,
  value: PrintedValue,
  { ucum, units }: ReadUnit,
  properties: string[],
  learned?: (key: string) => string | undefined,
  seen: Seen = {},
  limit = MAX_CANDIDATES
): LocalMatch {
  const whole = spellGreekLetters(value.name.trim());

  // What looks like a prefix or a sample word is part of a name LOINC knows: "P-ANCA", "Sangue occulto"
  // Looked up only when needed: the first lookup builds the search index
  let knownName: boolean | undefined;
  const isLoincName = (): boolean => (knownName ??= catalog.named(whole).length > 0);
  const split = stripPrefix(whole).name !== whole && isLoincName() ? { name: whole } : splitSamplePrefix(whole);
  const namesSample = split.name.search(SAMPLE_WORDS) !== -1;
  const worded = split.systems || !namesSample || isLoincName() ? undefined : sampleInName(split.name);
  const unworded = worded?.name ?? split.name;
  // "Absolute" only says the count its unit says: "Neutrophil, Absolute" in K/µL
  const name = properties.includes('NCnc') ? withoutCountWords(unworded) : unworded;
  let { systems, sample } = sampleOf(split, worded, value.specimenHint, isPerDay(ucum));

  const learnedCode = learned?.(learnedKey(value));
  const learnedTest = learnedCode ? catalog.test(learnedCode) : undefined;
  // The wording and unit learned of one sample say nothing of a value said to be of another
  const contradicted =
    learnedTest !== undefined &&
    sample === 'named' &&
    !systems.some((system) => systemKind(system) === systemKind(learnedTest.system));
  if (learnedTest && !contradicted) {
    seen.learned = true;
    return { status: 'match', code: learnedTest.code, candidates: [toCandidate(learnedTest, 1)] };
  }

  // A LOINC long common name printed in full is that test
  const spelled = catalog.byLongName(whole);
  if (spelled && properties.includes(spelled.property)) {
    seen.sample = sample;
    return { status: 'match', code: spelled.code, candidates: [toCandidate(spelled, 1)] };
  }

  const search = (searched: string, scope: Scope): Found[] => {
    const inPrintedUnit = (found: Found[]): Found[] => {
      const counted = withoutUnsaidLupus(countedAsPrinted(inUnits(found, units), ucum), whole);
      return properties.includes('RelTime') ? asClottingTimes(catalog, counted, whole) : counted;
    };
    const byProperty = readParts(catalog, searched, inPrintedUnit(findByForms(catalog, searched, scope)));
    // A test HemoIO describes in the unit, only when no test of the unit's property fits but one LOINC adjusts
    const fits = ({ test, score }: Found): boolean => score >= MATCH_SCORE - SCORE_EPSILON && !isAdjusted(test);
    if (byProperty.some(fits)) return byProperty;
    const withDescribed = readParts(catalog, searched, inPrintedUnit(findByForms(catalog, searched, { ...scope, described: true })));
    return withDescribed.length ? withDescribed : byProperty;
  };
  let found = search(name, { systems, properties, ucum });
  // What looked like a prefix may be part of the name ("B-HCG", "P-ANCA"): then it names no sample
  if (found.length === 0 && name !== whole) {
    // A sample word, unlike a letter prefix, still names the sample: "Glicemia urine" is not serum glucose
    const sampleWorded = sample === 'named' && stripPrefix(whole).name === whole;
    ({ systems, sample } = sampleOf({}, undefined, value.specimenHint, isPerDay(ucum)));
    found = search(whole, { systems, properties, ucum });
    if (sampleWorded) found = found.map((one) => ({ ...one, score: Math.min(one.score, MATCH_SCORE - MATCH_MARGIN) }));
  }

  // A value with no unit says nothing of which common tests it may be
  const common = (): Candidate[] =>
    commonTests(catalog, whole, ucum ? properties : [], systems).map((test) => toCandidate(test, 0));
  // The closest fits, then the unit's common tests the name may mean
  const withCommon = (fits: Found[]): Candidate[] => {
    const close = describedFirst(fits).slice(0, MAX_CANDIDATES / 2).map(({ test, score }) => toCandidate(test, score));
    const usual = common().filter((test) => !close.some(({ code }) => code === test.code));
    return [...close, ...usual].slice(0, MAX_CANDIDATES);
  };
  if (properties.length > 0 && !found.some(({ score }) => score >= MATCH_SCORE - SCORE_EPSILON)) {
    // No test of the unit's properties fits fully: the unit may be misread or misprinted, so the tests of other
    // properties the name fits are candidates too. When some of the unit's fit a little, only quantities (as the
    // unit says) the name is a name of go before them, read as its brackets say: "Proteina C attivata resistenza"
    // in "ratio" is APC resistance, a time ratio, but "Fibrinogeno (calcolato)" in "mg/dL" no fibrin fragments.
    const byName = findByForms(catalog, name, { systems, properties: [], ucum });
    const misread = found.length
      ? readParts(catalog, name, byName).filter(
          (one) => one.score >= 1 - SCORE_EPSILON && one.test.scale === 'Qn' && !found.some(({ test }) => test === one.test)
        )
      : byName;
    if (misread.length) return { status: 'ambiguous', candidates: withCommon([...misread, ...found]) };
  }
  if (found.length === 0) return { status: 'none', candidates: common() };
  const fitting = withoutUnsaidChallenges(found);
  const [top] = fitting;
  const candidates = describedFirst(found).slice(0, MAX_CANDIDATES).map(({ test, score }) => toCandidate(test, score));
  if (properties.length === 0) {
    return { status: 'ambiguous', candidates: describedFirst(found).slice(0, limit).map(({ test, score }) => toCandidate(test, score)) };
  }
  // A name of a common test equal to the printed one; another's may be one of its many related names
  const isOwnName = top.score === 1 && isCommon(catalog, top.test.code);
  // No name fits well: the unit's common tests may hold the one meant ("Glicemia")
  if (top.score < MATCH_SCORE - SCORE_EPSILON) return { status: 'ambiguous', candidates: withCommon(found) };
  const unsure: LocalMatch = { status: 'ambiguous', candidates: isOwnName ? candidates : withCommon(found) };

  // Tests that fit about as well as the top are rivals, but tests in one
  // trend group (a test's mass and molar, or blood, serum and plasma,
  // codes) are one fit, and so is a test with its variants by a method or
  // collection time the name does not name. The one HemoIO describes
  // stands for them (under a "blood" hint, which leaves the sample open,
  // the most common one it describes), else the one naming no method, else
  // the one whose method the others only narrow, else the best fit. A rare test's name sets it above no other.
  const lead = isOwnName || top.score < 1 ? top.score : MATCH_SCORE;
  const byFoundOrder = (a: Found, b: Found): number => found.indexOf(a) - found.indexOf(b);
  let rivals: Found[][] = [];
  for (const fit of fitting) {
    if (lead - fit.score >= MATCH_MARGIN - SCORE_EPSILON) break;
    // A test naming no method joins every variant of it in one fit
    const isSame = (variants: Found[]): boolean => variants.some(({ test }) => isSameFit(catalog, test, fit.test));
    const joined = rivals.filter(isSame);
    rivals = joined.length
      ? rivals.flatMap((variants) =>
          variants === joined[0] ? [[...joined.flat(), fit].sort(byFoundOrder)] : joined.includes(variants) ? [] : [variants]
        )
      : [...rivals, [fit]];
  }
  const representatives = rivals.map((variants) => {
    const ordered = sample === 'loosely' ? [...variants].sort((a, b) => byRank(a.test, b.test)) : variants;
    return (
      ordered.find(({ test }) => TEST_ADDONS[test.code]) ??
      ordered.find(({ test }) => !test.method) ??
      // The general method the others narrow ("by MDRD" before "by MDRD among black population")
      ordered.find(({ test }) => variants.every((other) => other.test.method.startsWith(test.method))) ??
      ordered[0]
    );
  });
  // A per-cell quantity is named as one (MCHC): a name fitting both means the plain one
  const plain = representatives.filter(({ test }) => !test.property.startsWith('Ent'));
  const fits = plain.length ? plain : representatives;
  const meant = fits.length === 1 ? fits[0] : usualMeaning(catalog, fits, systems, sample);
  if (!meant || meant.score < MATCH_SCORE - SCORE_EPSILON) return unsure;
  // A rare test only by a name of its own that fits nothing else as well; an adjusted one never
  if (isAdjusted(meant.test)) return unsure;
  if (!isCommon(catalog, meant.test.code) && (meant.score < 1 || fits.length > 1 || !ucum)) return unsure;
  if (mayBeMeasured(catalog, meant, rivals[representatives.indexOf(meant)] ?? [])) return unsure;
  if (sample === 'loosely' && sampleKind(meant.test.system) === 'Ser/Plas' && meant.test.system !== 'Ser/Plas/Bld') {
    // Said of blood, loosely: a serum test only when LOINC has no blood test of it that trends apart
    const blood = bloodTestsApart(catalog, name, meant.test, ucum);
    if (blood.length) {
      const others = unsure.candidates.filter(({ code }) => !blood.some((test) => test.code === code));
      return { ...unsure, candidates: [...others.slice(0, MAX_CANDIDATES - blood.length), ...blood] };
    }
  }
  seen.sample = sample;
  // The test taken leads its candidates
  const others = candidates.filter(({ code }) => code !== meant.test.code);
  return {
    status: 'match',
    code: meant.test.code,
    candidates: [toCandidate(meant.test, meant.score), ...others].slice(0, MAX_CANDIDATES),
  };
}
