import { describe, expect, it } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { createCatalog, loadCatalog } from '@data/loinc/catalog';
import { learnedKey, matchLocally, splitSamplePrefix } from './loincMatch';
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
    expect(splitSamplePrefix('Sg-Emoglobina')).toEqual({ name: 'Emoglobina', systems: ['Bld', 'Ser/Plas/Bld'] });
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

  it('reads the urinalysis section prefix as urine', () => {
    expect(splitSamplePrefix('U-Esame standard Glucosio')).toEqual({
      name: 'Glucosio',
      systems: ['Urine', 'Urine sed'],
    });
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
    // LOINC files mg/mmol as another ratio; HemoIO describes 2890-2 in it, and converts
    ['U-Proteine/Creatinina', 'mg/mmolcreat.', undefined, '2890-2'],
    // Not "Vitamin D+Metabolites", the name of "Vitamina D" alone
    ['Vitamina D (25-OH)', 'ng/mL', undefined, '62292-8'],
    ['ALT', 'U/L', 'blood', '1742-6'],
    ['U Albumina 24h', 'mg/24h', undefined, '1755-8'],
    ['Eritrociti', 'per campo', 'urine', '13945-1'],
    ['Fibrinogeno', 'mg/dL', undefined, '3255-7'],
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
