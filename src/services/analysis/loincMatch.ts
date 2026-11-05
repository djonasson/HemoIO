/**
 * The local step of giving a printed value its LOINC code: the lab's test
 * name, read with its sample and unit, searched in the shipped catalog. A
 * code is taken without asking only when one test clearly fits; otherwise
 * the candidates go on to the AI and the user.
 */
import { getAddon } from '@data/loinc/addons';
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
/** Most candidates passed on */
const MAX_CANDIDATES = 8;
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
const BLOOD_HINT = /\b(?:blood|sangue)\b/i;
const SAMPLE_HINTS: ReadonlyArray<[RegExp, string[]]> = [
  [/\b(?:serum|siero|sierico)\b/i, ['Ser/Plas', 'Ser', 'Ser/Plas/Bld']],
  [/\bplasma(?:tico)?\b/i, ['Ser/Plas', 'Plas', 'PPP', 'Ser/Plas/Bld']],
  [BLOOD_HINT, ['Bld', 'RBC', ...DEFAULT_SYSTEMS.filter((system) => system !== 'Bld' && system !== 'RBC')]],
];

/** Words naming serum, plasma or blood in a printed name: "Glucosio sangue", "Calcium, Blood" */
const SAMPLE_WORDS = /\b(?:serum|siero|sierico|plasma|plasmatico|blood|sangue)\b/gi;

/**
 * What says the value's sample: nothing; a prefix or a hint, which rule
 * out other samples; or a "blood" hint, which only makes blood the likelier
 */
type SampleSaid = 'none' | 'named' | 'loosely';

/** The urinalysis section prefix, read before the plain "U-" */
const URINALYSIS_PREFIX = /^U\s*-\s*Esame standard\b[\s\-.:]*/i;
const URINE_WORD = /\burin(?:a|e|ari[oa])\b/gi;
/** A substance said of urine by its ending: "Microalbuminuria", "Proteinuria" */
const URINE_ENDING = /(\p{L}{4,})uria\b/giu;
const DAY_WORD = /\b24\s*(?:h|ore)\b/gi;

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

/** Tests whose names fit, of the given samples, and of the unit's properties or described in it, best first */
function findTests(catalog: Catalog, name: string, scope: Scope): Found[] {
  const { systems, properties } = scope;
  return catalog
    .scoredSearch(name, { systems: [...new Set(systems.map((system) => (system === DAY_URINE ? 'Urine' : system)))] })
    .filter(
      ({ test }) =>
        properties.length === 0 ||
        properties.includes(test.property) ||
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
 * name ("(metodo enzimatico)").
 */
function nameForms(name: string): { form: string; left: string }[] {
  const brackets = [...name.matchAll(/\(([^()]*)\)/g)].map(([, inner]) => inner.trim());
  const outside = name.replace(/\([^()]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const forms = [
    { form: name, left: '' },
    { form: outside, left: brackets.join(' ') },
    ...brackets.map((bracket, i) => ({ form: bracket, left: [outside, ...brackets.filter((_, j) => j !== i)].join(' ') })),
  ];
  const seen = new Set<string>();
  return forms.filter(({ form }) => /\p{L}/u.test(form) && !seen.has(form) && seen.add(form));
}

/**
 * The tests each form of the name finds, each at its best score, best
 * first. A part of the name some tests carry says which test it is: a test
 * without it is found by the whole name only ("Vitamina D (25-OH)" is not
 * "Vitamin D+Metabolites", although "Vitamina D" is its name).
 */
function findByForms(catalog: Catalog, name: string, scope: Scope): Found[] {
  const best = new Map<string, Found>();
  for (const { form, left } of nameForms(name)) {
    const carriers = left ? new Set(findTests(catalog, left, scope).map(({ test }) => test.code)) : undefined;
    for (const found of findTests(catalog, form, scope)) {
      if (carriers?.size && !carriers.has(found.test.code)) continue;
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
 * when none stands out, or when a "blood" hint leaves the sample open.
 */
function usualMeaning(catalog: Catalog, rivals: Found[], systems: string[], sample: SampleSaid): Found | undefined {
  const kindOf = ({ preference }: Found): string => sampleKind(systems[preference]);
  if (sample === 'loosely' && new Set(rivals.map(kindOf)).size > 1) return undefined;
  const likeliest = sampleKind(systems[Math.min(...rivals.map(({ preference }) => preference))]);
  const fits = sample === 'named' ? rivals.filter((rival) => kindOf(rival) === likeliest) : rivals;
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
    .replace(/[\s,;:.-]+$/, '')
    .trim();
  return rest ? { name: rest, systems, loosely: pattern === BLOOD_HINT } : undefined;
}

function toCandidate(test: CatalogTest, score: number): Candidate {
  return { code: test.code, name: test.name, score };
}

/**
 * The LOINC test a printed value is, if one clearly fits, and the best
 * candidates. A code learned for this wording and unit wins. Otherwise the
 * name is searched among tests of its sample (the name's prefix, else the
 * specimen hint, else serum, plasma or blood) and of the properties its
 * unit implies. A test is taken when its name fits best by a margin, or
 * when the tests that fit as well differ in what the name does not say and
 * one is the usual meaning. A value whose unit says nothing is never
 * matched, as nothing tells its tests apart. When no name fits, the most
 * common tests of the sample and unit are the candidates: the AI or the
 * user may know a wording LOINC does not ("Glicemia").
 */
export function matchLocally(
  fullCatalog: Catalog,
  value: PrintedValue,
  learned?: (key: string) => string | undefined
): LocalMatch {
  const catalog = withSearchesKept(fullCatalog);
  const learnedCode = learned?.(learnedKey(value));
  const learnedTest = learnedCode ? catalog.test(learnedCode) : undefined;
  if (learnedTest) {
    return { status: 'match', code: learnedTest.code, candidates: [toCandidate(learnedTest, 1)] };
  }

  const ucum = toUcum(value.unit);
  const properties = ucum ? ucumProperties(ucum) : [];
  const whole = value.name.trim();

  // A LOINC long common name printed in full is that test
  const spelled = catalog.byLongName(whole);
  if (spelled && properties.includes(spelled.property)) {
    return { status: 'match', code: spelled.code, candidates: [toCandidate(spelled, 1)] };
  }

  // What looks like a prefix or a sample word is part of a name LOINC knows: "P-ANCA", "Sangue occulto"
  const key = nameKey(whole);
  const isLoincName = (): boolean =>
    catalog
      .scoredSearch(whole)
      .some(({ test, score }) => score === 1 && (test.names.includes(key) || nameKey(test.name) === key));
  const split = stripPrefix(whole).name !== whole && isLoincName() ? { name: whole } : splitSamplePrefix(whole);
  const worded = split.systems || split.name.search(SAMPLE_WORDS) === -1 || isLoincName() ? undefined : sampleInName(split.name);
  const name = worded?.name ?? split.name;
  const said = split.systems ?? worded?.systems;
  const hinted = said ?? (value.specimenHint ? hintSystems(value.specimenHint) : undefined);
  const systems = hinted ?? DEFAULT_SYSTEMS;
  const loosely = split.systems ? false : worded ? worded.loosely : BLOOD_HINT.test(value.specimenHint ?? '');
  const sample: SampleSaid = hinted === undefined ? 'none' : loosely ? 'loosely' : 'named';

  const search = (searched: string, scope: Scope): Found[] => {
    const byProperty = findByForms(catalog, searched, scope);
    // A test HemoIO describes in the unit, only when none of the unit's property fits
    if (byProperty.some(({ score }) => score >= MATCH_SCORE - SCORE_EPSILON)) return byProperty;
    const withDescribed = findByForms(catalog, searched, { ...scope, described: true });
    return withDescribed.length ? withDescribed : byProperty;
  };
  let found = search(name, { systems, properties, ucum });
  // What looked like a prefix may be part of the name: "B-HCG", "P-ANCA"
  if (found.length === 0 && name !== whole) {
    found = search(whole, { systems: DEFAULT_SYSTEMS, properties, ucum });
  }

  const common = (): CatalogTest[] =>
    properties.length
      ? catalog.common({ properties, systems: systems.map((s) => (s === DAY_URINE ? 'Urine' : s)) }, MAX_CANDIDATES)
      : [];
  const [top] = found;
  if (!top) return { status: 'none', candidates: common().map((test) => toCandidate(test, 0)) };
  const candidates = found.slice(0, MAX_CANDIDATES).map(({ test, score }) => toCandidate(test, score));
  if (properties.length === 0) return { status: 'ambiguous', candidates };
  if (top.score < MATCH_SCORE - SCORE_EPSILON) {
    // No name fits well: the unit's common tests may hold the one meant ("Ematocrito")
    const close = candidates.slice(0, MAX_CANDIDATES / 2);
    const usual = common()
      .filter((test) => !close.some(({ code }) => code === test.code))
      .map((test) => toCandidate(test, 0));
    return { status: 'ambiguous', candidates: [...close, ...usual].slice(0, MAX_CANDIDATES) };
  }

  // Tests that fit about as well as the top are rivals, but tests in one
  // trend group (a test's mass and molar, or blood, serum and plasma,
  // codes) are one fit, and so is a test with its variants by a method or
  // collection time the name does not name. The one HemoIO describes
  // stands for them (under a "blood" hint, which leaves the sample open,
  // the most common one it describes), else the one naming no method, else
  // the best fit.
  const byFoundOrder = (a: Found, b: Found): number => found.indexOf(a) - found.indexOf(b);
  let rivals: Found[][] = [];
  for (const fit of found) {
    if (top.score - fit.score >= MATCH_MARGIN - SCORE_EPSILON) break;
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
      ordered.find(({ test }) => getAddon(catalog, test.code)) ?? ordered.find(({ test }) => !test.method) ?? ordered[0]
    );
  });
  // A per-cell quantity is named as one (MCHC): a name fitting both means the plain one
  const plain = representatives.filter(({ test }) => !test.property.startsWith('Ent'));
  const fits = plain.length ? plain : representatives;
  const meant = fits.length === 1 ? fits[0] : usualMeaning(catalog, fits, systems, sample);
  if (!meant || meant.score < MATCH_SCORE - SCORE_EPSILON) return { status: 'ambiguous', candidates };
  // The test taken leads its candidates
  const others = candidates.filter(({ code }) => code !== meant.test.code);
  return {
    status: 'match',
    code: meant.test.code,
    candidates: [toCandidate(meant.test, meant.score), ...others].slice(0, MAX_CANDIDATES),
  };
}
