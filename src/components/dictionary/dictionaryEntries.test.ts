import { describe, expect, it } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { dictionaryEntries, dictionaryEntry, groupByClass, searchDictionary } from './dictionaryEntries';

const catalog = fixtureCatalog();

describe('dictionaryEntries', () => {
  it('groups by LOINC class and searches the catalog', () => {
    const entries = dictionaryEntries(catalog, []);
    const groups = groupByClass(entries);
    expect(groups.map((group) => group.classLabel)).toEqual(
      [...new Set(groups.map((group) => group.classLabel))].sort((a, b) => a.localeCompare(b))
    );
    const chemistry = groups.find((group) => group.classLabel === 'Chemistry')!;
    expect(chemistry.entries.map((entry) => entry.name)).toContain('Glucose');
    const hematology = groups.find((group) => group.classLabel === 'Hematology')!;
    expect(hematology.entries.map((entry) => entry.name)).toContain('Hemoglobin');

    // 2339-0, glucose in blood, has no description: listed only when searched
    expect(entries.map((entry) => entry.code)).not.toContain('2339-0');
    const found = searchDictionary(catalog, entries, 'glucose');
    expect(found[0]).toMatchObject({ code: '2345-7', name: 'Glucose' });
    expect(found.map((entry) => entry.code)).toContain('2339-0');
  });

  it('lists each test once, whatever codes of its trend group are given', () => {
    const codes = dictionaryEntries(catalog, ['14749-6', '2345-7']).map((entry) => entry.code);
    expect(codes.filter((code) => code === '2345-7')).toHaveLength(1);
    expect(codes).not.toContain('14749-6');
  });

  it('lists a test the user has values for although HemoIO does not describe it', () => {
    const entry = dictionaryEntries(catalog, ['2339-0']).find((listed) => listed.code === '2339-0');
    const test = catalog.test('2339-0')!;
    // No description: LOINC's long name in its place
    expect(entry).toEqual({
      code: '2339-0',
      name: test.shortName || test.name,
      summary: test.name,
      classLabel: catalog.classLabel(test.classCode),
    });
  });

  it('lists no value that is not a LOINC test', () => {
    expect(dictionaryEntry(catalog, 'unknown:zorblatina')).toBeUndefined();
    expect(dictionaryEntries(catalog, ['unknown:zorblatina']).map((entry) => entry.code)).not.toContain(
      'unknown:zorblatina'
    );
  });

  it('ignores case and extra spaces in a search, and finds nothing for an empty one', () => {
    const entries = dictionaryEntries(catalog, []);
    expect(searchDictionary(catalog, entries, '  GLUCOSE  ')[0].code).toBe('2345-7');
    expect(searchDictionary(catalog, entries, '   ')).toEqual([]);
  });
});
