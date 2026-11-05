/**
 * The app's LOINC catalog at runtime: the tests and groups generated from the
 * local LOINC release by scripts/loinc-catalog.mjs, with lookups by code,
 * name search, and the trend groups that join closely related codes.
 *
 * The data file is large (about 13 MB), so it is fetched on first use as a
 * file of its own and never with the app's start.
 */
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
  /**
   * What a code trends with: the group joining its mass and molar codes
   * (for a rate, its mass and molar rate groups), else the group joining
   * its blood, serum and plasma codes, else the code
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

function wordsOf(name: string): string[] {
  return name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

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
  if (property === 'MRat' || property === 'SRat') return ['rate', component, ...rest].join('|');
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

/**
 * The name search over a catalog file. Its indexes are the costliest part
 * of the catalog to build, so they are built on the first search, not with
 * the catalog: most screens only look tests up by code.
 */
function createSearch(file: CatalogFile): (query: string, filter?: CatalogSearchFilter) => ScoredTest[] {
  // The long common name's words count too ("Hematocrit", "Specific gravity")
  const exactNames = file.tests.map((test) => new Set([...test.names, nameKey(test.name)]));
  const testsByWord = new Map<string, number[]>();
  exactNames.forEach((names, index) => {
    for (const word of new Set([...names].flatMap(wordsOf))) {
      const list = testsByWord.get(word);
      if (list) list.push(index);
      else testsByWord.set(word, [index]);
    }
  });
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
    if (word.length < MIN_STEM || !tellsTest(word)) continue;
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
  // Built for a test the first time a search finds it
  const nameKeys: Set<string>[] = [];
  const nameKeysOf = (index: number): Set<string> =>
    (nameKeys[index] ??= new Set([...exactNames[index]].map(wordsKey)));

  /** The name words a query word stands for, with how much each counts */
  function matchesOf(word: string): { word: string; factor: number }[] {
    const forms = new Set(wordsByInflection.get(inflectionStem(word)));
    // A short word with an ending, when no name has the word itself: "urico" for "uric"
    const short = word.slice(0, -1);
    if (!testsByWord.has(word) && /[aeio]$/.test(word) && short.length <= MIN_STEM && testsByWord.has(short)) {
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
    if (testsByWord.has(word) || matchesOf(word).length) return [word];
    for (let cut = MIN_STEM; cut <= word.length - MIN_STEM; cut++) {
      const parts = [word.slice(0, cut), word.slice(cut)];
      if (parts.every((part) => testsByWord.has(part) && tellsTest(part))) return parts;
    }
    return [word];
  }

  function scoredSearch(query: string, filter: CatalogSearchFilter = {}): ScoredTest[] {
    const phrase = nameKey(query);
    // A query of sample, quantity or other generic words alone names no test
    const words = [...new Set(wordsOf(phrase).flatMap(partsOf))].filter(tellsTest).map((word) => ({
      word,
      matches: matchesOf(word),
    }));
    if (words.length === 0) return [];
    const queryKey = wordsKey(phrase);
    // A word matching nothing still counts against the fit, as a rare word would
    // A word counts as much as it tells, in whichever form a name has it
    const fullWeight = (word: string, matches: { word: string }[]): number =>
      testsByWord.has(word) || !matches.length
        ? weightOf(word)
        : Math.max(...matches.map((match) => weightOf(match.word)));
    const weights = words.map(({ word, matches }) => fullWeight(word, matches));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    // Each test's covered weight, from the lists of the name words it has
    const covered = new Map<number, number>();
    words.forEach(({ matches }, i) => {
      const best = new Map<number, number>();
      for (const match of matches) {
        for (const index of testsByWord.get(match.word) ?? []) {
          best.set(index, Math.max(best.get(index) ?? 0, match.factor));
        }
      }
      for (const [index, factor] of best) covered.set(index, (covered.get(index) ?? 0) + factor * weights[i]);
    });
    const scored: ScoredTest[] = [];
    // A name the query spells out comes before one with only the same words
    const spelled = new Set<CatalogTest>();
    for (const [index, weight] of covered) {
      const test = file.tests[index];
      if (filter.properties && !filter.properties.includes(test.property)) continue;
      if (filter.systems && !filter.systems.includes(test.system)) continue;
      const isSpelled = exactNames[index].has(phrase);
      if (isSpelled) spelled.add(test);
      const isName = isSpelled || nameKeysOf(index).has(queryKey);
      const score = isName ? 1 : (OVERLAP_CEILING * weight) / totalWeight;
      scored.push({ test, score });
    }
    const spelledFirst = (a: ScoredTest, b: ScoredTest): number =>
      Number(spelled.has(b.test)) - Number(spelled.has(a.test));
    scored.sort((a, b) => b.score - a.score || spelledFirst(a, b) || byRank(a.test, b.test));
    return scored;
  }

  return scoredSearch;
}

/** The runtime catalog over a catalog file; lookups by code and the trend groups are built here */
export function createCatalog(file: CatalogFile): Catalog {
  const tests = new Map(file.tests.map((test) => [test.code, test]));
  const groups = new Map(file.groups.map((group) => [group.id, group]));

  // A rate's, or a ratio's, mass and molar groups trend as the first of them
  const jointGroups = new Map<string, string>();
  for (const group of [...file.groups].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const key = jointKey(group);
    if (key && !jointGroups.has(key)) jointGroups.set(key, group.id);
  }

  const trendGroups = new Map<string, string>();
  const codesByTrendGroup = new Map<string, string[]>();
  for (const test of file.tests) {
    const memberships = test.groups
      .map((id) => groups.get(id))
      .filter((group): group is CatalogGroup => group !== undefined)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const massAndMolar = memberships.find((candidate) => joinsMassAndMolar(candidate.parentName));
    const joint = memberships.map(jointKey).find((key) => key !== undefined);
    const sampleTypes = memberships.find(joinsSampleTypes);
    const trend = massAndMolar?.id ?? (joint && jointGroups.get(joint)) ?? sampleTypes?.id ?? test.code;
    trendGroups.set(test.code, trend);
    const codes = codesByTrendGroup.get(trend);
    if (codes) codes.push(test.code);
    else codesByTrendGroup.set(trend, [test.code]);
  }

  // Built the first time a long name is looked up
  let longNames: Map<string, CatalogTest> | undefined;
  const byLongName = (name: string): CatalogTest | undefined => {
    longNames ??= new Map([...file.tests].reverse().map((test) => [nameKey(test.name), test]));
    return longNames.get(nameKey(name));
  };

  let search: ReturnType<typeof createSearch> | undefined;
  const scoredSearch = (query: string, filter?: CatalogSearchFilter): ScoredTest[] =>
    (search ??= createSearch(file))(query, filter);

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
    trendGroup: (code) => trendGroups.get(code) ?? code,
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
