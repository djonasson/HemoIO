import { describe, expect, it } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { createCatalog, isPanel, loadCatalog } from './catalog';
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

  it('reads Italian and English endings of one word as that word', () => {
    const file = { version: 't', groups: [], tests: [madeUpTest('1-1', ['proteina']), madeUpTest('2-2', ['protein'])] };
    const scored = createCatalog(file).scoredSearch('proteine');
    expect(scored.map(({ test, score }) => [test.code, score])).toEqual([
      ['1-1', 1],
      ['2-2', 1],
    ]);
  });

  it("scores a name with the query's words as equal to it, whatever its punctuation", () => {
    const file = {
      version: 't',
      groups: [],
      tests: [
        madeUpTest('1-1', ['colesterolo.in hdl']),
        madeUpTest('2-2', ['colesterolo.non hdl']),
        madeUpTest('3-3', ['bilirubina diretta e totale']),
        madeUpTest('4-4', ['proteina c']),
      ],
    };
    const scores = (query: string): Record<string, number> =>
      Object.fromEntries(createCatalog(file).scoredSearch(query).map(({ test, score }) => [test.code, score]));
    expect(scores('Colesterolo HDL')).toEqual({ '1-1': 1, '2-2': 0.9 });
    // "And" and a single letter change what a name means
    expect(scores('Bilirubina diretta')['3-3']).toBeLessThan(1);
    expect(scores('Proteine')['4-4']).toBeLessThan(1);
  });

  it('lists a name the query spells out before a more common one with only its words', () => {
    // "Mass", "volume" and "blood" say nothing of the test, so both names fit
    const file = {
      version: 't',
      groups: [],
      tests: [madeUpTest('1-1', ['hemoglobin'], 1), madeUpTest('2-2', ['hemoglobin [mass/volume] in blood'], 5)],
    };
    const scored = createCatalog(file).scoredSearch('Hemoglobin [Mass/volume] in Blood');
    expect(scored.map(({ test, score }) => [test.code, score])).toEqual([
      ['2-2', 1],
      ['1-1', 1],
    ]);
  });

  it('lets a number tell tests apart although many names have it', () => {
    const tests = [
      madeUpTest('1-1', ['alfa 1 globulina']),
      madeUpTest('2-2', ['alfa 2 globulina']),
      ...Array.from({ length: 100 }, (_, index) => madeUpTest(`${index + 10}-0`, [`analyte${index} 1`])),
    ];
    const scored = createCatalog({ version: 't', groups: [], tests }).scoredSearch('alfa-1');
    expect(scored[0].test.code).toBe('1-1');
    expect(scored[0].score).toBeGreaterThan(scored.find(({ test }) => test.code === '2-2')!.score);
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

describe('trendGroup of rates', () => {
  it("joins a day's mass and moles of a substance, which LOINC groups apart", () => {
    const file = {
      version: 't',
      groups: [
        { id: 'LG2-2', parentId: 'LG0-0', parentName: 'Urine<SAME:Comp|Prop|Sys>', name: 'Creatinine|SRat|Urine' },
        { id: 'LG1-1', parentId: 'LG0-0', parentName: 'Urine<SAME:Comp|Prop|Sys>', name: 'Creatinine|MRat|Urine' },
        { id: 'LG3-3', parentId: 'LG0-0', parentName: 'Urine<SAME:Comp|Prop|Sys>', name: 'Protein|MRat|Urine' },
      ],
      tests: [
        { ...madeUpTest('1-1', ['creatinina']), property: 'MRat', groups: ['LG1-1'] },
        { ...madeUpTest('2-2', ['creatinina']), property: 'SRat', groups: ['LG2-2'] },
        { ...madeUpTest('3-3', ['proteina']), property: 'MRat', groups: ['LG3-3'] },
      ],
    };
    const rates = createCatalog(file);
    expect(rates.trendGroup('1-1')).toBe('LG1-1');
    expect(rates.trendGroup('2-2')).toBe('LG1-1');
    expect(rates.trendGroup('3-3')).toBe('LG3-3');
    expect(rates.groupCodes('LG1-1').sort()).toEqual(['1-1', '2-2']);
  });

  it('joins 24-hour urine creatinine in mg and in mmol in the generated catalog', async () => {
    const generated = await loadCatalog();
    // 2162-6 Creatinine [Mass/time] and 14684-5 [Moles/time] in 24 hour Urine
    expect(generated.trendGroup('2162-6')).toBe(generated.trendGroup('14684-5'));
  });

  it('joins molar and mass urea in serum in the generated catalog', async () => {
    const generated = await loadCatalog();
    // 22664-7 is kept although unranked, for urea printed in mmol/L
    expect(generated.trendGroup('22664-7')).toBe(generated.trendGroup('3091-6'));
  });
});

describe('common', () => {
  it('lists the most common tests of these properties and systems, never a panel', () => {
    const file = {
      version: 't',
      groups: [],
      tests: [
        madeUpTest('1-1', ['a'], 30),
        madeUpTest('2-2', ['b'], 0),
        madeUpTest('3-3', ['c'], 10),
        { ...madeUpTest('4-4', ['d'], 1), classCode: 'PANEL.CHEM' },
        { ...madeUpTest('5-5', ['e'], 2), system: 'Bld' },
      ],
    };
    const common = createCatalog(file).common({ properties: ['MCnc'], systems: ['Ser/Plas'] }, 2);
    expect(common.map((test) => test.code)).toEqual(['3-3', '1-1']);
  });
});

describe('isPanel', () => {
  it('tells a panel of tests from a test', () => {
    expect(isPanel({ ...madeUpTest('1-1', []), classCode: 'PANEL.CHEM' })).toBe(true);
    expect(isPanel(madeUpTest('1-1', []))).toBe(false);
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
