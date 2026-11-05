/**
 * The app's LOINC catalog at runtime: the tests and groups generated from the
 * local LOINC release by scripts/loinc-catalog.mjs, with lookups by code,
 * name search, and the trend groups that join closely related codes.
 *
 * The data file is large (about 13 MB), so it is fetched on first use as a
 * file of its own and never with the app's start.
 */

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
  /**
   * What a code trends with: the group joining its mass and molar codes,
   * else the group joining its blood, serum and plasma codes, else the code
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

/** Score of a test whose words cover the whole query without a name equal to it */
const OVERLAP_CEILING = 0.9;

/**
 * A query word found only as a close form of a name word ("urico" for
 * "uric") counts for this much of that word
 */
const CLOSE_FORM_FACTOR = 0.8;
/** Shortest stem a close form is read from */
const MIN_STEM = 4;
/** Most letters a close form may add to its stem (Italian endings) */
const MAX_ENDING = 2;

/** A name as the generator normalised it (same rule as nameKey in keys.ts) */
function normalise(name: string): string {
  return name.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

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

/** Whether a group joins a test's blood, serum and plasma codes */
function joinsSampleTypes(group: CatalogGroup): boolean {
  return group.name.includes('ANYBldSerPl');
}

/** Lower rank first; an unranked test (0) last */
function byRank(a: CatalogTest, b: CatalogTest): number {
  const rank = (test: CatalogTest): number => test.rank || Number.POSITIVE_INFINITY;
  return rank(a) - rank(b) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
}

/** The runtime catalog over a catalog file; indexes are built once here */
export function createCatalog(file: CatalogFile): Catalog {
  const tests = new Map(file.tests.map((test) => [test.code, test]));
  const groups = new Map(file.groups.map((group) => [group.id, group]));

  // The long common name's words count too ("Hematocrit", "Specific gravity")
  const exactNames = file.tests.map((test) => new Set([...test.names, normalise(test.name)]));
  const wordSets = exactNames.map((names) => new Set([...names].flatMap(wordsOf)));
  const testsByWord = new Map<string, number[]>();
  wordSets.forEach((words, index) => {
    for (const word of words) {
      const list = testsByWord.get(word);
      if (list) list.push(index);
      else testsByWord.set(word, [index]);
    }
  });
  const genericCount = Math.max(MIN_GENERIC_COUNT, file.tests.length * GENERIC_SHARE);
  const tellsTest = (word: string): boolean =>
    !STOP_WORDS.has(word) && (testsByWord.get(word)?.length ?? 0) <= genericCount;
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

  /** The name words a query word stands for, with how much each counts */
  function matchesOf(word: string): { word: string; factor: number }[] {
    if (testsByWord.has(word)) return [{ word, factor: 1 }];
    return (wordsByStem.get(word.slice(0, MIN_STEM)) ?? [])
      .filter((candidate) => isCloseForm(word, candidate))
      .map((candidate) => ({ word: candidate, factor: CLOSE_FORM_FACTOR }));
  }

  const trendGroups = new Map<string, string>();
  const codesByTrendGroup = new Map<string, string[]>();
  for (const test of file.tests) {
    const memberships = test.groups
      .map((id) => groups.get(id))
      .filter((group): group is CatalogGroup => group !== undefined)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const group =
      memberships.find((candidate) => joinsMassAndMolar(candidate.parentName)) ??
      memberships.find(joinsSampleTypes);
    const trend = group?.id ?? test.code;
    trendGroups.set(test.code, trend);
    const codes = codesByTrendGroup.get(trend);
    if (codes) codes.push(test.code);
    else codesByTrendGroup.set(trend, [test.code]);
  }

  function scoredSearch(query: string, filter: CatalogSearchFilter = {}): ScoredTest[] {
    const phrase = normalise(query);
    // A query of sample, quantity or other generic words alone names no test
    const words = [...new Set(wordsOf(phrase))].filter(tellsTest).map((word) => ({
      word,
      matches: matchesOf(word),
    }));
    if (words.length === 0) return [];
    // A word matching nothing still counts against the fit, as a rare word would
    const fullWeight = (matches: { word: string }[]): number =>
      matches.length ? Math.max(...matches.map((match) => weightOf(match.word))) : weightOf('');
    const totalWeight = words.reduce((sum, { matches }) => sum + fullWeight(matches), 0);

    const candidates = new Set(
      words.flatMap(({ matches }) => matches.flatMap((match) => testsByWord.get(match.word) ?? []))
    );
    const scored: ScoredTest[] = [];
    for (const index of candidates) {
      const test = file.tests[index];
      if (filter.properties && !filter.properties.includes(test.property)) continue;
      if (filter.systems && !filter.systems.includes(test.system)) continue;
      let covered = 0;
      for (const { matches } of words) {
        const present = matches.filter((match) => wordSets[index].has(match.word));
        if (present.length) covered += Math.max(...present.map((m) => m.factor * weightOf(m.word)));
      }
      const score = exactNames[index].has(phrase) ? 1 : (OVERLAP_CEILING * covered) / totalWeight;
      scored.push({ test, score });
    }
    scored.sort((a, b) => b.score - a.score || byRank(a.test, b.test));
    return scored;
  }

  return {
    version: file.version,
    test: (code) => tests.get(code),
    search: (query, filter) => scoredSearch(query, filter).map(({ test }) => test),
    scoredSearch,
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
let loaded: Catalog | undefined;

/**
 * The catalog, loaded on first call and shared after. A failed load is not
 * kept, so the next call tries again.
 */
export function loadCatalog(): Promise<Catalog> {
  loading ??= readCatalogFile()
    .then((file) => {
      loaded = createCatalog(file);
      return loaded;
    })
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}

/**
 * The catalog if it has loaded, for code that cannot wait for it. Everything
 * inside the unlocked app renders after it has loaded (see CatalogProvider).
 */
export function loadedCatalog(): Catalog | undefined {
  return loaded;
}
