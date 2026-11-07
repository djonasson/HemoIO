/**
 * The local step of giving a printed value its LOINC code: the lab's test
 * name, read with its sample and unit, searched in the shipped catalog. A
 * code is taken without asking only when one test clearly fits; otherwise
 * the candidates go on to the AI and the user.
 */
import { getAddon, TEST_ADDONS } from '@data/loinc/addons';
import { nameKey } from '@data/loinc/keys';
import { isCatalyticUnit, toUcum, ucumProperties } from '@services/units/ucum';
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
const wordsOf = (words: string, flags: string): RegExp => new RegExp(`\\b(?:${words})\\b`, flags);
const BLOOD_HINT = wordsOf(BLOOD_WORDS, 'i');
const SAMPLE_HINTS: ReadonlyArray<[RegExp, string[]]> = [
  [wordsOf(SERUM_WORDS, 'i'), ['Ser/Plas', 'Ser', 'Ser/Plas/Bld']],
  [wordsOf(PLASMA_WORDS, 'i'), ['Ser/Plas', 'Plas', 'PPP', 'Ser/Plas/Bld']],
  [wordsOf(RED_CELL_WORDS, 'i'), ['RBC']],
  [BLOOD_HINT, ['Bld', 'RBC', ...DEFAULT_SYSTEMS.filter((system) => system !== 'Bld' && system !== 'RBC')]],
];

/**
 * Words naming serum, plasma, red cells or blood in a printed name:
 * "Glucosio sangue", "Calcium, Blood", "Piombo ematico", "Folati eritrocitari"
 */
const SAMPLE_WORDS = wordsOf([SERUM_WORDS, PLASMA_WORDS, RED_CELL_WORDS, BLOOD_WORDS].join('|'), 'gi');

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
 * The ways a printed name may name its test: whole, without its brackets,
 * and each bracket alone, each with what it leaves out. A bracket holds
 * another name ("Tirotropina (TSH)") or a qualifier the catalog does not
 * name ("(metodo enzimatico)"); so does a part set off by a spaced dash
 * ("Creatinchinasi - CK").
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
 * Whether the rest of a printed name names the test's method with a word
 * no test has: every other word of it is a word of the method ("formula"
 * of "Creatinine-based formula (CKD-EPI)"), so the unknown one names a
 * method LOINC has no test for ("formula EKFC")
 */
function namesUnknownMethod(test: CatalogTest, rest: string, unknown: string[]): boolean {
  if (unknown.length === 0 || !test.method) return false;
  const wordsIn = (text: string): string[] => nameKey(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const methodWords = new Set(wordsIn(test.method));
  const known = wordsIn(rest).filter((word) => !unknown.includes(word));
  return known.length > 0 && known.every((word) => methodWords.has(word));
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
    let unknown: string[] | undefined;
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
      if (carriers?.size && byRest === undefined) continue;
      // The rest names the test's method with a word no test has: a method LOINC lacks ("eGFR (formula EKFC)"), left to the whole name
      if (!part && byRest !== undefined && !restNames && namesUnknownMethod(found.test, left, (unknown ??= catalog.unknownWords(left)))) {
        continue;
      }
      // The rest of the name fits another test well: "Troponina I (hs)" is not troponin T hs
      const restNamesOther = !restNames && [...(carriers?.values() ?? [])].some(isFit);
      if (part === 'dashed' || (part === 'bracket' && found.score < 1 && carriers?.size)) {
        // Another name of the test the rest names too ("Creatinchinasi - CK", "eGFR (CKD-EPI)")
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

/** The units a D-dimer is given in: fibrinogen equivalent units or D-dimer units, about two-fold apart */
const DIMER_UNITS = /\b(FEU|DDU)\b/i;

/** The D-dimer units a test, or a printed unit, gives its value in, if it names them */
function dimerUnits(text: string): string | undefined {
  return text.match(DIMER_UNITS)?.[1].toUpperCase();
}

/** The D-dimer units a test names in its component or method ("Fibrin D-dimer FEU", "Immunoassay.DDU") */
function testDimerUnits(test: CatalogTest): string | undefined {
  return dimerUnits(`${test.component} ${test.method}`);
}

/** A test's component without the D-dimer units it may name ("Fibrin D-dimer FEU") */
function plainComponent(test: CatalogTest): string {
  return squeeze(test.component.replace(DIMER_UNITS, ' '));
}

/**
 * Whether two tests trend together, or are one measurement of one sample
 * by methods the name does not tell apart: one is the other with a method
 * or collection time named, or each names a way of measuring it (a strip
 * read by eye or by machine, D-dimer FEU by immunoassay). Values in other
 * units of it (D-dimer FEU and DDU), or a calculated value and a measured
 * one, mean different things, so they stay apart.
 */
function isSameFit(catalog: Catalog, a: CatalogTest, b: CatalogTest): boolean {
  if (catalog.trendGroup(a.code) === catalog.trendGroup(b.code)) return true;
  if (a.property !== b.property || a.system !== b.system) return false;
  if (a.component === b.component && (!a.method || !b.method)) return true;
  return (
    plainComponent(a) === plainComponent(b) &&
    testDimerUnits(a) === testDimerUnits(b) &&
    (a.method === CALCULATED) === (b.method === CALCULATED)
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
  const nearest = Math.min(...rivals.map(({ preference }) => preference));
  const likeliest = sampleKind(systems[nearest]);
  const ofKind = sample === 'named' ? rivals.filter((rival) => kindOf(rival) === likeliest) : rivals;
  // A urine value is the urine's: when none stands out, its sediment's tests (cells seen per field) give way to the urine's
  const urine = sample === 'named' && likeliest === 'Urine' ? ofKind.filter(({ preference }) => preference === nearest) : [];
  const meant = standingOut(catalog, ofKind) ?? (urine.length ? standingOut(catalog, urine) : undefined);
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
 * Whether the test meant is calculated from other tests, and a variant
 * measuring it that trends apart fits the name as well and is about as
 * common: then the name may mean either ("Colesterolo LDL" calculated or
 * by direct assay, which differ in what they are). LOINC's names do not
 * have the Italian "calcolato", so a name saying it is asked too, and the
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
function inUnits(found: Found[], units: string | undefined): Found[] {
  if (!units) return found;
  const named = found.filter(({ test }) => testDimerUnits(test) === units);
  return named.length ? named : found.filter(({ test }) => testDimerUnits(test) === undefined);
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
function readUnit(unit: string): { ucum: string | null; units?: string } {
  const units = dimerUnits(unit);
  return { ucum: toUcum(units ? squeeze(unit.replace(/\{?\b(?:FEU|DDU)\b\}?/gi, ' ')) : unit), units };
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
 * apart. A value with no unit is matched only to a common test that has
 * none (see NO_UNIT_PROPERTIES); otherwise the tests its name fits, of any
 * property, are its candidates. When no name of a common test is the
 * printed one, the most common tests of the sample and unit are candidates
 * too: the AI or the user may know a wording LOINC does not ("Glicemia").
 */
export function matchLocally(
  fullCatalog: Catalog,
  value: PrintedValue,
  learned?: (key: string) => string | undefined
): LocalMatch {
  const catalog = withSearchesKept(fullCatalog);
  const { ucum } = readUnit(value.unit);
  if (ucum || value.unit.trim() !== '') return matchIn(catalog, value, ucum ? ucumProperties(ucum) : [], learned);
  const unitless = matchIn(catalog, value, NO_UNIT_PROPERTIES, learned);
  if (unitless.status === 'match') return unitless;
  // The unit may be missing: the tests the name fits whatever their unit are candidates too, best fits first
  const any = matchIn(catalog, value, [], learned);
  const candidates = [...unitless.candidates, ...any.candidates]
    .filter((candidate, i, all) => all.findIndex(({ code }) => code === candidate.code) === i)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
  return { status: candidates.length ? 'ambiguous' : 'none', candidates };
}

/** The local match of a value among tests of these properties (any, when none) */
function matchIn(
  catalog: Catalog,
  value: PrintedValue,
  properties: string[],
  learned?: (key: string) => string | undefined
): LocalMatch {
  const { ucum, units } = readUnit(value.unit);
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
    return { status: 'match', code: learnedTest.code, candidates: [toCandidate(learnedTest, 1)] };
  }

  // A LOINC long common name printed in full is that test
  const spelled = catalog.byLongName(whole);
  if (spelled && properties.includes(spelled.property)) {
    return { status: 'match', code: spelled.code, candidates: [toCandidate(spelled, 1)] };
  }

  const search = (searched: string, scope: Scope): Found[] => {
    const byProperty = inUnits(findByForms(catalog, searched, scope), units);
    // A test HemoIO describes in the unit, only when no test of the unit's property fits but one LOINC adjusts
    const fits = ({ test, score }: Found): boolean => score >= MATCH_SCORE - SCORE_EPSILON && !isAdjusted(test);
    if (byProperty.some(fits)) return byProperty;
    const withDescribed = inUnits(findByForms(catalog, searched, { ...scope, described: true }), units);
    return withDescribed.length ? withDescribed : byProperty;
  };
  let found = search(name, { systems, properties, ucum });
  // What looked like a prefix may be part of the name ("B-HCG", "P-ANCA"): then it names no sample
  if (found.length === 0 && name !== whole) {
    ({ systems, sample } = sampleOf({}, undefined, value.specimenHint, isPerDay(ucum)));
    found = search(whole, { systems, properties, ucum });
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
  if (found.length === 0 && properties.length > 0) {
    // A name of tests of other properties: the unit may be misread or misprinted
    const byName = findByForms(catalog, name, { systems, properties: [], ucum });
    if (byName.length) return { status: 'ambiguous', candidates: withCommon(byName) };
  }
  if (found.length === 0) return { status: 'none', candidates: common() };
  const fitting = withoutUnsaidChallenges(found);
  const [top] = fitting;
  const candidates = describedFirst(found).slice(0, MAX_CANDIDATES).map(({ test, score }) => toCandidate(test, score));
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
  // The test taken leads its candidates
  const others = candidates.filter(({ code }) => code !== meant.test.code);
  return {
    status: 'match',
    code: meant.test.code,
    candidates: [toCandidate(meant.test, meant.score), ...others].slice(0, MAX_CANDIDATES),
  };
}
