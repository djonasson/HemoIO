/**
 * The local step of giving a printed value its LOINC code: the lab's test
 * name, read with its sample and unit, searched in the shipped catalog. A
 * code is taken without asking only when one test clearly fits; otherwise
 * the candidates go on to the AI and the user.
 */
import { getAddon, TEST_ADDONS } from '@data/loinc/addons';
import { nameKey } from '@data/loinc/keys';
import { toUcum, ucumProperties } from '@services/units/ucum';
import { byRank, isDayUrine, isPanel, type Catalog, type CatalogTest, type ScoredTest } from '@data/loinc/catalog';

/** A value as the report prints it */
export interface PrintedValue {
  name: string;
  unit: string;
  /** The sample the report section or the AI names: "urine", "24h urine" */
  specimenHint?: string;
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
const URINE = ['Urine', 'Urine sed'];

/** Where a value with no sample named most likely comes from, likeliest first */
const DEFAULT_SYSTEMS = ['Ser/Plas', 'Ser', 'Plas', 'Ser/Plas/Bld', 'Bld', 'RBC', 'PPP'];

/**
 * Sample prefixes labs print before a test name, and the systems they mean.
 * "Ser/Plas/Bld" is LOINC's system for a test of any of the three (eGFR);
 * "PPP", platelet-poor plasma, that of the clotting tests; "RBC", that of
 * the red cell indices of a blood count (MCV, MCH, MCHC).
 */
const SAMPLE_PREFIXES: ReadonlyArray<[string, string[]]> = [
  ['U24', [DAY_URINE]],
  ['dU', [DAY_URINE]],
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
const BLOOD_HINT = /\b(?:blood|sangue|ematic[oaie]|ematiche)\b/i;
const SAMPLE_HINTS: ReadonlyArray<[RegExp, string[]]> = [
  [/\b(?:serum|siero|sieric[oaie]|sieriche)\b/i, ['Ser/Plas', 'Ser', 'Ser/Plas/Bld']],
  [/\bplasma(?:tic[oaie]|tiche)?\b/i, ['Ser/Plas', 'Plas', 'PPP', 'Ser/Plas/Bld']],
  // The red cells: "Folati eritrocitari"
  [/\b(?:erythrocytes?|eritrocitari[oae]?|eritrocitarie)\b/i, ['RBC']],
  [BLOOD_HINT, ['Bld', 'RBC', ...DEFAULT_SYSTEMS.filter((system) => system !== 'Bld' && system !== 'RBC')]],
];

/**
 * Words naming serum, plasma, red cells or blood in a printed name:
 * "Glucosio sangue", "Calcium, Blood", "Piombo ematico", "Folati eritrocitari"
 */
const SAMPLE_WORDS =
  /\b(?:serum|siero|sieric[oaie]|sieriche|plasma|plasmatic[oaie]|plasmatiche|blood|sangue|ematic[oaie]|ematiche|erythrocytes?|eritrocitari[oae]?|eritrocitarie)\b/gi;
/**
 * A substance said of blood by its ending: "Uricemia", "Colesterolemia".
 * Blood is said loosely of serum tests too, as by a blood word.
 */
const BLOOD_ENDING = /(\p{L}{4,})emia\b/giu;

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
 * Italian wordings of an antibody: "anticorpi anti-", "Ab anti", "Ac.
 * anti", "Antic. anti", "A.A." before what it binds, "anticorpi" after it,
 * or "anti-" opening the name
 */
const ANTIBODY_BEFORE = /^(?:(?:anticorp[oi]|antic\.?|ant\.?|ac\.?|ab)\s+anti(?:[\s-]+|(?=\p{L}))|a\.\s?a\.\s*|anti[\s-]+(?=\p{L}))/iu;
const ANTIBODY_WORD = /\(?\banticorp[oi]\b\)?/iu;

/**
 * A name of an antibody as LOINC names it, with "Ab" after what it binds
 * ("Anticorpi anti tireoperossidasi" is "tireoperossidasi Ab"), else the
 * name as it is
 */
export function readAntibody(name: string): string {
  const before = name.match(ANTIBODY_BEFORE);
  if (before) return `${name.slice(before[0].length).trim()} ab`;
  if (ANTIBODY_WORD.test(name)) return `${name.replace(ANTIBODY_WORD, ' ').replace(/\s+/g, ' ').trim()} ab`;
  return name;
}

/** Words saying a count is one, not a share: "Neutrophil, Absolute", "Neutrofili assoluti" */
const COUNT_WORDS = /[\s,;:-]*\b(?:absolute|assolut[oiae]|abs)\b\.?/giu;

/** A name without the words saying its value is a count, if more is left */
function withoutCountWords(name: string): string {
  const rest = name.replace(COUNT_WORDS, ' ').replace(/\s+/g, ' ').trim();
  return /\p{L}/u.test(rest) ? rest : name;
}

/** Greek letters as their names: "α1-antitripsina", "β2-microglobulina" */
const GREEK_LETTERS: Readonly<Record<string, string>> = {
  α: 'alfa', β: 'beta', γ: 'gamma', δ: 'delta', κ: 'kappa', λ: 'lambda',
  a: 'alfa', b: 'beta', g: 'gamma',
};

/**
 * A name with its Greek letters spelled out, as LOINC's names have them.
 * A PDF's symbol font gives a Latin letter for the Greek one, so a
 * lowercase "a", "b" or "g" before a number or a hyphen is read so too
 * ("a1-antitripsina", "b-2 microglobulina", "17-a-idrossiprogesterone").
 */
export function spellGreek(name: string): string {
  return name
    .replace(/(^|[^\p{L}])([αβγδκλ])(?=[^\p{L}]|$)-?/gu, (_all, start: string, letter: string) => `${start}${GREEK_LETTERS[letter]}-`)
    .replace(/(^|[\s(-])([abg])(?:-|(?=\d))/gu, (_all, start: string, letter: string) => `${start}${GREEK_LETTERS[letter]}-`);
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

/** The LOINC systems a specimen hint names, if any */
function hintSystems(hint: string): string[] | undefined {
  return splitSamplePrefix(hint).systems ?? SAMPLE_HINTS.find(([words]) => words.test(hint))?.[1];
}

/** The key a value's code is remembered under: its printed name and unit */
export function learnedKey(value: PrintedValue): string {
  return `${nameKey(value.name)}|${toUcum(value.unit) ?? nameKey(value.unit)}`;
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

/** A unit of UCUM's enzyme unit: "U/L", "mU/mL", "U/g{Hb}" */
const ENZYME_UNIT = /(?<![A-Za-z[])[kmu]?U(?![A-Za-z\]])/;

/**
 * Whether a test's property fits the unit as LOINC measures the test.
 * International units per volume are read as catalytic only because labs
 * print enzymes in them ("ALT 30 UI/L"): an activity LOINC gives in other
 * units (renin's ng/mL/h, a rate of what the enzyme makes) is not one.
 */
function fitsProperty(test: CatalogTest, { properties, ucum }: Scope): boolean {
  if (!properties.includes(test.property)) return false;
  if (test.property !== 'CCnc' || !ucum?.includes('[IU]') || test.units.length === 0) return true;
  return test.units.some((unit) => ENZYME_UNIT.test(unit) || unit.includes('[IU]'));
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
 * The ways a printed name may name its test: whole, without its brackets,
 * and each bracket alone, each with what it leaves out. A bracket holds
 * another name ("Tirotropina (TSH)") or a qualifier the catalog does not
 * name ("(metodo enzimatico)"); so does a part set off by a spaced dash
 * ("Creatinchinasi - CK").
 */
function nameForms(name: string): { form: string; left: string; part?: true }[] {
  const brackets = [...name.matchAll(/\(([^()]*)\)/g)].map(([, inner]) => inner.trim());
  const outside = name.replace(/\([^()]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const dashed = outside.split(/\s+[-–]\s+/);
  const parts = [...brackets, ...(dashed.length > 1 ? dashed : [])];
  const forms = [
    { form: name, left: '' },
    { form: outside, left: brackets.join(' ') },
    ...parts.map((part, i) => ({
      form: part,
      left: [...(dashed.length > 1 ? [] : [outside]), ...parts.filter((_, j) => j !== i)].join(' '),
      part: true as const,
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
  const best = new Map<string, Found>();
  for (const { form, left, part } of nameForms(name)) {
    const carriers = left ? new Set(findTests(catalog, left, scope).map(({ test }) => test.code)) : undefined;
    for (const found of findTests(catalog, form, scope)) {
      if (carriers?.size && !carriers.has(found.test.code)) continue;
      if (part && found.score < 1) continue;
      const known = best.get(found.test.code);
      if (!known || found.score > known.score) best.set(found.test.code, found);
    }
  }
  // Equal scores in equally likely samples go to the more common test
  return [...best.values()].sort(
    (a, b) => b.score - a.score || a.preference - b.preference || byRank(a.test, b.test)
  );
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

/**
 * Whether two tests trend together, or one is the other with a method or
 * collection time named. Two variants that each name a method (D-dimer
 * FEU and DDU) mean different things, so they stay apart.
 */
function isSameFit(catalog: Catalog, a: CatalogTest, b: CatalogTest): boolean {
  return (
    catalog.trendGroup(a.code) === catalog.trendGroup(b.code) ||
    (a.component === b.component && a.property === b.property && a.system === b.system && (!a.method || !b.method))
  );
}

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
  const ending = name.search(BLOOD_ENDING) === -1 ? [] : ['sangue'];
  const words = [...(name.match(SAMPLE_WORDS) ?? []), ...ending].join(' ');
  const [pattern, systems] = SAMPLE_HINTS.find(([sampleWords]) => sampleWords.test(words)) ?? [];
  if (!systems) return undefined;
  const rest = name
    .replace(SAMPLE_WORDS, ' ')
    .replace(BLOOD_ENDING, '$1')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:.-]+$/, '')
    .trim();
  return rest ? { name: rest, systems, loosely: pattern === BLOOD_HINT } : undefined;
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
 * prefix, urine words or serum words), else its specimen hint, else
 * serum, plasma or blood; and whether that sample is said, or only
 * loosely by "blood". A day's unit ("mg/24h") says its urine was
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

/** LOINC's method of a value calculated from other tests ("Cholesterol in LDL ... by calculation") */
const CALCULATED = 'Calculated';

/**
 * Whether the test meant is calculated from other tests, which the printed
 * name does not say, and a variant measuring it that trends apart is about
 * as common: then the name may mean either ("Colesterolo LDL" calculated
 * or by direct assay, which differ in what they are). Counts by machine or
 * by hand, or strips read by eye or by machine, measure one thing alike.
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
function isCommon(catalog: Catalog, code: string): boolean {
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
 * The LOINC test a printed value is, if one clearly fits, and the best
 * candidates. A code learned for this wording and unit wins, unless the
 * value's sample is said to be another. Otherwise the name is searched
 * among tests of its sample (see sampleOf) and of the properties its unit
 * implies. A test is taken when its name fits best by a margin, or when
 * the tests that fit as well differ in what the name does not say and one
 * is the usual meaning; a test LOINC does not count among its common ones
 * only when the name is one of its own and fits nothing else as well, and
 * one LOINC names with an adjustment (see isAdjusted) never. A
 * value whose unit says nothing is never matched, as nothing tells its
 * tests apart. When no name of a common test is the printed one, the most
 * common tests of the sample and unit are candidates too: the AI or the
 * user may know a wording LOINC does not ("Glicemia").
 */
export function matchLocally(
  fullCatalog: Catalog,
  value: PrintedValue,
  learned?: (key: string) => string | undefined
): LocalMatch {
  const catalog = withSearchesKept(fullCatalog);
  const ucum = toUcum(value.unit);
  const properties = ucum ? ucumProperties(ucum) : [];
  // A letter and its number written apart are one name: "Vitamina B 12" is "Vitamina B12"
  const whole = spellGreek(value.name.trim()).replace(/(?<=^|\s)(\p{L}) (\d{1,2})(?=\s|$)/gu, '$1$2');

  // What looks like a prefix or a sample word is part of a name LOINC knows: "P-ANCA", "Sangue occulto"
  const isLoincName = (): boolean => catalog.named(whole).length > 0;
  const split = stripPrefix(whole).name !== whole && isLoincName() ? { name: whole } : splitSamplePrefix(whole);
  const namesSample = split.name.search(SAMPLE_WORDS) !== -1 || split.name.search(BLOOD_ENDING) !== -1;
  const worded = split.systems || !namesSample || isLoincName() ? undefined : sampleInName(split.name);
  // An antibody as LOINC names it, unless the name is one LOINC knows ("Anti-Xa")
  const read = isLoincName() ? (worded?.name ?? split.name) : readAntibody(worded?.name ?? split.name);
  // "Absolute" only says the count its unit says: "Neutrophil, Absolute" in K/µL
  const name = properties.includes('NCnc') ? withoutCountWords(read) : read;
  let { systems, sample } = sampleOf(split, worded, value.specimenHint, isPerDay(ucum));

  const learnedCode = learned?.(learnedKey(value));
  const learnedTest = learnedCode ? catalog.test(learnedCode) : undefined;
  // The wording and unit learned of one sample say nothing of a value said to be of another
  const contradicted =
    learnedTest !== undefined &&
    sample === 'named' &&
    !systems.some((system) => systemKind(system) === systemKind(learnedTest.system));
  if (learnedTest && !contradicted) {
    return { status: 'match', code: learnedTest.code, candidates: [toCandidate(learnedTest, 1)] };
  }

  // A LOINC long common name printed in full is that test
  const spelled = catalog.byLongName(whole);
  if (spelled && properties.includes(spelled.property)) {
    return { status: 'match', code: spelled.code, candidates: [toCandidate(spelled, 1)] };
  }

  const search = (searched: string, scope: Scope): Found[] => {
    const byProperty = findByForms(catalog, searched, scope);
    // A test HemoIO describes in the unit, only when no test of the unit's property fits but one LOINC adjusts
    const fits = ({ test, score }: Found): boolean => score >= MATCH_SCORE - SCORE_EPSILON && !isAdjusted(test);
    if (byProperty.some(fits)) return byProperty;
    const withDescribed = findByForms(catalog, searched, { ...scope, described: true });
    return withDescribed.length ? withDescribed : byProperty;
  };
  let found = search(name, { systems, properties, ucum });
  // What looked like a prefix may be part of the name ("B-HCG", "P-ANCA"): then it names no sample
  if (found.length === 0 && name !== whole) {
    ({ systems, sample } = sampleOf({}, undefined, value.specimenHint, isPerDay(ucum)));
    found = search(whole, { systems, properties, ucum });
  }

  const common = (): Candidate[] =>
    commonTests(catalog, whole, properties, systems).map((test) => toCandidate(test, 0));
  // The closest fits, then the unit's common tests the name may mean
  const withCommon = (fits: Found[]): Candidate[] => {
    const close = fits.slice(0, MAX_CANDIDATES / 2).map(({ test, score }) => toCandidate(test, score));
    const usual = common().filter((test) => !close.some(({ code }) => code === test.code));
    return [...close, ...usual].slice(0, MAX_CANDIDATES);
  };
  if (found.length === 0 && properties.length > 0) {
    // A name of tests of other properties: the unit may be misread or misprinted
    const byName = findByForms(catalog, name, { systems, properties: [], ucum });
    if (byName.length) return { status: 'ambiguous', candidates: withCommon(byName) };
  }
  if (found.length === 0) return { status: 'none', candidates: common() };
  const fitting = withoutUnsaidChallenges(found);
  const [top] = fitting;
  const candidates = found.slice(0, MAX_CANDIDATES).map(({ test, score }) => toCandidate(test, score));
  if (properties.length === 0) return { status: 'ambiguous', candidates };
  // A name of a common test equal to the printed one; another's may be one of its many related names
  const isOwnName = top.score === 1 && isCommon(catalog, top.test.code);
  // No name fits well: the unit's common tests may hold the one meant ("Ematocrito")
  if (top.score < MATCH_SCORE - SCORE_EPSILON) return { status: 'ambiguous', candidates: withCommon(found) };
  const unsure: LocalMatch = { status: 'ambiguous', candidates: isOwnName ? candidates : withCommon(found) };

  // Tests that fit about as well as the top are rivals, but tests in one
  // trend group (a test's mass and molar, or blood, serum and plasma,
  // codes) are one fit, and so is a test with its variants by a method or
  // collection time the name does not name. The one HemoIO describes
  // stands for them (under a "blood" hint, which leaves the sample open,
  // the most common one it describes), else the one naming no method, else
  // the best fit. A rare test's name sets it above no other.
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
    return ordered.find(({ test }) => TEST_ADDONS[test.code]) ?? ordered.find(({ test }) => !test.method) ?? ordered[0];
  });
  // A per-cell quantity is named as one (MCHC): a name fitting both means the plain one
  const plain = representatives.filter(({ test }) => !test.property.startsWith('Ent'));
  const fits = plain.length ? plain : representatives;
  const meant = fits.length === 1 ? fits[0] : usualMeaning(catalog, fits, systems, sample);
  if (!meant || meant.score < MATCH_SCORE - SCORE_EPSILON) return unsure;
  // A rare test only by a name of its own that fits nothing else as well; an adjusted one never
  if (isAdjusted(meant.test)) return unsure;
  if (!isCommon(catalog, meant.test.code) && (meant.score < 1 || fits.length > 1)) return unsure;
  if (mayBeMeasured(catalog, meant, rivals[representatives.indexOf(meant)] ?? [])) return unsure;
  if (sample === 'loosely' && sampleKind(meant.test.system) === 'Ser/Plas' && meant.test.system !== 'Ser/Plas/Bld') {
    // Said of blood, loosely: a serum test only when LOINC has no blood test of it that trends apart
    const blood = bloodTestsApart(catalog, name, meant.test, ucum);
    if (blood.length) {
      const others = unsure.candidates.filter(({ code }) => !blood.some((test) => test.code === code));
      return { ...unsure, candidates: [...others.slice(0, MAX_CANDIDATES - blood.length), ...blood] };
    }
  }
  // The test taken leads its candidates
  const others = candidates.filter(({ code }) => code !== meant.test.code);
  return {
    status: 'match',
    code: meant.test.code,
    candidates: [toCandidate(meant.test, meant.score), ...others].slice(0, MAX_CANDIDATES),
  };
}
