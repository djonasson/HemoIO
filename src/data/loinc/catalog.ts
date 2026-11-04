/**
 * The app's LOINC catalog at runtime: the tests and groups generated from the
 * local LOINC release by scripts/loinc-catalog.mjs, with lookups by code,
 * name search, and the trend groups that join closely related codes.
 *
 * The data file is large (about 13 MB), so it is loaded on first use as its
 * own chunk and never with the app's start.
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

export interface Catalog {
  /** The LOINC release the catalog was generated from */
  version: string;
  test(code: string): CatalogTest | undefined;
  /**
   * Tests whose names fit the query, best first. A name equal to the query
   * scores 1, shared words score below 1; ties go to the more common test.
   */
  search(query: string, filter?: CatalogSearchFilter): CatalogTest[];
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
};

/**
 * A word in more than this share of tests ("serum", "chemistry", "level")
 * says nothing about which test is meant, so search ignores it
 */
const GENERIC_SHARE = 0.05;
/** ...but a small catalog has no generic words */
const MIN_GENERIC_COUNT = 50;

/** Score of a test whose words cover the whole query without a name equal to it */
const OVERLAP_CEILING = 0.9;

/** A name as the generator normalised it (same rule as nameKey in the dictionary) */
function normalise(name: string): string {
  return name.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function wordsOf(name: string): string[] {
  return name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
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

  const wordSets = file.tests.map((test) => new Set(test.names.flatMap(wordsOf)));
  const testsByWord = new Map<string, number[]>();
  wordSets.forEach((words, index) => {
    for (const word of words) {
      const list = testsByWord.get(word);
      if (list) list.push(index);
      else testsByWord.set(word, [index]);
    }
  });
  const genericCount = Math.max(MIN_GENERIC_COUNT, file.tests.length * GENERIC_SHARE);
  // Rarer words tell more about the test: inverse document frequency
  const weightOf = (word: string): number =>
    Math.log(1 + file.tests.length / (testsByWord.get(word)?.length ?? 1));

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

  function search(query: string, filter: CatalogSearchFilter = {}): CatalogTest[] {
    const phrase = normalise(query);
    const words = [...new Set(wordsOf(phrase))].filter(
      (word) => (testsByWord.get(word)?.length ?? 0) <= genericCount
    );
    if (words.length === 0) return [];
    const totalWeight = words.reduce((sum, word) => sum + weightOf(word), 0);

    const candidates = new Set(words.flatMap((word) => testsByWord.get(word) ?? []));
    const scored: { test: CatalogTest; score: number }[] = [];
    for (const index of candidates) {
      const test = file.tests[index];
      if (filter.properties && !filter.properties.includes(test.property)) continue;
      if (filter.systems && !filter.systems.includes(test.system)) continue;
      const score = test.names.includes(phrase)
        ? 1
        : (OVERLAP_CEILING *
            words.filter((word) => wordSets[index].has(word)).reduce((sum, word) => sum + weightOf(word), 0)) /
          totalWeight;
      scored.push({ test, score });
    }
    scored.sort((a, b) => b.score - a.score || byRank(a.test, b.test));
    return scored.map(({ test }) => test);
  }

  return {
    version: file.version,
    test: (code) => tests.get(code),
    search,
    trendGroup: (code) => trendGroups.get(code) ?? code,
    classLabel: (classCode) => CLASS_LABELS[classCode] ?? classCode,
    groupCodes: (trendGroup) =>
      codesByTrendGroup.get(trendGroup) ?? (tests.has(trendGroup) ? [trendGroup] : []),
  };
}

let loading: Promise<Catalog> | undefined;
let loaded: Catalog | undefined;

/**
 * The catalog, loaded on first call and shared after. A failed load is not
 * kept, so the next call tries again.
 */
export function loadCatalog(): Promise<Catalog> {
  loading ??= import('./catalog.generated.json')
    .then((module) => {
      loaded = createCatalog(module.default as CatalogFile);
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
