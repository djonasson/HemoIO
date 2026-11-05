/**
 * What the biomarker dictionary lists: the tests HemoIO describes and the
 * tests the user has values for, each once (codes that trend together are
 * one test), grouped by LOINC class. A search also finds any other test in
 * the LOINC catalog.
 */
import { TEST_ADDONS } from '@data/loinc/addons';
import { nameKey } from '@data/loinc/keys';
import { testDescription, testDisplayName, trendCode } from '@data/loinc/display';
import type { Catalog } from '@data/loinc/catalog';

export interface DictionaryEntry {
  /** The test's trend code */
  code: string;
  name: string;
  /** HemoIO's description, else LOINC's long name */
  summary: string;
  classLabel: string;
}

export interface DictionaryGroup {
  classLabel: string;
  entries: DictionaryEntry[];
}

/** Most catalog tests a search lists after the matching listed ones */
const MAX_CATALOG_RESULTS = 50;

/** One entry for a code, under its trend code; undefined for a code not in the catalog */
export function dictionaryEntry(catalog: Catalog, code: string): DictionaryEntry | undefined {
  const test = catalog.test(trendCode(catalog, code));
  if (!test) return undefined;
  return {
    code: test.code,
    name: testDisplayName(catalog, { biomarkerKey: test.code }),
    summary: testDescription(catalog, test.code) ?? test.name,
    classLabel: catalog.classLabel(test.classCode),
  };
}

const byName = (a: DictionaryEntry, b: DictionaryEntry): number => a.name.localeCompare(b.name);

/** The described tests plus the tests of the given value keys, each once, by name */
export function dictionaryEntries(catalog: Catalog, valueKeys: Iterable<string>): DictionaryEntry[] {
  const entries = new Map<string, DictionaryEntry>();
  for (const code of [...Object.keys(TEST_ADDONS), ...valueKeys]) {
    const entry = dictionaryEntry(catalog, code);
    if (entry && !entries.has(entry.code)) entries.set(entry.code, entry);
  }
  return [...entries.values()].sort(byName);
}

/** The entries by LOINC class, classes in alphabetical order */
export function groupByClass(entries: ReadonlyArray<DictionaryEntry>): DictionaryGroup[] {
  const groups = new Map<string, DictionaryEntry[]>();
  for (const entry of entries) {
    const members = groups.get(entry.classLabel);
    if (members) members.push(entry);
    else groups.set(entry.classLabel, [entry]);
  }
  return [...groups]
    .map(([classLabel, members]) => ({ classLabel, entries: members }))
    .sort((a, b) => a.classLabel.localeCompare(b.classLabel));
}

/**
 * The listed entries whose name holds the query, then the catalog's tests
 * that fit it, best first; each test once
 */
export function searchDictionary(
  catalog: Catalog,
  listed: ReadonlyArray<DictionaryEntry>,
  query: string
): DictionaryEntry[] {
  const wanted = nameKey(query);
  if (!wanted) return [];
  const found = new Map<string, DictionaryEntry>();
  for (const entry of listed) {
    if (nameKey(entry.name).includes(wanted)) found.set(entry.code, entry);
  }
  let added = 0;
  for (const test of catalog.search(wanted)) {
    if (added >= MAX_CATALOG_RESULTS) break;
    const entry = dictionaryEntry(catalog, test.code);
    if (entry && !found.has(entry.code)) {
      found.set(entry.code, entry);
      added++;
    }
  }
  return [...found.values()];
}
