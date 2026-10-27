import { describe, it, expect } from 'vitest';
import { learnFromSaved, learnedAliasName, lookupLearnedAlias } from './learnedAliases';

describe('learned aliases', () => {
  it('learns a printed name saved under a test', () => {
    expect(learnFromSaved({}, [{ name: ' Zorblatina  (urine) ', key: 'urine-urea' }])).toEqual({
      'zorblatina (urine)': 'urine-urea',
    });
  });

  it('does not learn names the dictionary already knows, or unknown keys', () => {
    expect(
      learnFromSaved({}, [
        { name: 'Urea (urine)', key: 'urine-urea' },
        { name: 'Zorb', key: 'unknown:zorb' },
        { name: 'Zorb', key: undefined },
      ])
    ).toEqual({});
  });

  it('replaces a learned name with a newer test, and forgets it when saved as not in the dictionary', () => {
    const learned = { 'zorblatina (urine)': 'urine-urea' };
    expect(
      learnFromSaved(learned, [{ name: 'Zorblatina (urine)', key: 'urine-creatinine' }])
    ).toEqual({
      'zorblatina (urine)': 'urine-creatinine',
    });
    expect(learnFromSaved(learned, [{ name: 'Zorblatina (urine)', savedAsUnknown: true }])).toEqual(
      {}
    );
  });

  it('looks a name up as it was learned, ignoring case and spacing', () => {
    expect(
      lookupLearnedAlias({ 'zorblatina (urine)': 'urine-urea' }, 'ZORBLATINA  (urine)')?.key
    ).toBe('urine-urea');
    expect(lookupLearnedAlias({ x: 'no-such-key' }, 'x')).toBeUndefined();
    expect(learnedAliasName('  A   b ')).toBe('a b');
  });
});
