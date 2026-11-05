import { describe, expect, it } from 'vitest';
import { isUnknownKey, nameKey, unknownBiomarkerKey } from './keys';

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
    expect(nameKey('À')).toBe('à');
  });
});
