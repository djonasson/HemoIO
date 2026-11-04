import { describe, expect, it } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { createCatalog, loadCatalog } from './catalog';
import type { CatalogTest } from './catalog';

const catalog = fixtureCatalog();

/** A made-up test, for cases the fixture release does not have */
function madeUpTest(code: string, names: string[], rank = 1): CatalogTest {
  return {
    code,
    name: code,
    shortName: code,
    component: code,
    property: 'MCnc',
    system: 'Ser/Plas',
    scale: 'Qn',
    method: '',
    classCode: 'CHEM',
    names,
    units: [],
    rank,
    groups: [],
  };
}

describe('test', () => {
  it('finds a test by code, with its long common name', () => {
    expect(catalog.test('2345-7')?.name).toBe('Glucose [Mass/volume] in Serum or Plasma');
  });

  it('is undefined for a code not in the catalog', () => {
    expect(catalog.test('99999-9')).toBeUndefined();
  });
});

describe('search', () => {
  it('finds a test by its Italian name, narrowed by property', () => {
    expect(catalog.search('glucosio', { properties: ['MCnc'] })[0].code).toBe('2345-7');
  });

  it('narrows by system', () => {
    const codes = catalog.search('glucose', { systems: ['Urine'] }).map((test) => test.code);
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((code) => catalog.test(code)?.system === 'Urine')).toBe(true);
  });

  it('reads the query as names are written, whatever its case and spacing', () => {
    expect(catalog.search('  GLUCOSIO ', { properties: ['MCnc'] })[0].code).toBe('2345-7');
  });

  it('puts a name equal to the query before tests that only share words with it', () => {
    const file = {
      version: 't',
      groups: [],
      tests: [
        madeUpTest('1-1', ['ferritin level high'], 1),
        madeUpTest('2-2', ['ferritin'], 50),
      ],
    };
    expect(createCatalog(file).search('ferritin').map((test) => test.code)).toEqual(['2-2', '1-1']);
  });

  it('puts the more common test first when the fit is equal', () => {
    const glucose = catalog.search('glucose', { properties: ['MCnc'] }).map((test) => test.code);
    // 2345-7 has rank 6, 2339-0 rank 52
    expect(glucose.indexOf('2345-7')).toBeLessThan(glucose.indexOf('2339-0'));
  });

  it('ranks a test that matches more of the query higher', () => {
    const file = {
      version: 't',
      groups: [],
      tests: [madeUpTest('1-1', ['iron'], 1), madeUpTest('2-2', ['iron binding capacity'], 9)],
    };
    expect(createCatalog(file).search('iron binding').map((test) => test.code)).toEqual(['2-2', '1-1']);
  });

  it('does not let a word that most tests share identify a test', () => {
    const tests = Array.from({ length: 100 }, (_, index) =>
      madeUpTest(`${index}-0`, ['serum', `analyte${index}`])
    );
    const generic = createCatalog({ version: 't', groups: [], tests });
    expect(generic.search('serum')).toEqual([]);
    expect(generic.search('serum analyte7').map((test) => test.code)).toEqual(['7-0']);
  });

  it('reads a word no name has as a close form of one with a short ending', () => {
    const file = {
      version: 't',
      groups: [],
      tests: [madeUpTest('1-1', ['uric acid']), madeUpTest('2-2', ['urate'])],
    };
    // "urico" is in no name, but is "uric" with an Italian ending
    expect(createCatalog(file).search('urico').map((test) => test.code)).toEqual(['1-1']);
    expect(createCatalog(file).search('ur').map((test) => test.code)).toEqual([]);
  });

  it('finds a test by the words of its long common name', () => {
    const file = {
      version: 't',
      groups: [],
      tests: [{ ...madeUpTest('1-1', ['hct']), name: 'Hematocrit [Volume Fraction] of Blood' }],
    };
    expect(createCatalog(file).search('hematocrit').map((test) => test.code)).toEqual(['1-1']);
  });

  it('finds nothing for an empty query or unknown words', () => {
    expect(catalog.search('')).toEqual([]);
    expect(catalog.search('zzzz')).toEqual([]);
  });
});

describe('scoredSearch', () => {
  it('gives the same tests as search, each with its score', () => {
    const scored = catalog.scoredSearch('glucosio', { properties: ['MCnc'] });
    expect(scored.map(({ test }) => test)).toEqual(catalog.search('glucosio', { properties: ['MCnc'] }));
    expect(scored[0]).toMatchObject({ test: { code: '2345-7' }, score: 1 });
  });
});

describe('trendGroup', () => {
  it('joins the mass and molar codes of a substance in one sample', () => {
    // 14749-6 is Glucose [Moles/volume] in Serum or Plasma
    expect(catalog.trendGroup('2345-7')).toBe(catalog.trendGroup('14749-6'));
  });

  it('falls back to the group joining blood, serum and plasma', () => {
    // 2339-0 is Glucose [Mass/volume] in Blood, in no mass and molar group
    expect(catalog.trendGroup('2339-0')).toBe('LG7967-5');
  });

  it('is the code itself for a code in no such group', () => {
    expect(catalog.trendGroup('2351-5')).toBe('2351-5');
    expect(catalog.trendGroup('718-7')).toBe('718-7');
  });

  it('is the code itself for a code not in the catalog', () => {
    expect(catalog.trendGroup('99999-9')).toBe('99999-9');
  });
});

describe('groupCodes', () => {
  it('lists the codes of a trend group', () => {
    expect(catalog.groupCodes(catalog.trendGroup('2345-7')).sort()).toEqual(['14749-6', '2345-7']);
  });

  it('is the code alone for a code that trends on its own', () => {
    expect(catalog.groupCodes('718-7')).toEqual(['718-7']);
  });

  it('is empty for an unknown group', () => {
    expect(catalog.groupCodes('LG0-0')).toEqual([]);
  });
});

describe('classLabel', () => {
  it.each([
    ['CHEM', 'Chemistry'],
    ['HEM/BC', 'Hematology'],
    ['UA', 'Urinalysis'],
    ['SERO', 'Serology'],
    ['COAG', 'Coagulation'],
    ['DRUG/TOX', 'Drugs and toxicology'],
    ['MICRO', 'Microbiology'],
    ['FERT', 'Fertility'],
  ])('names %s %s', (classCode, label) => {
    expect(catalog.classLabel(classCode)).toBe(label);
  });

  it('shows a class it has no name for as its code', () => {
    expect(catalog.classLabel('ALLERGY')).toBe('ALLERGY');
  });
});

describe('search in the generated catalog', () => {
  it.each(['sangue', 'siero', 'chimica', 'totale', 'acido', 'test', 'presence', 'ratio', 'count'])(
    'identifies no test by the generic word %s alone',
    async (word) => {
      expect((await loadCatalog()).search(word)).toEqual([]);
    }
  );

  it('finds uric acid by its Italian name', async () => {
    expect((await loadCatalog()).search('acido urico')[0].code).toBe('3084-1');
  });

  it('finds the hematocrit by its long name', async () => {
    expect((await loadCatalog()).search('Hematocrit')[0].code).toBe('4544-3');
  });

  it('finds a specific gravity test', async () => {
    expect((await loadCatalog()).search('Specific gravity')[0].property).toBe('SpGrav');
  });
});

describe('loadCatalog', () => {
  it('loads the generated catalog once and shares it', async () => {
    const first = loadCatalog();
    expect(loadCatalog()).toBe(first);
    const loaded = await first;
    expect(loaded.version).toMatch(/^\d+\.\d+$/);
    expect(loaded.test('2345-7')?.component).toBe('Glucose');
  });
});
