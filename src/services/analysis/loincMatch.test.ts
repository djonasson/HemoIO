import { describe, expect, it } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { createCatalog } from '@data/loinc/catalog';
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

  it('matches a test in mmol/L to its molar code', () => {
    const result = matchLocally(catalog, { name: 'Glucosio', unit: 'mmol/L' });
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

  it('does not let a whole-blood test make a serum test ambiguous without a sample', () => {
    const file = {
      version: 't',
      groups: [],
      tests: [madeUpTest('1-1', ['ferritina'], 'Bld'), madeUpTest('2-2', ['ferritina'])],
    };
    expect(matchLocally(createCatalog(file), { name: 'Ferritina', unit: 'ng/mL' })).toMatchObject({
      status: 'match',
      code: '2-2',
    });
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
