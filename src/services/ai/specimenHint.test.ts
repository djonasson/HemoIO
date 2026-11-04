import { describe, it, expect } from 'vitest';
import { withSpecimenHint } from './specimenHint';

describe('withSpecimenHint', () => {
  it('keeps the sample the model named, trimmed', () => {
    expect(withSpecimenHint({ specimenHint: ' 24h urine ' })).toEqual({ specimenHint: '24h urine' });
  });

  it('gives no hint for null, empty or malformed ones', () => {
    for (const specimenHint of [null, '', '   ', 42, true, {}, undefined]) {
      expect(withSpecimenHint({ specimenHint })).toEqual({});
    }
  });
});
