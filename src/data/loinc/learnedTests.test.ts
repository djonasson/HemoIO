import { describe, it, expect } from 'vitest';
import { learnFromSaved, learnedWording, withMarks } from './learnedTests';

describe('learnFromSaved', () => {
  it('learns the code of every saved value the user confirmed', () => {
    expect(
      learnFromSaved({}, [
        { key: 'glucosio|mg/dL', code: '2339-0', confirmed: true },
        { key: 'zorblatina|mg/dL', code: 'unknown:zorblatina', confirmed: true },
      ])
    ).toEqual({ 'glucosio|mg/dL': '2339-0', 'zorblatina|mg/dL': 'unknown:zorblatina' });
  });

  it('learns nothing of values the user did not confirm, or that have no code', () => {
    expect(
      learnFromSaved({}, [
        { key: 's-alt|U/L', code: '1742-6', confirmed: false },
        { key: 'zorb|mg/dL', confirmed: true },
        { key: '', code: '2339-0', confirmed: true },
      ])
    ).toEqual({});
  });

  it('replaces what was learned for the wording with the newer choice, and keeps the rest', () => {
    const learned = { 'glucosio|mg/dL': '2339-0', 'hb|g/dL': '718-7' };
    expect(
      learnFromSaved(learned, [{ key: 'glucosio|mg/dL', code: 'unknown:glucosio', confirmed: true }])
    ).toEqual({ 'glucosio|mg/dL': 'unknown:glucosio', 'hb|g/dL': '718-7' });
    expect(learned['glucosio|mg/dL']).toBe('2339-0');
  });
});

describe('learned keys and codes', () => {
  it('reads a key as its wording and unit', () => {
    expect(learnedWording('glucosio|mg/dL')).toBe('glucosio (mg/dL)');
    expect(learnedWording('nitriti|')).toBe('nitriti');
  });

  it('says a key of a result in words, or of a urine sediment section', () => {
    expect(learnedWording('nitriti|#words')).toBe('nitriti (in words)');
    expect(learnedWording('batteri|#words#sediment')).toBe('batteri (in words, urine sediment)');
    expect(learnedWording('leucociti|/[HPF]#sediment')).toBe('leucociti (/[HPF], urine sediment)');
    expect(learnedWording('batteri|#sediment#words')).toBe('batteri (in words, urine sediment)');
  });

  it('marks a key by how its value was printed', () => {
    expect(withMarks('batteri|', { inWords: true, ofSediment: true })).toBe('batteri|#words#sediment');
    expect(withMarks('batteri|/uL', { inWords: false, ofSediment: false })).toBe('batteri|/uL');
  });
});
