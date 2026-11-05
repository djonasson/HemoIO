import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { createCatalog, loadCatalog } from '@data/loinc/catalog';
import { learnedKey, matchLocally, readAntibody, spellGreek, splitSamplePrefix } from './loincMatch';
import type { LocalMatch } from './loincMatch';
import type { Catalog, CatalogTest } from '@data/loinc/catalog';

const catalog = fixtureCatalog();

/** A made-up serum test, for cases the fixture release does not have */
function madeUpTest(
  code: string,
  names: string[],
  system = 'Ser/Plas',
  more: Partial<CatalogTest> = {}
): CatalogTest {
  return {
    code,
    name: code,
    shortName: code,
    component: code,
    property: 'MCnc',
    system,
    scale: 'Qn',
    method: '',
    classCode: 'CHEM',
    names,
    units: [],
    rank: 1,
    groups: [],
    ...more,
  };
}

/** A catalog of made-up tests */
function madeUp(...tests: CatalogTest[]): Catalog {
  return createCatalog({ version: 't', groups: [], tests });
}

const codesOf = (result: LocalMatch): string[] => result.candidates.map((candidate) => candidate.code);

describe('matchLocally', () => {
  it('matches a plasma test in mg/dL to its mass code', () => {
    const result = matchLocally(catalog, { name: 'P-Glucosio', unit: 'mg/dL' });
    expect(result).toMatchObject({ status: 'match', code: '2345-7' });
  });

  it('takes the serum code HemoIO describes for a test in mmol/L that names no sample', () => {
    // 14749-6 (serum or plasma) and 15074-8 (blood) trend apart; HemoIO describes the first
    const result = matchLocally(catalog, { name: 'Glucosio', unit: 'mmol/L' });
    expect(result).toMatchObject({ status: 'match', code: '14749-6' });
    expect(codesOf(result)).toEqual(['14749-6', '15074-8']);
  });

  it('matches a test in mmol/L in serum to its molar code', () => {
    const result = matchLocally(catalog, { name: 'S-Glucosio', unit: 'mmol/L' });
    expect(result).toMatchObject({ status: 'match', code: '14749-6' });
  });

  it('matches a test in a urine section to its urine code', () => {
    const result = matchLocally(catalog, { name: 'Glucosio', unit: 'mg/dL', specimenHint: 'urine' });
    expect(result).toMatchObject({ status: 'match', code: '2350-7' });
  });

  it('resolves the 24-hour urine and serum forms of a test to different codes', () => {
    const urine = matchLocally(catalog, { name: 'dU-Glucosio', unit: 'mg/dL' });
    const hinted = matchLocally(catalog, { name: 'Glucosio', unit: 'mg/dL', specimenHint: '24h urine' });
    const serum = matchLocally(catalog, { name: 'S-Glucosio', unit: 'mg/dL' });
    expect(urine).toMatchObject({ status: 'match', code: '21305-8' });
    expect(hinted).toMatchObject({ status: 'match', code: '21305-8' });
    expect(serum).toMatchObject({ status: 'match', code: '2345-7' });
  });

  it('reads the serum, plasma or blood the AI names for a value whose name names none', () => {
    for (const specimenHint of ['serum', 'plasma', 'Siero']) {
      expect(matchLocally(catalog, { name: 'Glucosio', unit: 'mg/dL', specimenHint })).toMatchObject({
        status: 'match',
        code: '2345-7',
      });
    }
    // "Blood" is said loosely of serum tests too: blood is only the likelier
    const blood = matchLocally(catalog, { name: 'Glucosio', unit: 'mmol/L', specimenHint: 'blood' });
    expect(blood.status).toBe('ambiguous');
    expect(codesOf(blood)).toEqual(['15074-8', '14749-6']);
  });

  it('never matches a value without a readable unit, but still offers candidates', () => {
    const result = matchLocally(catalog, { name: 'Proteine', unit: '' });
    expect(result.status).not.toBe('match');
    expect(result.candidates.map((candidate) => candidate.code)).toContain('2885-2');
  });

  it('tells a share of neutrophils from their count by the unit', () => {
    expect(matchLocally(catalog, { name: 'Neutrofili', unit: '%' })).toMatchObject({
      status: 'match',
      code: '770-8',
    });
    expect(matchLocally(catalog, { name: 'Neutrofili', unit: '10^9/L' })).toMatchObject({
      status: 'match',
      code: '751-8',
    });
  });

  it('takes a learned code before anything else', () => {
    const value = { name: 'Glucosio', unit: 'mg/dL' };
    const learned = (key: string): string | undefined =>
      key === learnedKey(value) ? '2339-0' : undefined;
    expect(matchLocally(catalog, value, learned)).toMatchObject({ status: 'match', code: '2339-0' });
  });

  it('ignores a learned code of another sample than the one the value is said to be of', () => {
    const value = { name: 'Glucosio', unit: 'mg/dL' };
    const learned = (key: string): string | undefined => (key === learnedKey(value) ? '2339-0' : undefined);
    expect(matchLocally(catalog, { ...value, specimenHint: 'urine' }, learned)).toMatchObject({
      status: 'match',
      code: '2350-7',
    });
    expect(matchLocally(catalog, { ...value, name: 'U-Glucosio' }, learned)).toMatchObject({ code: '2350-7' });
    // "Blood" is said loosely, so the code learned stands
    expect(matchLocally(catalog, { ...value, specimenHint: 'blood' }, learned)).toMatchObject({ code: '2339-0' });
  });

  it('offers the tests a name fits whatever their unit, for a unit it cannot read or none of them has', () => {
    const unreadable = matchLocally(catalog, { name: 'Glucosio', unit: 'boh' });
    expect(unreadable.status).toBe('ambiguous');
    expect(codesOf(unreadable)).toContain('2345-7');
    const otherProperty = matchLocally(catalog, { name: 'Neutrofili', unit: 'mg/dL' });
    expect(otherProperty.status).toBe('ambiguous');
    expect(codesOf(otherProperty)).toEqual(expect.arrayContaining(['751-8', '770-8']));
  });

  it('ignores a learned code the catalog does not have', () => {
    const result = matchLocally(catalog, { name: 'P-Glucosio', unit: 'mg/dL' }, () => '99999-9');
    expect(result).toMatchObject({ status: 'match', code: '2345-7' });
  });

  it('is none when no test fits, offering the most common tests of the sample and unit', () => {
    // The AI or the user may know a wording LOINC does not, as "Glicemia" for glucose
    const result = matchLocally(catalog, { name: 'Glicemia', unit: 'mg/dL' });
    expect(result.status).toBe('none');
    expect(codesOf(result)).toEqual(['2345-7', '718-7', '2885-2', '2339-0']);
    expect(result.candidates[0].score).toBe(0);
  });

  it('offers nothing for a name that fits nothing in a unit that says nothing', () => {
    expect(matchLocally(catalog, { name: 'Xyzzy', unit: '' })).toEqual({ status: 'none', candidates: [] });
  });

  it('offers the filtration rates for "eGFR", a wording LOINC does not have', () => {
    const rates = madeUp(
      madeUpTest('1-1', ['gfr'], 'Ser/Plas/Bld', { property: 'ArVRat', rank: 50 }),
      madeUpTest('2-2', ['gfr ckd-epi'], 'Ser/Plas/Bld', { property: 'ArVRat', rank: 200 }),
      madeUpTest('3-3', ['creatinina'])
    );
    const result = matchLocally(rates, { name: 'Filtrato glomerulare (eGFR)', unit: 'mL/min/1,73m^2' });
    expect(result.status).toBe('none');
    expect(codesOf(result)).toEqual(['1-1', '2-2']);
  });

  it('is ambiguous when two tests fit equally well', () => {
    const tied = createCatalog({
      version: 't',
      groups: [],
      tests: [madeUpTest('1-1', ['ferritina alfa']), madeUpTest('2-2', ['ferritina beta'])],
    });
    const result = matchLocally(tied, { name: 'Ferritina', unit: 'ng/mL' });
    expect(result.status).toBe('ambiguous');
    expect(result.candidates.map((candidate) => candidate.code)).toEqual(['1-1', '2-2']);
  });

  it('is ambiguous between serum, plasma and blood tests that trend apart', () => {
    const file = {
      version: 't',
      groups: [],
      tests: [
        madeUpTest('1-1', ['emoglobina'], 'Ser'),
        madeUpTest('2-2', ['emoglobina'], 'Plas'),
        madeUpTest('3-3', ['emoglobina'], 'Bld'),
      ],
    };
    const result = matchLocally(createCatalog(file), { name: 'Emoglobina', unit: 'g/dL' });
    expect(result.status).toBe('ambiguous');
    expect(result.candidates.map((candidate) => candidate.code).sort()).toEqual(['1-1', '2-2', '3-3']);
  });

  it('matches when the tests that fit as well trend together', () => {
    const file = {
      version: 't',
      groups: [{ id: 'LG1-1', parentId: 'LG0-0', parentName: '', name: 'Ferritin|MCnc|Pt|ANYBldSerPl' }],
      tests: [
        { ...madeUpTest('1-1', ['ferritina']), groups: ['LG1-1'] },
        { ...madeUpTest('2-2', ['ferritina'], 'Bld'), groups: ['LG1-1'] },
      ],
    };
    expect(matchLocally(createCatalog(file), { name: 'Ferritina', unit: 'ng/mL' })).toMatchObject({
      status: 'match',
      code: '1-1',
    });
  });

  it('finds by a name without its bracket only tests that carry what the bracket says, when some do', () => {
    const tests = [madeUpTest('1-1', ['vitamina d']), madeUpTest('2-2', ['vitamina d 25 oh', 'calcidiolo'], 'Ser/Plas', { rank: 2 })];
    const vitamins = madeUp(...tests);
    expect(matchLocally(vitamins, { name: 'Vitamina D (25-OH)', unit: 'ng/mL' })).toMatchObject({
      status: 'match',
      code: '2-2',
    });
    // A bracket no test carries says nothing of the test
    expect(matchLocally(vitamins, { name: 'Vitamina D (metodo)', unit: 'ng/mL' })).toMatchObject({
      status: 'match',
      code: '1-1',
    });
  });

  it('reads a sample word anywhere in the name as its sample, a blood word loosely', () => {
    const ferritin = madeUp(madeUpTest('1-1', ['ferritina']), madeUpTest('2-2', ['ferritina'], 'Bld', { rank: 900 }));
    expect(matchLocally(ferritin, { name: 'Ferritina siero', unit: 'ng/mL' })).toMatchObject({
      status: 'match',
      code: '1-1',
    });
    expect(matchLocally(ferritin, { name: 'Ferritina, Blood', unit: 'ng/mL' })).toMatchObject({
      status: 'ambiguous',
    });
    expect(matchLocally(ferritin, { name: 'Ferritina sangue', unit: 'ng/mL' }).status).toBe('ambiguous');
  });

  it('takes a long common name printed in full as that test', () => {
    const ferritin = madeUp(
      { ...madeUpTest('1-1', ['ferritina']), name: 'Ferritin [Mass/volume] in Serum or Plasma' },
      { ...madeUpTest('2-2', ['ferritina'], 'Bld'), name: 'Ferritin [Mass/volume] in Blood' }
    );
    const value = { name: 'Ferritin [Mass/volume] in Blood', unit: 'ng/mL' };
    expect(matchLocally(ferritin, value)).toMatchObject({ status: 'match', code: '2-2' });
    // Unless its unit is of another property
    expect(matchLocally(ferritin, { ...value, unit: 'mmol/L' }).status).not.toBe('match');
  });

  it('keeps variants that each name a method apart, and takes the one naming none over them', () => {
    const variant = (code: string, method: string, rank: number): CatalogTest =>
      madeUpTest(code, ['d-dimero'], 'PPP', { component: 'Fibrin D-dimer', method, rank });
    const named = madeUp(variant('1-1', 'FEU', 500), variant('2-2', 'DDU', 501));
    expect(matchLocally(named, { name: 'D-dimero', unit: 'ng/mL' }).status).toBe('ambiguous');
    const withPlain = madeUp(variant('1-1', 'FEU', 500), variant('2-2', 'DDU', 501), variant('3-3', '', 700));
    expect(matchLocally(withPlain, { name: 'D-dimero', unit: 'ng/mL' })).toMatchObject({
      status: 'match',
      code: '3-3',
    });
  });

  it('takes the plain test over a per-cell one the name fits as well', () => {
    const hemoglobin = madeUp(
      madeUpTest('1-1', ['emoglobina'], 'Bld', { rank: 20 }),
      madeUpTest('2-2', ['emoglobina'], 'RBC', { property: 'EntMCnc', rank: 10 })
    );
    expect(matchLocally(hemoglobin, { name: 'Emoglobina', unit: 'g/dL' })).toMatchObject({
      status: 'match',
      code: '1-1',
    });
  });

  it('takes the most common of tests that trend together when the AI says only "blood"', () => {
    // "Blood" is said loosely of serum tests too, so it does not pick the blood code
    const file = {
      version: 't',
      groups: [{ id: 'LG1-1', parentId: 'LG0-0', parentName: '', name: 'Ferritin|MCnc|Pt|ANYBldSerPl' }],
      tests: [
        { ...madeUpTest('1-1', ['ferritina'], 'Bld', { rank: 900 }), groups: ['LG1-1'] },
        { ...madeUpTest('2-2', ['ferritina'], 'Ser/Plas', { rank: 3 }), groups: ['LG1-1'] },
      ],
    };
    const ferritin = createCatalog(file);
    expect(matchLocally(ferritin, { name: 'Ferritina', unit: 'ng/mL', specimenHint: 'blood' })).toMatchObject({
      status: 'match',
      code: '2-2',
    });
    expect(matchLocally(ferritin, { name: 'B-Ferritina', unit: 'ng/mL' })).toMatchObject({
      status: 'match',
      code: '1-1',
    });
  });

  it('takes the test HemoIO describes among equal fits that trend apart', () => {
    // Hb is a name of free hemoglobin in serum too; HemoIO describes 718-7, in blood
    const result = matchLocally(catalog, { name: 'Emoglobina', unit: 'g/dL' });
    expect(result).toMatchObject({ status: 'match', code: '718-7' });
  });

  it('takes a test far more common than its equal fits, and asks when none is', () => {
    const common = madeUp(
      madeUpTest('1-1', ['sodio'], 'Ser/Plas', { property: 'SCnc', rank: 5 }),
      madeUpTest('2-2', ['sodio'], 'Bld', { property: 'SCnc', rank: 261 })
    );
    expect(matchLocally(common, { name: 'Sodio', unit: 'mmol/L' })).toMatchObject({ status: 'match', code: '1-1' });
    const close = madeUp(
      madeUpTest('1-1', ['sodio'], 'Ser/Plas', { property: 'SCnc', rank: 5 }),
      madeUpTest('2-2', ['sodio'], 'Bld', { property: 'SCnc', rank: 20 })
    );
    expect(matchLocally(close, { name: 'Sodio', unit: 'mmol/L' }).status).toBe('ambiguous');
  });

  it('reads variants of one test by method or collection time as one fit', () => {
    const variants = madeUp(
      madeUpTest('1-1', ['ferritina'], 'Ser/Plas', { component: 'Ferritin', rank: 772, method: 'IA' }),
      madeUpTest('2-2', ['ferritina'], 'Ser/Plas', { component: 'Ferritin', rank: 151 }),
      madeUpTest('3-3', ['ferritina'], 'Ser/Plas', { component: 'Ferritin', rank: 900, scale: 'SemiQn' })
    );
    const result = matchLocally(variants, { name: 'Ferritina', unit: 'ng/mL' });
    expect(result).toMatchObject({ status: 'match', code: '2-2' });
    expect(codesOf(result)[0]).toBe('2-2');
  });

  it('takes a name with the same words over one with a qualifier more', () => {
    const cholesterol = madeUp(
      madeUpTest('1-1', ['colesterolo.in hdl']),
      madeUpTest('2-2', ['colesterolo.non hdl']),
      madeUpTest('3-3', ['colesterolo.in hdl 3'])
    );
    expect(matchLocally(cholesterol, { name: 'Colesterolo HDL', unit: 'mg/dL' })).toMatchObject({
      status: 'match',
      code: '1-1',
    });
  });

  it('reads Italian plurals as the singular names', () => {
    const proteins = madeUp(madeUpTest('1-1', ['proteina']), madeUpTest('2-2', ['proteine urinarie di topo']));
    expect(matchLocally(proteins, { name: 'P-Proteine totali', unit: 'g/L' })).toMatchObject({
      status: 'match',
      code: '1-1',
    });
  });

  it('reads a bracket as a qualifier or as another name', () => {
    const tests = madeUp(madeUpTest('1-1', ['creatinina']), madeUpTest('2-2', ['tsh'], 'Ser/Plas', { property: 'ACnc' }));
    expect(matchLocally(tests, { name: 'P-Creatinina (metodo enzimatico)', unit: 'mg/dL' })).toMatchObject({
      status: 'match',
      code: '1-1',
    });
    expect(matchLocally(tests, { name: 'S-Tirotropina (TSH)', unit: 'mUI/L' })).toMatchObject({
      status: 'match',
      code: '2-2',
    });
  });

  it('tells "alfa-1" from "alfa-2" by the number', () => {
    const fractions = madeUp(
      madeUpTest('1-1', ['alfa 1 globulina/proteina.totale'], 'Ser/Plas', { property: 'MFr' }),
      madeUpTest('2-2', ['alfa 2 globulina/proteina.totale'], 'Ser/Plas', { property: 'MFr' })
    );
    expect(matchLocally(fractions, { name: 'alfa-1', unit: '%' })).toMatchObject({ status: 'match', code: '1-1' });
    expect(matchLocally(fractions, { name: 'alfa-2', unit: '%' })).toMatchObject({ status: 'match', code: '2-2' });
  });

  it('never takes a panel for a value', () => {
    const tests = madeUp(madeUpTest('1-1', ['bilirubina diretta'], 'Ser/Plas', { classCode: 'PANEL.CHEM' }));
    expect(matchLocally(tests, { name: 'Bilirubina diretta', unit: 'mg/dL' }).candidates).toEqual([]);
  });

  it('reads a whole name LOINC knows before a sample prefix it seems to have', () => {
    // P-ANCA is no plasma test: its tests are of serum, in arbitrary units printed as U/mL
    const anca = madeUp(
      madeUpTest('1-1', ['p-anca', 'anca'], 'Ser', { property: 'ACnc' }),
      madeUpTest('2-2', ['anca'], 'Ser/Plas', { property: 'ACnc' })
    );
    expect(matchLocally(anca, { name: 'P-ANCA', unit: 'U/mL' })).toMatchObject({ status: 'match', code: '1-1' });
  });

  it('reads the Italian urine words', () => {
    const result = matchLocally(catalog, { name: 'Glucosio urina', unit: 'mg/dL' });
    expect(result).toMatchObject({ status: 'match', code: '2350-7' });
  });

  it('takes a test LOINC does not count among its common ones only by a name of its own that fits nothing else', () => {
    const rare = (code: string, names: string[], rank: number): CatalogTest => madeUpTest(code, names, 'Ser/Plas', { rank });
    // A name it only shares words with: asked, with the unit's common tests the name is near
    const phosphorus = madeUp(rare('1-1', ['fosfolipidi fosforo'], 8953), rare('2-2', ['fosfato'], 55));
    const shared = matchLocally(phosphorus, { name: 'Fosforo', unit: 'mg/dL' });
    expect(shared.status).toBe('ambiguous');
    expect(codesOf(shared)).toEqual(['1-1', '2-2']);
    // Its own name that another test's name fits about as well: asked
    const beta = madeUp(rare('1-1', ['beta 1'], 11770), rare('2-2', ['beta 1 globulina'], 5925));
    expect(matchLocally(beta, { name: 'Beta 1', unit: 'mg/dL' }).status).toBe('ambiguous');
    // Its own name, and no other test's: taken
    expect(matchLocally(madeUp(rare('1-1', ['beta 1'], 11770)), { name: 'Beta 1', unit: 'mg/dL' })).toMatchObject({
      status: 'match',
      code: '1-1',
    });
    // A common test's own name sets it above the rest
    const common = madeUp(rare('1-1', ['beta 1'], 1500), rare('2-2', ['beta 1 globulina'], 5925));
    expect(matchLocally(common, { name: 'Beta 1', unit: 'mg/dL' })).toMatchObject({ status: 'match', code: '1-1' });
  });

  it('weighs a rare test whose related name is the printed one as the tests the name fits as well', () => {
    const vitamins = madeUp(
      madeUpTest('1-1', ['total vitamin d', 'vitamin d+metabolites'], 'Ser/Plas', { rank: 2621 }),
      madeUpTest('2-2', ['vitamina d 25 oh', '25-hydroxyvitamin d'], 'Ser/Plas', { rank: 194 }),
      madeUpTest('3-3', ['vitamina d3 25 oh'], 'Ser/Plas', { rank: 2194 })
    );
    expect(matchLocally(vitamins, { name: 'Vitamina D', unit: 'ng/mL' })).toMatchObject({
      status: 'match',
      code: '2-2',
    });
  });

  it('never takes a test LOINC names with an adjustment without asking', () => {
    const hba1c = madeUp(
      madeUpTest('1-1', ['hba1c'], 'Bld', { property: 'SFr', component: 'Hemoglobin A1c^^standardized', rank: 1 })
    );
    const result = matchLocally(hba1c, { name: 'HbA1c', unit: 'mmol/mol' });
    expect(result.status).toBe('ambiguous');
    expect(codesOf(result)).toEqual(['1-1']);
  });

  it('never reads international units per volume as a ratio to creatinine', () => {
    const tests = madeUp(madeUpTest('1-1', ['ormone luteo'], 'Urine', { property: 'Ratio', component: 'Ormone luteo/Creatinine' }));
    const result = matchLocally(tests, { name: 'Ormone luteo urinario', unit: 'mUI/mL' });
    expect(result.status).not.toBe('match');
  });

  it('reads international units per volume as an enzyme only for one LOINC measures in enzyme units', () => {
    const tests = madeUp(
      madeUpTest('1-1', ['reninasi'], 'Plas', { property: 'CCnc', units: ['ng/mL/h'] }),
      madeUpTest('2-2', ['transaminasi zeta'], 'Ser/Plas', { property: 'CCnc', units: ['U/L'] })
    );
    expect(matchLocally(tests, { name: 'Reninasi', unit: 'µUI/mL' }).status).not.toBe('match');
    expect(matchLocally(tests, { name: 'Transaminasi zeta', unit: 'UI/L' })).toMatchObject({ status: 'match', code: '2-2' });
  });

  it('finds by a bracket or a dashed part alone only the tests it is a name of', () => {
    const complement = madeUp(
      madeUpTest('1-1', ['complemento c9']),
      madeUpTest('2-2', ['c9 proattivatore', 'complemento fattore z'])
    );
    expect(matchLocally(complement, { name: 'C9 attivatore (complemento)', unit: 'mg/L' }).status).toBe('ambiguous');
    const kinase = madeUp(madeUpTest('1-1', ['fosfochinasi zeta', 'fkz'], 'Ser/Plas', { property: 'CCnc' }));
    expect(matchLocally(kinase, { name: 'Fosfochinasi zeta - FKZ', unit: 'U/L' })).toMatchObject({
      status: 'match',
      code: '1-1',
    });
  });

  it('takes the plain test over its variants LOINC names with a challenge or a time the name does not say', () => {
    const tests = madeUp(
      madeUpTest('1-1', ['ormone zeta'], 'Ser/Plas', { component: 'Ormone zeta', rank: 3000 }),
      madeUpTest('2-2', ['ormone zeta'], 'Ser/Plas', { component: 'Ormone zeta^1st specimen post XXX challenge', rank: 3001 }),
      madeUpTest('3-3', ['ormone zeta 60 min'], 'Ser/Plas', { component: 'Ormone zeta^1H post XXX challenge', rank: 5 }),
      // Its challenge's name is the printed one, as cortisol's "post corticotropin" is ACTH's
      madeUpTest('4-4', ['stimolina'], 'Ser/Plas', { component: 'Cortisone^post 250 ug stimolina', rank: 5 }),
      madeUpTest('5-5', ['stimolina'], 'Plas', { component: 'Stimolina', rank: 50 })
    );
    expect(matchLocally(tests, { name: 'Ormone zeta', unit: 'pg/mL' })).toMatchObject({ status: 'match', code: '1-1' });
    expect(matchLocally(tests, { name: 'Ormone zeta 60 min', unit: 'pg/mL' })).toMatchObject({ status: 'match', code: '3-3' });
    expect(matchLocally(tests, { name: 'Stimolina', unit: 'pg/mL' })).toMatchObject({ status: 'match', code: '5-5' });
  });

  it('reads a name ending in "-emia" as its substance said of blood, loosely', () => {
    const serum = madeUp(madeUpTest('1-1', ['proteine']));
    expect(matchLocally(serum, { name: 'Proteinemia', unit: 'g/dL' })).toMatchObject({ status: 'match', code: '1-1' });
    // Blood is said loosely of serum tests too: serum and blood codes that trend apart are asked
    const both = madeUp(madeUpTest('1-1', ['proteine']), madeUpTest('2-2', ['proteine'], 'Bld'));
    expect(matchLocally(both, { name: 'Proteinemia', unit: 'g/dL' }).status).toBe('ambiguous');
  });

  it('never takes a serum test for a value said of blood whose blood test LOINC has apart, in any unit', () => {
    const tests = madeUp(
      madeUpTest('1-1', ['solvente zeta'], 'Ser/Plas', { component: 'Zeta', rank: 10 }),
      madeUpTest('2-2', ['solvente zeta'], 'Bld', { component: 'Zeta', property: 'SCnc', rank: 900 }),
      madeUpTest('3-3', ['proteine zeta'], 'Ser/Plas', { component: 'Proteine zeta', rank: 10 }),
      madeUpTest('4-4', ['proteine zeta'], 'Bld', { component: 'Proteine zeta', property: 'SCnc', rank: 900 })
    );
    for (const name of ['Solvente zeta ematico', 'Solvente zeta sangue']) {
      const result = matchLocally(tests, { name, unit: 'g/L' });
      expect(result.status).toBe('ambiguous');
      expect(codesOf(result)).toEqual(expect.arrayContaining(['1-1', '2-2']));
    }
    expect(matchLocally(tests, { name: 'Proteine zetaemia', unit: 'g/L' }).status).toBe('ambiguous');
    // Said of serum, or of nothing, it is the serum test
    expect(matchLocally(tests, { name: 'Solvente zeta siero', unit: 'g/L' })).toMatchObject({ status: 'match', code: '1-1' });
    expect(matchLocally(tests, { name: 'Solvente zeta', unit: 'g/L' })).toMatchObject({ status: 'match', code: '1-1' });
  });

  it('takes a blood test said loosely of blood when it stands out among serum and blood tests', () => {
    const tests = madeUp(
      madeUpTest('1-1', ['cellule zeta'], 'Bld', { property: 'NCnc', rank: 20 }),
      madeUpTest('2-2', ['cellule zeta'], 'Plas', { property: 'NCnc', rank: 19000 }),
      madeUpTest('3-3', ['enzima zeta'], 'Ser/Plas', { rank: 5 }),
      madeUpTest('4-4', ['enzima zeta'], 'Bld', { rank: 500 })
    );
    expect(matchLocally(tests, { name: 'Cellule zeta', unit: '10^3/µL', specimenHint: 'blood' })).toMatchObject({
      status: 'match',
      code: '1-1',
    });
    // A serum test standing out is never taken for a value said of blood
    expect(matchLocally(tests, { name: 'Enzima zeta', unit: 'mg/dL', specimenHint: 'blood' }).status).toBe('ambiguous');
  });

  it('asks whether a test HemoIO describes by calculation was calculated, when a measured one is about as common', () => {
    const variants = (directRank: number): Catalog =>
      madeUp(
        madeUpTest('13457-7', ['lipide zeta'], 'Ser/Plas', { component: 'Lipide zeta', method: 'Calculated', rank: 76 }),
        madeUpTest('2-2', ['lipide zeta'], 'Ser/Plas', { component: 'Lipide zeta', rank: 263 }),
        madeUpTest('3-3', ['lipide zeta'], 'Ser/Plas', { component: 'Lipide zeta', method: 'Direct assay', rank: directRank })
      );
    const asked = matchLocally(variants(363), { name: 'Lipide zeta', unit: 'mg/dL' });
    expect(asked.status).toBe('ambiguous');
    expect(codesOf(asked)).toEqual(expect.arrayContaining(['13457-7', '2-2', '3-3']));
    // A measurement far rarer than the calculation is not the usual meaning
    expect(matchLocally(variants(5000), { name: 'Lipide zeta', unit: 'mg/dL' })).toMatchObject({
      status: 'match',
      code: '13457-7',
    });
  });

  it('takes a count by machine for a name that does not say how it was counted', () => {
    const tests = madeUp(
      madeUpTest('777-3', ['cellule zeta'], 'Bld', { component: 'Cellule zeta', property: 'NCnc', method: 'Automated count', rank: 20 }),
      madeUpTest('2-2', ['cellule zeta'], 'Bld', { component: 'Cellule zeta', property: 'NCnc', rank: 70 }),
      madeUpTest('3-3', ['cellule zeta'], 'Bld', { component: 'Cellule zeta', property: 'NCnc', method: 'Manual count', rank: 90 })
    );
    expect(matchLocally(tests, { name: 'Cellule zeta', unit: '10^3/µL' })).toMatchObject({ status: 'match', code: '777-3' });
  });

  it.each(['Cellule zeta, Absolute', 'Cellule zeta assolute', 'Cellule zeta abs.'])(
    'reads %s in a count unit as the count its unit says',
    (name) => {
      const tests = madeUp(
        madeUpTest('1-1', ['cellule zeta'], 'Bld', { property: 'NCnc' }),
        madeUpTest('2-2', ['cellule zeta'], 'Bld', { property: 'NFr' })
      );
      expect(matchLocally(tests, { name, unit: '10^3/µL' })).toMatchObject({ status: 'match', code: '1-1' });
    }
  );

  it('reads the blood and red cell adjectives as the sample', () => {
    const tests = madeUp(
      madeUpTest('1-1', ['solvente zeta'], 'Bld'),
      madeUpTest('2-2', ['vitamina zeta'], 'RBC'),
      madeUpTest('3-3', ['vitamina zeta'], 'Bld')
    );
    expect(matchLocally(tests, { name: 'Solvente zeta ematico', unit: 'µg/L' })).toMatchObject({ status: 'match', code: '1-1' });
    expect(matchLocally(tests, { name: 'Vitamina zeta eritrocitaria', unit: 'ng/mL' })).toMatchObject({
      status: 'match',
      code: '2-2',
    });
  });

  it.each([
    'Anticorpi anti-perossidasi zeta',
    'Ab anti perossidasi zeta',
    'A.A. perossidasi zeta',
    'Perossidasi zeta (anticorpi)',
  ])('reads %s as the antibody LOINC names "Ab"', (name) => {
    const tests = madeUp(
      madeUpTest('1-1', ['perossidasi zeta ab'], 'Ser/Plas', { property: 'ACnc' }),
      madeUpTest('2-2', ['perossidasi zeta'], 'Ser/Plas', { property: 'ACnc' })
    );
    expect(matchLocally(tests, { name, unit: 'UI/mL' })).toMatchObject({ status: 'match', code: '1-1' });
  });

  it('reads Greek letters, and the Latin letters a symbol font gives for them, spelled out', () => {
    const tests = madeUp(madeUpTest('1-1', ['alfa-1-globulina zeta']), madeUpTest('2-2', ['beta-2-globulina zeta']));
    for (const name of ['α1-globulina zeta', 'a1-globulina zeta', 'a-1 globulina zeta']) {
      expect(matchLocally(tests, { name, unit: 'mg/L' })).toMatchObject({ status: 'match', code: '1-1' });
    }
    expect(matchLocally(tests, { name: 'b2-globulina zeta', unit: 'mg/L' })).toMatchObject({ status: 'match', code: '2-2' });
  });

  it('reads a letter and its number written apart as one name', () => {
    const tests = madeUp(madeUpTest('1-1', ['vitamina q12']), madeUpTest('2-2', ['vitamina q1']));
    expect(matchLocally(tests, { name: 'Vitamina Q 12', unit: 'pg/mL' })).toMatchObject({ status: 'match', code: '1-1' });
  });

  it('offers at most eight candidates, with their LOINC names and scores', () => {
    const many = createCatalog({
      version: 't',
      groups: [],
      tests: Array.from({ length: 12 }, (_, i) => madeUpTest(`${i}-0`, [`ferritina ${i}`])),
    });
    const result = matchLocally(many, { name: 'Ferritina', unit: 'ng/mL' });
    expect(result.candidates).toHaveLength(8);
    expect(result.candidates[0]).toEqual({ code: '0-0', name: '0-0', score: 0.9 });
  });
});

describe('splitSamplePrefix', () => {
  it('strips a known sample prefix and reads it as the sample', () => {
    expect(splitSamplePrefix('S-AFP')).toEqual({ name: 'AFP', systems: ['Ser', 'Ser/Plas', 'Ser/Plas/Bld'] });
    expect(splitSamplePrefix('Pl.Fibrinogeno')).toEqual({
      name: 'Fibrinogeno',
      systems: ['Plas', 'Ser/Plas', 'PPP', 'Ser/Plas/Bld'],
    });
    expect(splitSamplePrefix('Sg-Emoglobina')).toEqual({ name: 'Emoglobina', systems: ['Bld', 'RBC', 'Ser/Plas/Bld'] });
    expect(splitSamplePrefix('U: Glucosio')).toEqual({ name: 'Glucosio', systems: ['Urine', 'Urine sed'] });
    expect(splitSamplePrefix('U24-Proteine')).toEqual({ name: 'Proteine', systems: ['24H urine'] });
  });

  it('reads a urine prefix set apart by a space alone', () => {
    expect(splitSamplePrefix('U Albumina 24h')).toEqual({ name: 'Albumina', systems: ['24H urine'] });
    expect(splitSamplePrefix('U Albumina')).toEqual({ name: 'Albumina', systems: ['Urine', 'Urine sed'] });
    expect(splitSamplePrefix('S Albumina')).toEqual({ name: 'S Albumina' });
  });

  it('leaves a name without a known prefix unchanged', () => {
    expect(splitSamplePrefix('Sodio')).toEqual({ name: 'Sodio' });
    expect(splitSamplePrefix('Sodio-Potassio')).toEqual({ name: 'Sodio-Potassio' });
    expect(splitSamplePrefix('PCR')).toEqual({ name: 'PCR' });
    expect(splitSamplePrefix('P.C.R.')).toEqual({ name: 'P.C.R.' });
  });

  it('reads a name ending in "-uria" as its substance in urine', () => {
    expect(splitSamplePrefix('Microalbuminuria')).toEqual({ name: 'Microalbumin', systems: ['Urine', 'Urine sed'] });
    expect(splitSamplePrefix('Proteinuria 24h')).toEqual({ name: 'Protein', systems: ['24H urine'] });
    // Too short a stem to be a substance
    expect(splitSamplePrefix('Uria')).toEqual({ name: 'Uria' });
  });

  it('reads the urinalysis section prefix as urine', () => {
    expect(splitSamplePrefix('U-Esame standard Glucosio')).toEqual({
      name: 'Glucosio',
      systems: ['Urine', 'Urine sed'],
    });
  });

  it('reads the 24 hours however written', () => {
    for (const day of ['24h', '24 h', '24-hour', '24 hour', '24hr', '24 hrs', '24 ore']) {
      expect(splitSamplePrefix(`Proteine urine ${day}`)).toEqual({ name: 'Proteine', systems: ['24H urine'] });
    }
  });

  it('reads the Italian and English urine words of either number and gender', () => {
    for (const word of ['urinario', 'urinaria', 'urinari', 'urinarie', 'urinary']) {
      expect(splitSamplePrefix(`Proteine ${word}`)).toEqual({ name: 'Proteine', systems: ['Urine', 'Urine sed'] });
    }
  });

  it('reads urine and 24-hour words anywhere in the name', () => {
    const urine = ['Urine', 'Urine sed'];
    expect(splitSamplePrefix('Glucosio urinario')).toEqual({ name: 'Glucosio', systems: urine });
    expect(splitSamplePrefix('Glucosio urina')).toEqual({ name: 'Glucosio', systems: urine });
    expect(splitSamplePrefix('Glucosio urinaria')).toEqual({ name: 'Glucosio', systems: urine });
    expect(splitSamplePrefix('Proteine urine 24 ore')).toEqual({ name: 'Proteine', systems: ['24H urine'] });
    expect(splitSamplePrefix('Creatinina 24h')).toEqual({ name: 'Creatinina', systems: ['24H urine'] });
  });
});

describe('spellGreek', () => {
  it.each([
    ['α1-antitripsina', 'alfa-1-antitripsina'],
    ['β2-microglobulina', 'beta-2-microglobulina'],
    ['γ GT', 'gamma- GT'],
    ['a1-antitripsina', 'alfa-1-antitripsina'],
    ['b-2 microglobulina', 'beta-2 microglobulina'],
    ['17-a-idrossiprogesterone', '17-alfa-idrossiprogesterone'],
  ])('spells %s as %s', (name, spelled) => {
    expect(spellGreek(name)).toBe(spelled);
  });

  it('leaves Latin letters that are no Greek stand-ins as they are', () => {
    for (const name of ['D-dimero', 'Vitamina A', 'B-HCG', 'gGT', 'Apolipoproteina B']) expect(spellGreek(name)).toBe(name);
  });
});

describe('readAntibody', () => {
  it.each([
    ['Anticorpi anti tireoglobulina', 'tireoglobulina ab'],
    ['Anticorpi anti-tireoglobulina', 'tireoglobulina ab'],
    ['Ab anti tireoglobulina', 'tireoglobulina ab'],
    ['Antic. anti tireoglobulina', 'tireoglobulina ab'],
    ['A. A. tireoglobulina', 'tireoglobulina ab'],
    ['Anti-tireoglobulina', 'tireoglobulina ab'],
    ['Tireoglobulina anticorpi', 'Tireoglobulina ab'],
    ['Tireoglobulina (anticorpi)', 'Tireoglobulina ab'],
  ])('reads %s as %s', (name, read) => {
    expect(readAntibody(name)).toBe(read);
  });

  it('leaves a name naming no antibody as it is', () => {
    for (const name of ['Antitrombina III', 'Antigene carcinoembrionario', 'Tireoglobulina']) expect(readAntibody(name)).toBe(name);
  });
});

describe('learnedKey', () => {
  it('joins the printed name and the unit as UCUM', () => {
    expect(learnedKey({ name: ' Glucosio ', unit: 'mg/dl' })).toBe(learnedKey({ name: 'glucosio', unit: 'mg/dL' }));
    expect(learnedKey({ name: 'Glucosio', unit: 'mg/dL' })).toBe('glucosio|mg/dL');
  });

  it('keeps a unit UCUM does not read as printed', () => {
    expect(learnedKey({ name: 'Colore', unit: ' Paglierino ' })).toBe('colore|paglierino');
  });
});

describe('matchLocally in the generated catalog', () => {
  // Reading the 13 MB catalog and building its search index take seconds on a busy machine
  beforeAll(async () => {
    (await loadCatalog()).scoredSearch('glucosio');
  }, 60_000);

  it.each([
    ['Hb', 'g/dL', '718-7'],
    ['Piastrine', '10^9/L', '777-3'],
  ])('takes the blood count, not a serum or plasma test, for %s in %s', async (name, unit, code) => {
    expect(matchLocally(await loadCatalog(), { name, unit })).toMatchObject({ status: 'match', code });
  });

  // Made-up wordings like those of Italian reports, each with the test it is
  it.each([
    ['P-Creatinina (metodo enzimatico)', 'mg/dL', undefined, '2160-0'],
    ['P-Creatinina (metodo enzimatico)', 'µmol/L', undefined, '14682-9'],
    ['Sodio', 'mmol/L', undefined, '2951-2'],
    ['Glucosio', 'mmol/L', undefined, '14749-6'],
    ['Colesterolo HDL', 'mg/dL', undefined, '2085-9'],
    ['Colesterolo totale', 'mg/dL', undefined, '2093-3'],
    ['P-Proteine totali', 'g/L', undefined, '2885-2'],
    ['Vitamina B12', 'pg/mL', undefined, '2132-9'],
    ['Proteina C reattiva', 'mg/L', undefined, '1988-5'],
    ['S-Tirotropina (TSH)', 'mUI/L', undefined, '3016-3'],
    ['alfa-1', '%', undefined, '13978-2'],
    ['alfa-2', '%', undefined, '13981-6'],
    ['Reticolociti', '%', undefined, '17849-1'],
    ['Urea', 'mg/dL', undefined, '3091-6'],
    ['Urea', 'mmol/L', undefined, '22664-7'],
    ['Glucosio', 'mg/dL', 'urine', '2350-7'],
    ['Proteine', 'mg/dL', 'urine', '2888-6'],
    ['U-Creatinina', 'µmol/L', undefined, '14683-7'],
    ['U-Proteine/Creatinina', 'mg/gcreat.', undefined, '2890-2'],
    // LOINC files mg/mmol under its own ratio code, which wins over 2890-2 HemoIO describes in it
    ['Proteine/creatinina urine', 'mg/mmol', undefined, '34366-5'],
    // Not "Vitamin D+Metabolites", the name of "Vitamina D" alone
    ['Vitamina D (25-OH)', 'ng/mL', undefined, '62292-8'],
    ['ALT', 'U/L', 'blood', '1742-6'],
    // A long common name printed in full is that test
    ['Glucose [Mass/volume] in Blood', 'mg/dL', undefined, '2339-0'],
    ['Calcium [Mass/volume] in Blood', 'mg/dL', undefined, '49765-1'],
    ['Glucosio siero', 'mg/dL', undefined, '2345-7'],
    // Serum and blood sodium trend together: "sangue", said loosely, takes the more common
    ['Sodio sangue', 'mmol/L', undefined, '2951-2'],
    ['Sg-Sodio', 'mmol/L', undefined, '2947-0'],
    // The LOINC test of the unit's property, not one HemoIO describes in that unit
    ['Microalbumina', 'µg/min', 'urine', '49023-5'],
    ['Albumina', 'g/dL', undefined, '1751-7'],
    ['S-Albumina', 'g/L', undefined, '1751-7'],
    // The red cell indices of a blood count
    ['MCV', 'fL', undefined, '787-2'],
    ['MCH', 'pg', undefined, '785-6'],
    ['MCHC', 'g/dL', undefined, '786-4'],
    ['Emoglobina', 'g/dL', undefined, '718-7'],
    ['U Albumina 24h', 'mg/24h', undefined, '1755-8'],
    ['Eritrociti', 'per campo', 'urine', '13945-1'],
    ['Fibrinogeno', 'mg/dL', undefined, '3255-7'],
    // LOINC's abbreviation of the component leads its short name: "Hct VFr Bld Auto"
    ['Hct', '%', undefined, '4544-3'],
    // "-uria" says the substance is in urine
    ['Microalbuminuria', 'µg/min', undefined, '49023-5'],
    // A molar code LOINC gives no rank, kept for the ranked mass code it trends with
    ['U-Glucosio', 'mmol/L', undefined, '15076-3'],
    ['CRP', 'nmol/L', undefined, '76485-2'],
    // Words many tests share, which are a name of one
    ['IgG', 'mg/dL', undefined, '2465-3'],
    ['Se-IgG', 'g/L', undefined, '2465-3'],
    // HemoIO describes HbA1c in mmol/mol, which LOINC files under an adjusted, rarer code
    ['HbA1c', 'mmol/mol', undefined, '4548-4'],
    ['Emoglobina glicata (HbA1c)', 'mmol/mol', undefined, '4548-4'],
    // Not "Vitamin D+Metabolites", a rarer test with "total vitamin D" among its related names
    ['Vitamina D', 'ng/mL', undefined, '62292-8'],
    ['Vitamin D', 'ng/mL', undefined, '62292-8'],
    // A day's unit is the 24-hour collection, as is the AI's "24h urine"
    ['Proteinuria', 'mg/24h', undefined, '2889-4'],
    ['Proteinuria', 'mg/24h', '24h urine', '2889-4'],
    ['Proteine urinarie', 'mg/24h', undefined, '2889-4'],
    ['Calcio urinario', 'mg/24h', undefined, '6874-2'],
    ['Sodio urinario', 'mmol/24h', undefined, '2956-1'],
    ['Creatinina 24hr', 'mg/24h', undefined, '2162-6'],
    // The serum and plasma words of either number and gender
    ['Calcio sierica', 'mg/dL', undefined, '17861-6'],
    ['Glucosio plasmatica', 'mg/dL', undefined, '2345-7'],
    // The eGFR HemoIO describes stands for the rates that trend with it
    ['GFR', 'mL/min/1.73m2', undefined, '98979-8'],
    // Lab spellings of units: the mole as "M" or "moli", grams as "gr", a share's words
    ['Litio', 'mM/L', undefined, '14334-7'],
    ['Omocisteina', 'umoli/L', undefined, '13965-9'],
    ['Proteine urinarie', 'gr/24h', undefined, '2889-4'],
    ['Carbossiemoglobina', '% Hb totale', 'blood', '20563-3'],
    ['Microalbumina', 'mg/g di creatinina', 'urine', '14959-1'],
    ['White blood cells', 'K/mcL', 'blood', '6690-2'],
    ['Amilasi', 'U/24 h', 'urine', '1800-2'],
    // Not a variant LOINC names with a challenge or a time
    ['Calcitonina', 'pg/mL', undefined, '1992-7'],
    ['ACTH', 'pg/mL', 'plasma', '2141-0'],
    // A substance said of blood by "-emia", of red cells by "eritrocitario"
    ['Uricemia', 'mg/dL', undefined, '3084-1'],
    ['Folati eritrocitari', 'ng/mL', 'blood', '2283-0'],
    // Antibodies as LOINC names them, Greek letters spelled out, a letter and its number apart
    ['Anticorpi anti tireoperossidasi', 'UI/mL', undefined, '8099-4'],
    ['a1-Antitripsina', 'g/L', undefined, '1825-9'],
    ['Vitamina B 12', 'pg/mL', undefined, '2132-9'],
    // Serum and blood bicarbonate trend together: a blood hint takes the more common
    ['Bicarbonato', 'mmol/L', 'blood', '1963-8'],
    // A blood count said of blood, by machine; "absolute" only says the count the unit says
    ['Platelet count', 'K/mcL', 'blood', '777-3'],
    ['Neutrophil, Absolute', 'K/mcL', 'blood', '751-8'],
    ['Neutrofili assoluti', '10^3/µL', undefined, '751-8'],
    // The beta subunit the name says, the most common hCG quantity LOINC has (19080-1, total hCG, fits it less)
    ['Beta-HCG', 'mUI/mL', undefined, '21198-7'],
  ])('takes %s in %s (sample %s) as %s', async (name, unit, specimenHint, code) => {
    const value = { name, unit, ...(specimenHint && { specimenHint }) };
    expect(matchLocally(await loadCatalog(), value)).toMatchObject({ status: 'match', code });
  });

  it.each([
    ['Filtrato glomerulare (eGFR)', 'mL/min/1,73m^2'],
    ['P-ANCA', 'U/mL'],
    ['Ematocrito', '%'],
    ['Globuli bianchi', '10^3/µL'],
  ])('leaves %s in %s to the AI or the user, with candidates', async (name, unit) => {
    const result = matchLocally(await loadCatalog(), { name, unit });
    expect(result.status).not.toBe('match');
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it.each([
    // Blood is said loosely of serum tests too
    ['Glucosio sangue', 'mg/dL', '2339-0'],
    ['Glucosio su sangue', 'mg/dL', '2339-0'],
    ['Glucose, Blood', 'mg/dL', '2339-0'],
    ['Potassio sangue', 'mmol/L', undefined],
    ['Calcium, Blood', 'mg/dL', '49765-1'],
    // The tests of the unit's property come first, the one HemoIO describes in it is not taken
    ['Alfa-fetoproteina', 'IU/mL', '19176-7'],
    ['AFP', 'kU/L', '19176-7'],
    // Two of its LOINC name's words written as one
    ['Alfafetoproteina', 'IU/mL', '19176-7'],
    // FEU and DDU differ about two-fold: neither is taken for the other
    ['D-dimero', 'ng/mL', undefined],
    // A renin activity is not measured in µIU/mL, nor a ratio to creatinine in mIU/mL
    ['Renina', 'µUI/mL', undefined],
    ['LH urinario', 'mUI/mL', undefined],
    // C3 activator is not complement C3 because "complemento" in brackets names it
    ['C3 attivatore (complemento)', 'mg/L', undefined],
  ])('leaves %s in %s ambiguous', async (name, unit, first) => {
    const result = matchLocally(await loadCatalog(), { name, unit });
    expect(result.status).toBe('ambiguous');
    if (first) expect(result.candidates[0].code).toBe(first);
  });

  it('asks whether ethanol said of blood is the blood or the serum test, which trend apart', async () => {
    const catalog = await loadCatalog();
    for (const name of ['Etanolo ematico', 'Etanolo sangue']) {
      const result = matchLocally(catalog, { name, unit: 'g/L' });
      expect(result.status).toBe('ambiguous');
      expect(codesOf(result)).toEqual(expect.arrayContaining(['5643-2', '5640-8']));
    }
    expect(catalog.trendGroup('5643-2')).not.toBe(catalog.trendGroup('5640-8'));
  });

  it('asks whether an LDL cholesterol that does not say so was calculated or measured directly', async () => {
    const catalog = await loadCatalog();
    for (const name of ['Colesterolo LDL', 'LDL Cholesterol']) {
      const result = matchLocally(catalog, { name, unit: 'mg/dL' });
      expect(result.status).toBe('ambiguous');
      expect(codesOf(result)).toEqual(expect.arrayContaining(['13457-7', '2089-1', '18262-6']));
    }
    // The calculated and the measured tests trend apart
    expect(new Set(['13457-7', '2089-1', '18262-6'].map((code) => catalog.trendGroup(code))).size).toBe(3);
  });

  it('never takes the blood test for a fasting glucose in mmol/L, whose serum test LOINC gives no rank', async () => {
    const catalog = await loadCatalog();
    const result = matchLocally(catalog, { name: 'Fasting glucose', unit: 'mmol/L' });
    expect(result.status === 'match' ? result.code : undefined).not.toBe('76629-5');
    expect(codesOf(result)).toContain('14771-0');
    expect(catalog.trendGroup('14771-0')).toBe(catalog.trendGroup('1558-6'));
  });

  it.each([
    ['Fosforo', 'mg/dL', '2777-1'],
    ['S-Fosforo', 'mg/dL', '2777-1'],
    ['Fosforo sierico', 'mg/dL', '2777-1'],
    ['Ematocrito', '%', '4544-3'],
    ['Beta 1', '%', '32732-0'],
    ['Beta 2', 'g/dL', '32731-2'],
    ['HbA1c (IFCC)', 'mmol/mol', '4548-4'],
    ['Calciuria', 'mg/24h', '6874-2'],
    ['Urea urinaria', 'g/24h', '48999-7'],
    ['Se-PCR', 'mg/L', undefined],
    ['IgE totali', 'kU/L', '19113-0'],
  ])('never takes %s in %s without asking, and offers the test meant', async (name, unit, code) => {
    const result = matchLocally(await loadCatalog(), { name, unit });
    expect(result.status).toBe('ambiguous');
    if (code) expect(codesOf(result)).toContain(code);
  });

  it('keeps a 24-hour value in a day\'s unit off the other timed collections', async () => {
    const catalog = await loadCatalog();
    for (const value of [
      { name: 'Proteinuria', unit: 'mg/24h' },
      { name: 'Calcio urinario', unit: 'mg/24h' },
      { name: 'Urea urinaria', unit: 'g/24h' },
      { name: 'Glucosio', unit: 'mg/24h', specimenHint: 'urine' },
    ]) {
      const result = matchLocally(catalog, value);
      const tests = result.candidates.filter(({ score }) => score > 0).map(({ code }) => catalog.test(code)!);
      expect(tests.length).toBeGreaterThan(0);
      expect(tests.every((test) => /24 hour Urine/.test(test.name))).toBe(true);
    }
  });

  it('files a value in % and in mmol/mol, and one in ng/mL and in nmol/L, under one test each', async () => {
    const catalog = await loadCatalog();
    const trendOf = (name: string, unit: string): string => {
      const result = matchLocally(catalog, { name, unit });
      return result.status === 'match' ? catalog.trendGroup(result.code) : result.status;
    };
    expect(trendOf('HbA1c', 'mmol/mol')).toBe(trendOf('HbA1c', '%'));
    expect(trendOf('Vitamina D', 'nmol/L')).toBe(trendOf('Vitamina D', 'ng/mL'));
    expect(trendOf('Fosfato urine 24h', 'mmol/24h')).toBe(trendOf('Fosfato urine 24h', 'mg/24h'));
  });

  it('offers the HbA1c test HemoIO describes in mmol/mol, which LOINC files as a mass share', async () => {
    const result = matchLocally(await loadCatalog(), { name: 'Er-EMOGLOBINA GLICATA', unit: 'mmol/mol Hb' });
    expect(result.candidates.map(({ code }) => code)).toContain('4548-4');
  });

  it('offers filtration rates for eGFR, and myeloperoxidase antibodies for P-ANCA', async () => {
    const catalog = await loadCatalog();
    const egfr = matchLocally(catalog, { name: 'Filtrato glomerulare (eGFR)', unit: 'mL/min/1,73m^2' });
    expect(egfr.candidates.every(({ name }) => name.startsWith('Glomerular filtration rate'))).toBe(true);
    const anca = matchLocally(catalog, { name: 'P-ANCA', unit: 'U/mL' });
    expect(anca.candidates[0].name).toMatch(/^Myeloperoxidase Ab/);
  });

  it.each([
    ['B-HCG', 'mUI/mL'],
    ['P-ANCA', 'U/mL'],
  ])('reads %s whole when its prefix-looking start finds nothing', async (name, unit) => {
    const result = matchLocally(await loadCatalog(), { name, unit });
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});
