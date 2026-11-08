/**
 * The app's LOINC catalog at runtime: the tests and groups generated from the
 * local LOINC release by scripts/loinc-catalog.mjs, with lookups by code,
 * name search, and the trend groups that join closely related codes.
 *
 * The data file is large (about 13 MB), so it is fetched on first use as a
 * file of its own and never with the app's start.
 */
import { TEST_ADDONS } from './addons';
import { nameKey } from './keys';

/** One LOINC test as the generated catalog holds it */
export interface CatalogTest {
  code: string;
  /** LOINC long common name */
  name: string;
  shortName: string;
  component: string;
  property: string;
  system: string;
  scale: string;
  method: string;
  /** LOINC class, e.g. "CHEM", "HEM/BC", "UA" */
  classCode: string;
  /** English and Italian names and related names, normalised and de-duplicated */
  names: string[];
  /** Example UCUM units */
  units: string[];
  /** LOINC's common-test rank: lower is more common, 0 is unranked */
  rank: number;
  /** Ids of the LOINC groups the test belongs to */
  groups: string[];
}

/** One LOINC group (GroupFile) with the name of its parent group */
export interface CatalogGroup {
  id: string;
  parentId: string;
  parentName: string;
  name: string;
}

/** The generated catalog file */
export interface CatalogFile {
  version: string;
  tests: CatalogTest[];
  groups: CatalogGroup[];
}

/** Narrows a search to tests of these LOINC properties and systems */
export interface CatalogSearchFilter {
  properties?: string[];
  systems?: string[];
}

/** A test found by a search, with how well its names fit the query (0 to 1) */
export interface ScoredTest {
  test: CatalogTest;
  score: number;
}

export interface Catalog {
  /** The LOINC release the catalog was generated from */
  version: string;
  test(code: string): CatalogTest | undefined;
  /**
   * Tests whose names fit the query, best first. A name equal to the query
   * scores 1, shared words score below 1; ties go to the more common test.
   */
  search(query: string, filter?: CatalogSearchFilter): CatalogTest[];
  /** The same search, with each test's score */
  scoredSearch(query: string, filter?: CatalogSearchFilter): ScoredTest[];
  /** The most common tests of these properties and systems, most common first */
  common(filter: CatalogSearchFilter, limit: number): CatalogTest[];
  /** The test whose long common name this is, whatever its case and spacing */
  byLongName(name: string): CatalogTest | undefined;
  /** The tests one of whose names (or long common name) this is, whatever its case and spacing */
  named(name: string): CatalogTest[];
  /**
   * What a code trends with: the group joining its mass and molar codes
   * when it holds others (for a rate, its mass and molar rate groups), else
   * the group joining its blood, serum and plasma codes, else the code
   */
  trendGroup(code: string): string;
  /** A readable name for a LOINC class */
  classLabel(classCode: string): string;
  /** The codes that share a trend group */
  groupCodes(trendGroup: string): string[];
}

const CLASS_LABELS: Readonly<Record<string, string>> = {
  CHEM: 'Chemistry',
  'HEM/BC': 'Hematology',
  UA: 'Urinalysis',
  SERO: 'Serology',
  COAG: 'Coagulation',
  'DRUG/TOX': 'Drugs and toxicology',
  MICRO: 'Microbiology',
  FERT: 'Fertility',
  SPEC: 'Specimen characteristics',
};

/**
 * A word in more than this share of tests ("serum", "chemistry", "level")
 * says nothing about which test is meant, so search ignores it
 */
const GENERIC_SHARE = 0.05;
/** ...but a small catalog has no generic words */
const MIN_GENERIC_COUNT = 50;

/**
 * Words that name a sample, a kind of quantity or a kind of result rather
 * than a test, in English and Italian. The share rule above misses some:
 * Italian names are only components, so "sangue" or "siero" are rare in
 * the catalog although they say nothing about the test.
 */
const STOP_WORDS: ReadonlySet<string> = new Set([
  // English
  'blood', 'serum', 'plasma', 'urine', 'total', 'level', 'test', 'tests', 'presence', 'present',
  'ratio', 'count', 'counts', 'concentration', 'mass', 'volume', 'fraction', 'quantitative',
  'qualitative', 'screen', 'panel', 'value', 'result', 'chemistry', 'acid', 'in', 'of', 'by', 'or', 'and',
  // Italian
  'sangue', 'siero', 'plasma', 'urina', 'urine', 'totale', 'totali', 'livello', 'livelli', 'presenza',
  'rapporto', 'conta', 'conteggio', 'concentrazione', 'massa', 'frazione', 'chimica', 'esame', 'valore',
  'acido', 'di', 'del', 'della', 'nel', 'nelle', 'nei', 'su', 'e', 'o',
]);

/** Whether a word (lowercase) names a sample, a kind of quantity or result, or joins words, rather than a test */
export function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word);
}

const CONJUNCTIONS: ReadonlySet<string> = new Set(['and', 'or', 'e', 'o']);

/** Score of a test whose words cover the whole query without a name equal to it */
const OVERLAP_CEILING = 0.9;

/**
 * A query word found only as a close form of a name word ("urico" for
 * "uric") counts for this much of that word
 */
const CLOSE_FORM_FACTOR = 0.8;
/**
 * A word's form without one final vowel: "proteine", "proteina" and
 * "protein" are one word. A short word is only itself here: "ferr", an
 * abbreviation of ferritin, is not "ferro" (iron).
 */
function inflectionStem(word: string): string {
  if (word.length <= MIN_STEM) return `=${word}`;
  return /[aeio]$/.test(word) ? word.slice(0, -1) : word;
}

/** Shortest stem a close form is read from */
const MIN_STEM = 4;
/** Most letters a close form may add to its stem (Italian endings) */
const MAX_ENDING = 2;

/**
 * A name's words. "Non" is one word with the word it negates: a
 * "non-squamous" cell is no squamous one, and "non-HDL" cholesterol no HDL.
 */
function wordsOf(name: string): string[] {
  return name
    .replace(/(?<![\p{L}\p{N}])non[\s-]+(?=\p{L})/giu, 'non')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * A word a query writes shortened with a full stop: "Ep." of "Cellule Ep.
 * Squamose". A full stop inside a name ("Epithelial cells.squamous") joins
 * words, so only one before a space or the end shortens.
 */
const SHORTENED_WORD = /(?<![\p{L}\p{N}])(\p{L}{2,4})\.(?=\s|$)/gu;
/** Most tests looked through for the readings of a shortened word */
const MAX_SHORTENED_POOL = 2000;

/** Whether one word is the other with a short ending: "uric" and "urico" */
function isCloseForm(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= MIN_STEM && long.length - short.length <= MAX_ENDING && long.startsWith(short);
}

/**
 * Whether a LOINC parent group joins mass and molar codes: the property is
 * not among what its members share, and it is limited to mass and substance
 * concentrations ("MassMolConc<SAME:Comp|Tm|Sys|Meth><Prop:MCncORSCncORMSCnc>")
 */
function joinsMassAndMolar(parentName: string): boolean {
  const same = parentName.match(/<SAME:([^>]*)>/)?.[1];
  const property = parentName.match(/<Prop:([^>]*)>/)?.[1];
  return (
    same !== undefined &&
    !same.includes('Prop') &&
    property !== undefined &&
    property.includes('MCnc') &&
    property.includes('SCnc')
  );
}

/**
 * A group's name with its property left out, for the groups LOINC keeps
 * apart although they hold one quantity, as it does not for concentrations:
 * a rate's mass and moles ("Creatinine|MRat|Urine" and "Creatinine|SRat|
 * Urine", a day's amount), and a ratio's mass per mass and per amount
 * ("Protein/Creatinine|MRto|Urine" and "Protein/Creatinine|Ratio|Urine",
 * mg/g and mg/mmol of creatinine). A ratio joins only through the groups
 * of a component, property and sample, which roll up time and method.
 */
function jointKey(group: CatalogGroup): string | undefined {
  const [component, property, ...rest] = group.name.split('|');
  // Only through the groups of a component, property and sample, as for a ratio: "Phosphate|MRat|24H|ANYUrine" has no molar twin
  if ((property === 'MRat' || property === 'SRat') && rest.length === 1) return ['rate', component, ...rest].join('|');
  if ((property === 'MRto' || property === 'Ratio') && rest.length === 1) return ['ratio', component, ...rest].join('|');
  return undefined;
}

/**
 * A LOINC property with mass and molar alike: MCnc and SCnc are both
 * "Cnc", MRat and SRat "Rat"; a ratio to creatinine in mg/g (MRto) and in
 * mg/mmol (Ratio) both "Rto"
 */
export function quantityKind(property: string): string {
  if (property === 'Ratio') return 'Rto';
  return /^[MS](?:Cnc|Rat|Cnt|Rto)$/.test(property) ? property.slice(1) : property;
}

/** Whether a group joins a test's blood, serum and plasma codes */
function joinsSampleTypes(group: CatalogGroup): boolean {
  return group.name.includes('ANYBldSerPl');
}

/** Whether a test is a panel of tests, never one value */
export function isPanel(test: CatalogTest): boolean {
  return test.classCode.startsWith('PANEL.');
}

/** Whether a test is of a 24-hour urine collection: "... in 24 hour Urine" */
export function isDayUrine(test: CatalogTest): boolean {
  return test.system === 'Urine' && /\b24 ?(?:hour|hr|h) urine\b/i.test(test.name);
}

/** Lower rank first; an unranked test (0) last; equal ranks by code */
export function byRank(a: CatalogTest, b: CatalogTest): number {
  const rank = (test: CatalogTest): number => test.rank || Number.POSITIVE_INFINITY;
  return rank(a) - rank(b) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
}

/** A catalog file's name search, and its lookup of tests by one of their names */
interface Search {
  scoredSearch(query: string, filter?: CatalogSearchFilter): ScoredTest[];
  named(name: string): CatalogTest[];
}

/** Absorbs float error when a test's covered weight is compared with the query's */
const WEIGHT_EPSILON = 1e-9;
/**
 * How much a query's words count when no single name of a test holds them
 * all: less than any name holding them, so a test that only pools them
 * from several names never fits as well as one that has them together
 */
const SPREAD_FACTOR = 0.9;

/**
 * The name search over a catalog file. Its indexes are the costliest part
 * of the catalog to build, so they are built on the first search, not with
 * the catalog: most screens only look tests up by code.
 *
 * HemoIO's own names of a test (by code, see TestAddon.names) are names of
 * it as a whole, never a source of single words: a query fits one only
 * when it holds every telling word of it ("volume piastrinico medio" is
 * MPV, "volume medio" is not).
 */
function createSearch(file: CatalogFile, curated: ReadonlyMap<string, ReadonlySet<string>> = new Map()): Search {
  // The long common name counts too ("Hematocrit", "Specific gravity")
  const namesOf = (index: number): string[] => [...file.tests[index].names, nameKey(file.tests[index].name)];
  const testsByName = new Map<string, number[]>();
  const testsByWord = new Map<string, number[]>();
  const add = (map: Map<string, number[]>, key: string, index: number): void => {
    const list = map.get(key);
    if (!list) map.set(key, [index]);
    else if (list[list.length - 1] !== index) list.push(index);
  };
  /**
   * Words of LOINC's short names that no long common name has ("calc" of
   * "Globulin Ser calc-mCnc"): abbreviations, which a longer word is never
   * a form of
   */
  const shortNameWords = new Set<string>();
  const longNameWords = new Set<string>();
  // HemoIO's names, each with the tests it names
  const curatedNames = new Map<string, number[]>();
  file.tests.forEach((test, index) => {
    const own = curated.get(test.code);
    for (const name of namesOf(index)) {
      add(testsByName, name, index);
      if (own?.has(name)) add(curatedNames, name, index);
      else for (const word of wordsOf(name)) add(testsByWord, word, index);
    }
    for (const word of wordsOf(nameKey(test.shortName))) shortNameWords.add(word);
    for (const word of wordsOf(nameKey(test.name))) longNameWords.add(word);
  });
  const isAbbreviation = (word: string): boolean => shortNameWords.has(word) && !longNameWords.has(word);
  const genericCount = Math.max(MIN_GENERIC_COUNT, file.tests.length * GENERIC_SHARE);
  // A number is in many names but tells "Alpha 1" from "Alpha 2" globulin
  const tellsTest = (word: string): boolean =>
    !STOP_WORDS.has(word) && (/^\d+$/.test(word) || (testsByWord.get(word)?.length ?? 0) <= genericCount);
  // Rarer words tell more about the test: inverse document frequency
  const weightOf = (word: string): number =>
    Math.log(1 + file.tests.length / (testsByWord.get(word)?.length ?? 1));

  // Name words by their first letters, for finding close forms
  const wordsByStem = new Map<string, string[]>();
  for (const word of testsByWord.keys()) {
    if (word.length < MIN_STEM || !tellsTest(word) || isAbbreviation(word)) continue;
    const stem = word.slice(0, MIN_STEM);
    wordsByStem.set(stem, [...(wordsByStem.get(stem) ?? []), word]);
  }

  // Name words by their form without a final vowel
  const wordsByInflection = new Map<string, string[]>();
  for (const word of testsByWord.keys()) {
    const stem = inflectionStem(word);
    const forms = wordsByInflection.get(stem);
    if (forms) forms.push(word);
    else wordsByInflection.set(stem, [word]);
  }

  /**
   * A name's words, each without a final vowel, and without sample or
   * other stop words: a query with the same words is the name, whatever its
   * punctuation ("colesterolo.in hdl" for "Colesterolo HDL"). "And" and
   * "or" stay: "bilirubina diretta e totale" is not "Bilirubina diretta".
   */
  const wordsKey = (name: string): string =>
    wordsOf(name)
      .filter((word) => !STOP_WORDS.has(word) || CONJUNCTIONS.has(word))
      .map(inflectionStem)
      .join(' ');
  // HemoIO's names as the inflection stems of their telling words, and the words themselves
  const curatedWords = new Set([...curatedNames.keys()].flatMap((name) => wordsOf(name)));
  const curatedPhrases = [...curatedNames].map(([name, indexes]) => ({
    words: wordsOf(name).filter((word) => !STOP_WORDS.has(word)),
    // A name of a ratio by its parts ("colesterolo/hdl") is no name of the parts alone
    slash: name.includes('/'),
    indexes,
  }));

  // Built for a test the first time a search finds it
  const nameKeys: Set<string>[] = [];
  const nameKeysOf = (index: number): Set<string> => (nameKeys[index] ??= new Set(namesOf(index).map(wordsKey)));

  /** The name words a query word stands for, with how much each counts */
  function matchesOf(word: string): { word: string; factor: number }[] {
    const forms = new Set(wordsByInflection.get(inflectionStem(word)));
    // A short word with an ending, when no name has the word itself: "urico" for "uric", but "calci" not for "calc"
    const short = word.slice(0, -1);
    if (
      !testsByWord.has(word) &&
      /[aeio]$/.test(word) &&
      short.length <= MIN_STEM &&
      testsByWord.has(short) &&
      !isAbbreviation(short)
    ) {
      forms.add(short);
    }
    if (forms.size) return [...forms].map((form) => ({ word: form, factor: 1 }));
    return (wordsByStem.get(word.slice(0, MIN_STEM)) ?? [])
      .filter((candidate) => isCloseForm(word, candidate))
      .map((candidate) => ({ word: candidate, factor: CLOSE_FORM_FACTOR }));
  }

  /**
   * A word no name has, read as two name words written as one
   * ("alfafetoproteina" for "alfa" and "fetoproteina"), else itself
   */
  function partsOf(word: string): string[] {
    if (testsByWord.has(word) || curatedWords.has(word) || matchesOf(word).length) return [word];
    // A negation no name has joined to its word: "non" and the word it negates ("nontreponemal")
    const negated = word.match(/^non(\p{L}{4,})$/u)?.[1];
    if (negated) return ['non', ...partsOf(negated)];
    for (let cut = MIN_STEM; cut <= word.length - MIN_STEM; cut++) {
      const parts = [word.slice(0, cut), word.slice(cut)];
      if (parts.every((part) => testsByWord.has(part) && tellsTest(part))) return parts;
    }
    return [word];
  }

  const passes = (test: CatalogTest, filter: CatalogSearchFilter): boolean =>
    (!filter.properties || filter.properties.includes(test.property)) &&
    (!filter.systems || filter.systems.includes(test.system));

  /**
   * The tests a query of words in many tests ("IgG", "Immunoglobulin G")
   * names: those with the name it spells, else with a name of its words
   * ("IgE totali"), most common first. A query of such generic words names
   * no other test.
   */
  function namedByGenericWords(phrase: string, queryKey: string, filter: CatalogSearchFilter): ScoredTest[] {
    const lists = wordsOf(phrase)
      .filter((word) => !STOP_WORDS.has(word))
      .map((word) => testsByWord.get(word) ?? []);
    // Sample, quantity and other stop words never name a test
    if (lists.length === 0) return [];
    let named = testsByName.get(phrase) ?? [];
    if (named.length === 0) {
      const [shortest, ...others] = [...lists].sort((a, b) => a.length - b.length);
      const sets = others.map((list) => new Set(list));
      named = shortest.filter((index) => sets.every((set) => set.has(index)) && nameKeysOf(index).has(queryKey));
    }
    return named
      .map((index) => file.tests[index])
      .filter((test) => passes(test, filter))
      .sort(byRank)
      .map((test) => ({ test, score: 1 }));
  }

  /**
   * A query word as the names of a test are weighed against it: the forms
   * it stands for, and the tests one of HemoIO's names gives it to, which
   * hold it in each of their names, as such a name is one of the test as a
   * whole ("emoglobina glicata HbA1c")
   */
  interface QueryWord {
    matches: { word: string }[];
    named: ReadonlySet<number>;
  }

  /** Whether a name of a test holds a query word */
  const holds = (index: number, nameWords: Set<string>, { matches, named }: QueryWord): boolean =>
    named.has(index) || matches.some((match) => nameWords.has(match.word));

  /** Whether one of a test's names holds every query word, in a form the word stands for */
  const oneNameHoldsAll = (index: number, words: QueryWord[]): boolean =>
    namesOf(index).some((name) => {
      const nameWords = new Set(wordsOf(name));
      return words.every((word) => holds(index, nameWords, word));
    });

  /** The query words' weight that the test's best single name holds */
  const bestNameWeight = (index: number, words: QueryWord[], weights: number[]): number =>
    Math.max(
      ...namesOf(index).map((name) => {
        const nameWords = new Set(wordsOf(name));
        return words.reduce((sum, word, i) => (holds(index, nameWords, word) ? sum + weights[i] : sum), 0);
      })
    );

  /**
   * The words a query writes shortened with a full stop ("Ep." of "Cellule
   * Ep. Squamose") given the readings they may have, when no test the other
   * query words all fit has the word as written: the telling words they
   * begin in the names of those tests. Never readings of their own, which
   * could be any test's. Returns the words given readings.
   */
  function expandShortened(phrase: string, words: { word: string; matches: { word: string; factor: number }[] }[]): Set<string> {
    const expanded = new Set<string>();
    const shortened = new Set([...phrase.matchAll(SHORTENED_WORD)].map(([, word]) => word));
    const testsOf = (matches: { word: string }[]): Set<number> =>
      new Set(matches.flatMap((match) => testsByWord.get(match.word) ?? []));
    for (const entry of words) {
      if (!shortened.has(entry.word)) continue;
      const others = words.filter((other) => other !== entry);
      if (others.length === 0 || others.some(({ matches }) => matches.length === 0)) continue;
      const [fewest, ...rest] = others.map(({ matches }) => testsOf(matches)).sort((a, b) => a.size - b.size);
      if (fewest.size > MAX_SHORTENED_POOL) continue;
      const fit = [...fewest].filter((index) => rest.every((tests) => tests.has(index)));
      const asWritten = testsOf(entry.matches);
      if (fit.some((index) => asWritten.has(index))) continue;
      const readings = new Set<string>();
      for (const index of fit) {
        for (const name of namesOf(index)) {
          for (const word of wordsOf(name)) {
            if (word.length > entry.word.length && word.startsWith(entry.word) && tellsTest(word)) readings.add(word);
          }
        }
      }
      if (readings.size === 0) continue;
      entry.matches.push(...[...readings].map((word) => ({ word, factor: 1 })));
      expanded.add(entry.word);
    }
    return expanded;
  }

  function scoredSearch(query: string, filter: CatalogSearchFilter = {}): ScoredTest[] {
    const phrase = nameKey(query);
    const queryKey = wordsKey(phrase);
    // A query of sample, quantity or other generic words alone names no test, unless it is a name
    const words = [...new Set(wordsOf(phrase).flatMap(partsOf))]
      .filter(tellsTest)
      .map((word) => ({ word, matches: matchesOf(word), named: new Set<number>() }));
    if (words.length === 0) return namedByGenericWords(phrase, queryKey, filter);
    const expanded = expandShortened(phrase, words);
    // A word matching nothing still counts against the fit, as a rare word would
    // A word counts as much as it tells, in whichever form a name has it; a
    // shortened one as its most common reading, as it may stand for any
    const fullWeight = (word: string, matches: { word: string }[]): number =>
      testsByWord.has(word) || curatedWords.has(word) || !matches.length
        ? weightOf(word)
        : (expanded.has(word) ? Math.min : Math.max)(...matches.map((match) => weightOf(match.word)));
    const weights = words.map(({ word, matches }) => fullWeight(word, matches));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    // The tests of HemoIO's names whose every telling word the query holds, by the query words they hold
    // A word in too many names to tell a test ("a" of "A/G") still has to be in the query
    const stems = words.map(({ word }) => inflectionStem(word));
    const queryStems = new Set(wordsOf(phrase).flatMap(partsOf).map(inflectionStem));
    for (const phrase of curatedPhrases) {
      if (phrase.slash && !query.includes('/')) continue;
      if (!phrase.words.every((word) => queryStems.has(inflectionStem(word)))) continue;
      const held = phrase.words.map((word) => stems.indexOf(inflectionStem(word))).filter((i) => i !== -1);
      for (const i of held) for (const index of phrase.indexes) words[i].named.add(index);
    }

    // Each test's covered weight, from the lists of the name words it has
    const covered = new Map<number, number>();
    words.forEach(({ matches }, i) => {
      const best = new Map<number, number>();
      for (const match of matches) {
        for (const index of testsByWord.get(match.word) ?? []) {
          best.set(index, Math.max(best.get(index) ?? 0, match.factor));
        }
      }
      for (const index of words[i].named) best.set(index, 1);
      for (const [index, factor] of best) covered.set(index, (covered.get(index) ?? 0) + factor * weights[i]);
    });
    const scored: ScoredTest[] = [];
    // A name the query spells out comes before one with only the same words
    const spelledIndexes = new Set(testsByName.get(phrase));
    const spelled = new Set<CatalogTest>();
    for (const [index, pooled] of covered) {
      const test = file.tests[index];
      if (!passes(test, filter)) continue;
      const isSpelled = spelledIndexes.has(index);
      if (isSpelled) spelled.add(test);
      const isName = isSpelled || nameKeysOf(index).has(queryKey);
      // Words found each in another of a test's names ("beta" in one, "2" in another) are no name of it
      const weight =
        isName || pooled < totalWeight - WEIGHT_EPSILON || oneNameHoldsAll(index, words)
          ? pooled
          : Math.min(pooled, bestNameWeight(index, words, weights)) * SPREAD_FACTOR;
      const score = isName ? 1 : (OVERLAP_CEILING * weight) / totalWeight;
      scored.push({ test, score });
    }
    const spelledFirst = (a: ScoredTest, b: ScoredTest): number =>
      Number(spelled.has(b.test)) - Number(spelled.has(a.test));
    // On an equal fit a measured test before one calculated from others
    const calculatedLast = (a: ScoredTest, b: ScoredTest): number =>
      Number(a.test.method === 'Calculated') - Number(b.test.method === 'Calculated');
    scored.sort((a, b) => b.score - a.score || spelledFirst(a, b) || calculatedLast(a, b) || byRank(a.test, b.test));
    return scored;
  }

  return {
    scoredSearch,
    named: (name) => (testsByName.get(nameKey(name)) ?? []).map((index) => file.tests[index]),
  };
}

/** Names of tests by LOINC code */
export type NamesByCode = Readonly<Record<string, readonly string[] | undefined>>;

/** HemoIO's own names of the tests it describes (see TestAddon.names) */
function addonNames(): NamesByCode {
  return Object.fromEntries(Object.entries(TEST_ADDONS).map(([code, addon]) => [code, addon.names]));
}

/**
 * The file with the extra names of a code given to each test it trends
 * with, as a test's own names are: one name finds glucose in mg/dL and in
 * mmol/L alike
 */
function withExtraNames(
  file: CatalogFile,
  extraNames: NamesByCode,
  trendGroupOf: (code: string) => string,
  codesOf: (trendGroup: string) => string[]
): { file: CatalogFile; added: ReadonlyMap<string, ReadonlySet<string>> } {
  const added = new Map<string, Set<string>>();
  for (const [code, names] of Object.entries(extraNames)) {
    if (!names?.length) continue;
    for (const member of codesOf(trendGroupOf(code))) {
      added.set(member, new Set([...(added.get(member) ?? []), ...names.map(nameKey)]));
    }
  }
  if (added.size === 0) return { file, added };
  const tests = file.tests.map((test) => {
    const names = added.get(test.code);
    return names ? { ...test, names: [...new Set([...test.names, ...names])] } : test;
  });
  return { file: { ...file, tests }, added };
}

/**
 * The runtime catalog over a catalog file; lookups by code and the trend
 * groups are built here. The extra names (by default HemoIO's own, see
 * TestAddon.names) count as names of the tests.
 */
export function createCatalog(source: CatalogFile, extraNames: NamesByCode = addonNames()): Catalog {
  const groups = new Map(source.groups.map((group) => [group.id, group]));

  // A rate's, or a ratio's, mass and molar groups trend as the first of them
  const jointGroups = new Map<string, string>();
  for (const group of [...source.groups].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const key = jointKey(group);
    if (key && !jointGroups.has(key)) jointGroups.set(key, group.id);
  }

  const membersOf = new Map<string, number>();
  for (const id of source.tests.flatMap((test) => test.groups)) membersOf.set(id, (membersOf.get(id) ?? 0) + 1);

  const trendGroups = new Map<string, string>();
  const codesByTrendGroup = new Map<string, string[]>();
  for (const test of source.tests) {
    const memberships = test.groups
      .map((id) => groups.get(id))
      .filter((group): group is CatalogGroup => group !== undefined)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    // A mass and molar group joins a code only to others: alone in it, the code trends with its other samples' codes
    const massAndMolar = memberships.find(
      (candidate) => joinsMassAndMolar(candidate.parentName) && (membersOf.get(candidate.id) ?? 0) > 1
    );
    const joint = memberships.map(jointKey).find((key) => key !== undefined);
    const sampleTypes = memberships.find(joinsSampleTypes);
    const trend = massAndMolar?.id ?? (joint && jointGroups.get(joint)) ?? sampleTypes?.id ?? test.code;
    trendGroups.set(test.code, trend);
    const codes = codesByTrendGroup.get(trend);
    if (codes) codes.push(test.code);
    else codesByTrendGroup.set(trend, [test.code]);
  }

  const trendGroupOf = (code: string): string => trendGroups.get(code) ?? code;
  const { file, added } = withExtraNames(source, extraNames, trendGroupOf, (trend) => codesByTrendGroup.get(trend) ?? [trend]);
  const tests = new Map(file.tests.map((test) => [test.code, test]));

  // Built the first time a long name is looked up
  let longNames: Map<string, CatalogTest> | undefined;
  const byLongName = (name: string): CatalogTest | undefined => {
    longNames ??= new Map([...file.tests].reverse().map((test) => [nameKey(test.name), test]));
    return longNames.get(nameKey(name));
  };

  let search: Search | undefined;
  const scoredSearch = (query: string, filter?: CatalogSearchFilter): ScoredTest[] =>
    (search ??= createSearch(file, added)).scoredSearch(query, filter);

  // Tests that are one value, most common first: built the first time common tests are asked for
  let byCommonness: CatalogTest[] | undefined;
  function common({ properties, systems }: CatalogSearchFilter, limit: number): CatalogTest[] {
    byCommonness ??= file.tests.filter((test) => !isPanel(test)).sort(byRank);
    const found: CatalogTest[] = [];
    for (const test of byCommonness) {
      if (found.length >= limit) break;
      if ((!properties || properties.includes(test.property)) && (!systems || systems.includes(test.system))) {
        found.push(test);
      }
    }
    return found;
  }

  return {
    version: file.version,
    test: (code) => tests.get(code),
    search: (query, filter) => scoredSearch(query, filter).map(({ test }) => test),
    scoredSearch,
    common,
    byLongName,
    named: (name) => (search ??= createSearch(file, added)).named(name),
    trendGroup: trendGroupOf,
    classLabel: (classCode) => CLASS_LABELS[classCode] ?? classCode,
    groupCodes: (trendGroup) =>
      codesByTrendGroup.get(trendGroup) ?? (tests.has(trendGroup) ? [trendGroup] : []),
  };
}

/** Where the catalog file is served; a build emits it as an asset of its own */
const CATALOG_URL = new URL('./catalog.generated.json', import.meta.url).href;

/**
 * The catalog file. Fetched, not imported: a browser keeps a failed
 * import() failed for as long as the page is open, so trying again could
 * never load it, while a failed fetch is tried afresh. Tests run in Node,
 * which cannot fetch a file: URL, so they import it.
 */
async function readCatalogFile(): Promise<CatalogFile> {
  if (import.meta.env.MODE === 'test') {
    return (await import('./catalog.generated.json')).default as CatalogFile;
  }
  const response = await fetch(CATALOG_URL);
  if (!response.ok) throw new Error(`The test catalog could not be fetched (HTTP ${response.status})`);
  return (await response.json()) as CatalogFile;
}

let loading: Promise<Catalog> | undefined;

/**
 * The catalog, loaded on first call and shared after. A failed load is not
 * kept, so the next call tries again.
 */
export function loadCatalog(): Promise<Catalog> {
  loading ??= readCatalogFile()
    .then(createCatalog)
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}
