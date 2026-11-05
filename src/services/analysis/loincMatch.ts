/**
 * The local step of giving a printed value its LOINC code: the lab's test
 * name, read with its sample and unit, searched in the shipped catalog. A
 * code is taken without asking only when one test clearly fits; otherwise
 * the candidates go on to the AI and the user.
 */
import { getAddon } from '@data/loinc/addons';
import { nameKey } from '@data/loinc/keys';
import { toUcum, ucumProperties } from '@services/units/ucum';
import { isPanel, type Catalog, type CatalogTest } from '@data/loinc/catalog';

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
const DEFAULT_SYSTEMS = ['Ser/Plas', 'Ser', 'Plas', 'Ser/Plas/Bld', 'Bld', 'PPP'];

/**
 * Sample prefixes labs print before a test name, and the systems they mean.
 * "Ser/Plas/Bld" is LOINC's system for a test of any of the three (eGFR);
 * "PPP", platelet-poor plasma, that of the clotting tests.
 */
const SAMPLE_PREFIXES: ReadonlyArray<[string, string[]]> = [
  ['U24', [DAY_URINE]],
  ['dU', [DAY_URINE]],
  ['Se', ['Ser', 'Ser/Plas', 'Ser/Plas/Bld']],
  ['Pl', ['Plas', 'Ser/Plas', 'PPP', 'Ser/Plas/Bld']],
  ['Sg', ['Bld', 'Ser/Plas/Bld']],
  ['S', ['Ser', 'Ser/Plas', 'Ser/Plas/Bld']],
  ['P', ['Plas', 'Ser/Plas', 'PPP', 'Ser/Plas/Bld']],
  ['B', ['Bld', 'Ser/Plas/Bld']],
  ['U', URINE],
];

/**
 * Samples the AI may name for a value (its specimen hint) besides urine,
 * which splitSamplePrefix reads. "Blood" is said loosely of serum tests
 * too, so it only makes blood the likelier.
 */
const BLOOD_HINT = /\b(?:blood|sangue)\b/i;
const SAMPLE_HINTS: ReadonlyArray<[RegExp, string[]]> = [
  [/\b(?:serum|siero)\b/i, ['Ser/Plas', 'Ser', 'Ser/Plas/Bld']],
  [/\bplasma\b/i, ['Ser/Plas', 'Plas', 'PPP', 'Ser/Plas/Bld']],
  [BLOOD_HINT, ['Bld', ...DEFAULT_SYSTEMS.filter((system) => system !== 'Bld')]],
];

/**
 * What says the value's sample: nothing; a prefix or a hint, which rule
 * out other samples; or a "blood" hint, which only makes blood the likelier
 */
type SampleSaid = 'none' | 'named' | 'loosely';

/** The urinalysis section prefix, read before the plain "U-" */
const URINALYSIS_PREFIX = /^U\s*-\s*Esame standard\b[\s\-.:]*/i;
const URINE_WORD = /\burin(?:a|e|ari[oa])\b/gi;
const DAY_WORD = /\b24\s*(?:h|ore)\b/gi;

/** A LOINC long common name of a 24-hour urine test: "... in 24 hour Urine" */
const DAY_URINE_NAME = /\b24 ?(?:hour|hr|h) urine\b/i;

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
 * standard") or urine words ("urina", "urinario", "24h", "24 ore"), and the
 * LOINC systems they name. "24H urine" stands for 24-hour urine. A name
 * naming no sample has no systems.
 */
export function splitSamplePrefix(name: string): { name: string; systems?: string[] } {
  const prefixed = stripPrefix(name.trim());
  const urine = prefixed.name.search(URINE_WORD) !== -1;
  const day = prefixed.name.search(DAY_WORD) !== -1;
  if (!urine && !day) return prefixed;

  const rest = prefixed.name
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
}

/**
 * Whether the test fits a unit LOINC files under another property: HemoIO
 * describes it in that unit, and no test it trends with has the unit's
 * property ("mmol/mol" HbA1c, but not "mmol/L" for mass glucose)
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
        properties.length === 0 || properties.includes(test.property) || fitsDescribedUnit(catalog, test, scope)
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
  if (system === DAY_URINE) return test.system === 'Urine' && DAY_URINE_NAME.test(test.name);
  if (system === 'Urine') return test.system === 'Urine' && !DAY_URINE_NAME.test(test.name);
  return test.system === system;
}

/** Lower rank first; an unranked test (0) last */
function byRank(a: CatalogTest, b: CatalogTest): number {
  return rankOf(a.rank) - rankOf(b.rank);
}

function rankOf(rank: number): number {
  return rank || Number.POSITIVE_INFINITY;
}

/** Whether two tests trend together, or are one test by another method or collection time */
function isSameFit(catalog: Catalog, a: CatalogTest, b: CatalogTest): boolean {
  return (
    catalog.trendGroup(a.code) === catalog.trendGroup(b.code) ||
    (a.component === b.component && a.property === b.property && a.system === b.system)
  );
}

/** Serum, plasma, or a test of either: one kind of sample, to tell from blood or urine (with its sediment) */
const SERUM_OR_PLASMA: ReadonlySet<string> = new Set(['Ser', 'Ser/Plas', 'Plas', 'Ser/Plas/Bld', 'PPP']);

function sampleKind(system: string): string {
  if (SERUM_OR_PLASMA.has(system)) return 'Ser/Plas';
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
  return first.rank * RANK_DOMINANCE <= second.rank ? first.found : undefined;
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
  catalog: Catalog,
  value: PrintedValue,
  learned?: (key: string) => string | undefined
): LocalMatch {
  const learnedCode = learned?.(learnedKey(value));
  const learnedTest = learnedCode ? catalog.test(learnedCode) : undefined;
  if (learnedTest) {
    return { status: 'match', code: learnedTest.code, candidates: [toCandidate(learnedTest, 1)] };
  }

  // What looks like a prefix is part of a name LOINC knows: "P-ANCA", "B-HCG"
  const whole = value.name.trim();
  const isLoincName = (): boolean => catalog.scoredSearch(whole).some(({ score }) => score === 1);
  const { name, systems: named } =
    stripPrefix(whole).name !== whole && isLoincName() ? { name: whole } : splitSamplePrefix(whole);
  const hinted = named ?? (value.specimenHint ? hintSystems(value.specimenHint) : undefined);
  const systems = hinted ?? DEFAULT_SYSTEMS;
  const sample: SampleSaid =
    hinted === undefined ? 'none' : !named && BLOOD_HINT.test(value.specimenHint ?? '') ? 'loosely' : 'named';
  const ucum = toUcum(value.unit);
  const properties = ucum ? ucumProperties(ucum) : [];

  let found = findByForms(catalog, name, { systems, properties, ucum });
  // What looked like a prefix may be part of the name: "B-HCG", "P-ANCA"
  if (found.length === 0 && name !== value.name.trim()) {
    found = findByForms(catalog, value.name, { systems: DEFAULT_SYSTEMS, properties, ucum });
  }

  const candidates = found.slice(0, MAX_CANDIDATES).map(({ test, score }) => toCandidate(test, score));
  const [top] = found;
  if (!top) {
    const common = properties.length
      ? catalog.common({ properties, systems: systems.map((s) => (s === DAY_URINE ? 'Urine' : s)) }, MAX_CANDIDATES)
      : [];
    return { status: 'none', candidates: common.map((test) => toCandidate(test, 0)) };
  }
  if (properties.length === 0 || top.score < MATCH_SCORE - SCORE_EPSILON) return { status: 'ambiguous', candidates };

  // Tests that fit about as well as the top are rivals, but tests in one
  // trend group (a test's mass and molar, or blood, serum and plasma,
  // codes) are one fit, and so are variants of one test by method or
  // collection time the name does not name: the one HemoIO describes, else
  // the best fit, stands for them. A "blood" hint leaves the sample open,
  // so then the most common of them does
  const rivals: Found[][] = [];
  for (const fit of found) {
    if (top.score - fit.score >= MATCH_MARGIN - SCORE_EPSILON) break;
    const same = rivals.find(([first]) => isSameFit(catalog, first.test, fit.test));
    if (same) same.push(fit);
    else rivals.push([fit]);
  }
  const byRank = (a: Found, b: Found): number => rankOf(a.test.rank) - rankOf(b.test.rank);
  const fits = rivals.map((variants) => {
    const ordered = sample === 'loosely' ? [...variants].sort(byRank) : variants;
    return ordered.find(({ test }) => getAddon(catalog, test.code)) ?? ordered[0];
  });
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
