import { describe, expect, it } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { createCatalog, loadCatalog } from '@data/loinc/catalog';
import { learnedKey, matchLocally, splitSamplePrefix } from './loincMatch';
import type { CatalogTest } from '@data/loinc/catalog';

const catalog = fixtureCatalog();

/** A made-up serum test, for cases the fixture release does not have */
function madeUpTest(code: string, names: string[], system = 'Ser/Plas'): CatalogTest {
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
  };
}

describe('matchLocally', () => {
  it('matches a plasma test in mg/dL to its mass code', () => {
    const result = matchLocally(catalog, { name: 'P-Glucosio', unit: 'mg/dL' });
    expect(result).toMatchObject({ status: 'match', code: '2345-7' });
  });

  it('offers the molar codes for a test in mmol/L, ambiguous between serum and blood', () => {
    // 14749-6 (serum or plasma) and 15074-8 (blood) trend apart in the fixture release
    const result = matchLocally(catalog, { name: 'Glucosio', unit: 'mmol/L' });
    expect(result.status).toBe('ambiguous');
    expect(result.candidates.map((candidate) => candidate.code)).toEqual(['14749-6', '15074-8']);
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

  it('is none when no test fits', () => {
    expect(matchLocally(catalog, { name: 'Xyzzy', unit: 'mg/dL' })).toEqual({
      status: 'none',
      candidates: [],
    });
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
    expect(splitSamplePrefix('S-AFP')).toEqual({ name: 'AFP', systems: ['Ser', 'Ser/Plas'] });
    expect(splitSamplePrefix('Pl.Fibrinogeno')).toEqual({ name: 'Fibrinogeno', systems: ['Plas', 'Ser/Plas'] });
    expect(splitSamplePrefix('Sg-Emoglobina')).toEqual({ name: 'Emoglobina', systems: ['Bld'] });
    expect(splitSamplePrefix('U: Glucosio')).toEqual({ name: 'Glucosio', systems: ['Urine'] });
    expect(splitSamplePrefix('U24-Proteine')).toEqual({ name: 'Proteine', systems: ['24H urine'] });
  });

  it('leaves a name without a known prefix unchanged', () => {
    expect(splitSamplePrefix('Sodio')).toEqual({ name: 'Sodio' });
    expect(splitSamplePrefix('Sodio-Potassio')).toEqual({ name: 'Sodio-Potassio' });
    expect(splitSamplePrefix('PCR')).toEqual({ name: 'PCR' });
    expect(splitSamplePrefix('P.C.R.')).toEqual({ name: 'P.C.R.' });
  });

  it('reads the urinalysis section prefix as urine', () => {
    expect(splitSamplePrefix('U-Esame standard Glucosio')).toEqual({ name: 'Glucosio', systems: ['Urine'] });
  });

  it('reads urine and 24-hour words anywhere in the name', () => {
    expect(splitSamplePrefix('Glucosio urinario')).toEqual({ name: 'Glucosio', systems: ['Urine'] });
    expect(splitSamplePrefix('Glucosio urina')).toEqual({ name: 'Glucosio', systems: ['Urine'] });
    expect(splitSamplePrefix('Glucosio urinaria')).toEqual({ name: 'Glucosio', systems: ['Urine'] });
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
  ])('does not take a serum or plasma test for %s in %s, a blood count', async (name, unit, code) => {
    const result = matchLocally(await loadCatalog(), { name, unit });
    if (result.status === 'match') expect(result.code).toBe(code);
    expect(result.candidates.map((candidate) => candidate.code)).toContain(code);
  });

  it.each([
    ['B-HCG', 'mUI/mL'],
    ['P-ANCA', 'U/mL'],
  ])('reads %s whole when its prefix-looking start finds nothing', async (name, unit) => {
    const result = matchLocally(await loadCatalog(), { name, unit });
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});
