/**
 * The local step of giving a printed value its LOINC code: the lab's test
 * name, read with its sample and unit, searched in the shipped catalog. A
 * code is taken without asking only when one test clearly fits; otherwise
 * the candidates go on to the AI and the user.
 */
import { nameKey } from '@data/loinc/keys';
import { toUcum, ucumProperties } from '@services/units/ucum';
import type { Catalog, CatalogTest } from '@data/loinc/catalog';

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
/** How far that test must score above the next one */
export const MATCH_MARGIN = 0.15;
/** Most candidates passed on */
const MAX_CANDIDATES = 8;
/** Absorbs float error in score differences (0.9 - 0.75 is not exactly 0.15) */
const SCORE_EPSILON = 1e-9;

/**
 * The matcher's name for urine collected over 24 hours. LOINC writes it as
 * system "Urine" with time "24H", and the catalog keeps only the system.
 */
const DAY_URINE = '24H urine';

/** Where a value with no sample named most likely comes from, likeliest first */
const DEFAULT_SYSTEMS = ['Ser/Plas', 'Ser', 'Plas', 'Bld'];

/** Sample prefixes labs print before a test name, and the systems they mean */
const SAMPLE_PREFIXES: ReadonlyArray<[string, string[]]> = [
  ['U24', [DAY_URINE]],
  ['dU', [DAY_URINE]],
  ['Se', ['Ser', 'Ser/Plas']],
  ['Pl', ['Plas', 'Ser/Plas']],
  ['Sg', ['Bld']],
  ['S', ['Ser', 'Ser/Plas']],
  ['P', ['Plas', 'Ser/Plas']],
  ['B', ['Bld']],
  ['U', ['Urine']],
];

/**
 * Samples the AI may name for a value (its specimen hint) besides urine,
 * which splitSamplePrefix reads. "Blood" is said loosely of serum tests
 * too, so it only makes blood the likelier.
 */
const SAMPLE_HINTS: ReadonlyArray<[RegExp, string[]]> = [
  [/\b(?:serum|siero)\b/i, ['Ser/Plas', 'Ser']],
  [/\bplasma\b/i, ['Ser/Plas', 'Plas']],
  [/\b(?:blood|sangue)\b/i, ['Bld', ...DEFAULT_SYSTEMS.filter((system) => system !== 'Bld')]],
];

/** The urinalysis section prefix, read before the plain "U-" */
const URINALYSIS_PREFIX = /^U\s*-\s*Esame standard\b[\s\-.:]*/i;
const URINE_WORD = /\burin(?:a|e|ari[oa])\b/gi;
const DAY_WORD = /\b24\s*(?:h|ore)\b/gi;

/** A LOINC long common name of a 24-hour urine test: "... in 24 hour Urine" */
const DAY_URINE_NAME = /\b24 ?(?:hour|hr|h) urine\b/i;

/** The name without a leading sample prefix, and the systems the prefix means */
function stripPrefix(name: string): { name: string; systems?: string[] } {
  if (URINALYSIS_PREFIX.test(name)) return { name: name.replace(URINALYSIS_PREFIX, ''), systems: ['Urine'] };
  for (const [prefix, systems] of SAMPLE_PREFIXES) {
    const match = name.match(new RegExp(`^${prefix}\\s*[-.:]\\s*`));
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
  return { name: rest, systems: [day ? DAY_URINE : 'Urine'] };
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

/** Tests whose names fit, of the given samples and properties, best first */
function findTests(catalog: Catalog, name: string, systems: string[], properties: string[]): Found[] {
  return catalog
    .scoredSearch(name, {
      systems: [...new Set(systems.map((system) => (system === DAY_URINE ? 'Urine' : system)))],
      properties: properties.length ? properties : undefined,
    })
    .map(({ test, score }) => ({
      test,
      score,
      preference: systems.findIndex((system) => fitsSystem(test, system)),
    }))
    .filter(({ preference }) => preference !== -1)
    // Stable: equal scores in equally likely samples keep the search's order
    .sort((a, b) => b.score - a.score || a.preference - b.preference);
}

/** Whether a test is from a sample the matcher names, with 24-hour urine apart */
function fitsSystem(test: CatalogTest, system: string): boolean {
  if (system === DAY_URINE) return test.system === 'Urine' && DAY_URINE_NAME.test(test.name);
  if (system === 'Urine') return test.system === 'Urine' && !DAY_URINE_NAME.test(test.name);
  return test.system === system;
}

function toCandidate(test: CatalogTest, score: number): Candidate {
  return { code: test.code, name: test.name, score };
}

/**
 * The LOINC test a printed value is, if one clearly fits, and the best
 * candidates. A code learned for this wording and unit wins. Otherwise the
 * name is searched among tests of its sample (the name's prefix, else the
 * specimen hint, else serum, plasma or blood) and of the properties its
 * unit implies. A value whose unit
 * says nothing is never matched, as nothing tells its tests apart.
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

  const { name, systems: named } = splitSamplePrefix(value.name);
  const systems =
    named ?? (value.specimenHint ? hintSystems(value.specimenHint) : undefined) ?? DEFAULT_SYSTEMS;
  const ucum = toUcum(value.unit);
  const properties = ucum ? ucumProperties(ucum) : [];

  let found = findTests(catalog, name, systems, properties);
  // What looked like a prefix may be part of the name: "B-HCG", "P-ANCA"
  if (found.length === 0 && name !== value.name.trim()) {
    found = findTests(catalog, value.name, DEFAULT_SYSTEMS, properties);
  }

  const candidates = found.slice(0, MAX_CANDIDATES).map(({ test, score }) => toCandidate(test, score));
  const [top] = found;
  if (!top) return { status: 'none', candidates };

  // Tests in the top's trend group (its mass and molar, or blood, serum and
  // plasma, codes) are one fit; any other test that fits as well is a rival
  const topGroup = catalog.trendGroup(top.test.code);
  const rival = found.slice(1).find(({ test }) => catalog.trendGroup(test.code) !== topGroup);
  const clear =
    properties.length > 0 &&
    top.score >= MATCH_SCORE &&
    (!rival || top.score - rival.score >= MATCH_MARGIN - SCORE_EPSILON);
  return clear
    ? { status: 'match', code: top.test.code, candidates }
    : { status: 'ambiguous', candidates };
}
