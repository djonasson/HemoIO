import { describe, expect, it } from 'vitest';
import { heldQualitative, parseExtractedValue, readQualitativeWord } from './parseQualitativeValue';

describe('readQualitativeWord', () => {
  it.each(['Assenti', 'assente', 'Negativo', 'negative', 'absent', 'Non rilevato', 'not detected'])(
    'reads "%s" as absent, 0',
    (word) => {
      expect(readQualitativeWord(word)).toEqual({ kind: 'boolean', value: 0 });
    }
  );

  it.each(['Presenti', 'presente', 'Positivo', 'positive', 'present', 'Rilevato', 'detected'])(
    'reads "%s" as present, 1',
    (word) => {
      expect(readQualitativeWord(word)).toEqual({ kind: 'boolean', value: 1 });
    }
  );

  it.each([
    ['Tracce', 0.5],
    ['traces', 0.5],
    ['+', 1],
    ['++', 2],
    ['+++', 3],
    ['++++', 4],
    ['2+', 2],
    ['Positivo ++', 2],
  ])('reads "%s" on the ordinal scale as %s', (word, value) => {
    expect(readQualitativeWord(word)).toEqual({ kind: 'ordinal', value });
  });

  it.each([
    ['Rari', 1],
    ['rare', 1],
    ['Occasionali', 1],
    ['occasional', 1],
    ['Scarsi', 1],
    ['Alcuni', 2],
    ['few', 2],
    ['Frequenti', 3],
    ['Numerosi', 4],
    ['Molti', 4],
    ['many', 4],
  ])('reads the count "%s" on the crosses\' steps as %s, above traces', (word, value) => {
    expect(readQualitativeWord(word)).toEqual({ kind: 'ordinal', value });
  });

  it('reads past brackets, full stops and spacing', () => {
    expect(readQualitativeWord('  (Assenti.) ')).toEqual({ kind: 'boolean', value: 0 });
    expect(readQualitativeWord('non   rilevato')).toEqual({ kind: 'boolean', value: 0 });
  });

  it.each(['vedere valore leucociti', 'giallo paglierino', '5.5', '+++++', ''])(
    'does not read "%s"',
    (word) => {
      expect(readQualitativeWord(word)).toBeUndefined();
    }
  );
});

describe('parseExtractedValue', () => {
  it('keeps the printed word with the number its scale gives', () => {
    expect(parseExtractedValue(0, 'Assenti')).toEqual({
      value: 0,
      isInterval: false,
      qualitative: { text: 'Assenti', kind: 'boolean', value: 0 },
    });
  });

  it('reads a word by the scale when the model gave no number', () => {
    expect(parseExtractedValue(undefined, 'Tracce').qualitative).toEqual({ text: 'Tracce', kind: 'ordinal', value: 0.5 });
    expect(parseExtractedValue('', 'Negativo')).toMatchObject({ value: 0, qualitative: { text: 'Negativo', value: 0 } });
    expect(parseExtractedValue('n.d.', 'Assenti')).toMatchObject({ value: 0, qualitative: { text: 'Assenti' } });
  });

  it('keeps a count in words over a 0 or no number: cells were seen', () => {
    expect(parseExtractedValue(0, 'Rari')).toEqual({ value: 1, isInterval: false, qualitative: { text: 'Rari', kind: 'ordinal', value: 1 } });
    expect(parseExtractedValue(undefined, 'few')).toMatchObject({ value: 2, qualitative: { text: 'few' } });
    expect(parseExtractedValue('Numerosi', undefined)).toMatchObject({ value: 4, qualitative: { text: 'Numerosi' } });
    // A measured count is kept beside it
    expect(parseExtractedValue(5, 'Rari')).toEqual({ value: 5, isInterval: false });
    expect(parseExtractedValue('0-2', 'Rari')).toMatchObject({ isInterval: true, intervalLow: 0, intervalHigh: 2 });
  });

  it('never lets a word replace a measured number', () => {
    expect(parseExtractedValue(0.05, 'Negativo')).toEqual({ value: 0.05, isInterval: false });
    expect(parseExtractedValue(150, 'Positivo')).toEqual({ value: 150, isInterval: false });
    expect(parseExtractedValue(1, 'Tracce')).toEqual({ value: 1, isInterval: false });
    expect(parseExtractedValue('< 1', 'Positivo')).toMatchObject({ value: 1, censored: '<' });
    expect(parseExtractedValue('0-1', 'Negativo')).toMatchObject({ isInterval: true });
  });

  it.each(['N/A', 'none', 'Normale', '95 mg/dL', '≤ 0,2', 'Reattivo'])(
    'never makes a value a word for %o, which the scale does not know',
    (word) => {
      expect(parseExtractedValue(95, word)).toEqual({ value: 95, isInterval: false });
      expect(parseExtractedValue(1, word).qualitative).toBeUndefined();
    }
  );

  it('reads a word given as the value, with no number', () => {
    expect(parseExtractedValue('Positivo', undefined)).toEqual({
      value: 1,
      isInterval: false,
      qualitative: { text: 'Positivo', kind: 'boolean', value: 1 },
    });
  });

  it('reads a number or an interval as before', () => {
    expect(parseExtractedValue(5.5, undefined)).toEqual({ value: 5.5, isInterval: false });
    expect(parseExtractedValue('5-10', undefined)).toMatchObject({
      value: 7.5,
      isInterval: true,
      intervalLow: 5,
      intervalHigh: 10,
    });
  });

  it('ignores an empty word, and a number given as the word', () => {
    expect(parseExtractedValue(5.5, '  ')).toEqual({ value: 5.5, isInterval: false });
    expect(parseExtractedValue(5.5, '5,5')).toEqual({ value: 5.5, isInterval: false });
  });

  it('keeps free text with no presence meaning unread, as before', () => {
    const read = parseExtractedValue('vedere valore leucociti', undefined);
    expect(read.value).toBeNaN();
    expect(read).toMatchObject({ rawValue: 'vedere valore leucociti' });
  });
});

describe('heldQualitative', () => {
  const qualitative = { text: 'Assenti', kind: 'boolean' as const, value: 0 };

  it('holds while the value is the number the word reads as', () => {
    expect(heldQualitative({ value: 0, qualitative })).toBe(qualitative);
  });

  it('no longer holds once the value is another number', () => {
    expect(heldQualitative({ value: 1, qualitative })).toBeUndefined();
    expect(heldQualitative({ value: NaN, qualitative })).toBeUndefined();
  });

  it('is undefined for a value with no word', () => {
    expect(heldQualitative({ value: 0 })).toBeUndefined();
  });
});
