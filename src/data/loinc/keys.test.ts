import { describe, expect, it } from 'vitest';
import { foldDashes, isUnknownKey, nameKey, unknownBiomarkerKey } from './keys';

describe('unknownBiomarkerKey', () => {
  it('builds stable keys for values that are not a LOINC test', () => {
    expect(unknownBiomarkerKey('Zorblatin')).toBe('unknown:zorblatin');
    expect(unknownBiomarkerKey('  Zorb-latin (serum) ')).toBe('unknown:zorblatinserum');
  });

  it('keeps percentage and absolute-count variants apart', () => {
    // e.g. "IG%" vs "IG#"
    expect(unknownBiomarkerKey('IG%')).not.toBe(unknownBiomarkerKey('IG#'));
    expect(unknownBiomarkerKey('IG%')).toBe('unknown:ig%');
    expect(unknownBiomarkerKey('IG#')).toBe('unknown:ig#');
  });

  it('gives the same key to the same name in different Unicode forms', () => {
    const composed = 'Glicemia à digiuno'.normalize('NFC');
    const decomposed = 'Glicemia à digiuno'.normalize('NFD');
    expect(unknownBiomarkerKey(decomposed)).toBe(unknownBiomarkerKey(composed));
  });

  it('keeps combining marks that distinguish names', () => {
    // Devanagari vowel signs are combining marks; dropping them merges names
    expect(unknownBiomarkerKey('रक्त')).not.toBe(unknownBiomarkerKey('रकत'));
  });

  it('never builds an empty key', () => {
    expect(unknownBiomarkerKey('—')).toBe('unknown:unnamed');
    expect(unknownBiomarkerKey('')).toBe('unknown:unnamed');
    // Non-Latin names keep their letters
    expect(unknownBiomarkerKey('血糖')).toBe('unknown:血糖');
  });
});

describe('isUnknownKey', () => {
  it('tells an unknown key from a LOINC code', () => {
    expect(isUnknownKey(unknownBiomarkerKey('Zorblatin'))).toBe(true);
    expect(isUnknownKey('2345-7')).toBe(false);
  });
});

describe('nameKey', () => {
  it('reads a name with case, spacing and accent encoding aside', () => {
    expect(nameKey('  Glicemia   À ')).toBe(nameKey('glicemia à'.normalize('NFD').normalize('NFC')));
    expect(nameKey('À')).toBe('a');
  });
});

describe('foldDashes', () => {
  it.each(['\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2015', '\u2212', '\uFE58', '\uFE63', '\uFF0D'])(
    'reads the dash %s as a hyphen',
    (dash) => {
      expect(foldDashes(`non${dash}HDL`)).toBe('non-HDL');
      expect(nameKey(`Colesterolo non${dash}HDL`)).toBe('colesterolo non-hdl');
    }
  );
});

describe('nameKey and accents', () => {
  it('reads a Latin letter with or without its accent as one letter', () => {
    expect(nameKey('Velocità di eritrosedimentazione')).toBe(nameKey('velocita di eritrosedimentazione'));
    expect(nameKey('Capacità ferrolegante')).toBe('capacita ferrolegante');
  });

  it("reads an apostrophe written for a final accent as that accent: \"capacita'\"", () => {
    expect(nameKey("capacita' ferrolegante")).toBe(nameKey('capacità ferrolegante'));
    // An elision is part of the word that follows
    expect(nameKey("dell'urina")).toBe("dell'urina");
  });

  it('keeps the marks other scripts need', () => {
    expect(nameKey('रक्त')).not.toBe(nameKey('रकत'));
  });
});
