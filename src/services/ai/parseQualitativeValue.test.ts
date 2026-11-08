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

  it("reads a word the scale knows by the scale, whatever number the model gave", () => {
    expect(parseExtractedValue(1, 'Tracce').qualitative).toEqual({ text: 'Tracce', kind: 'ordinal', value: 0.5 });
  });

  it("keeps the model's number for a word the scale does not know", () => {
    expect(parseExtractedValue(1, 'Reattivo').qualitative).toEqual({ text: 'Reattivo', kind: 'boolean', value: 1 });
    expect(parseExtractedValue(3, 'Molti').qualitative).toEqual({ text: 'Molti', kind: 'ordinal', value: 3 });
  });

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
    expect(parseExtractedValue('vedere valore leucociti', undefined)).toMatchObject({
      value: 0,
      rawValue: 'vedere valore leucociti',
    });
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
