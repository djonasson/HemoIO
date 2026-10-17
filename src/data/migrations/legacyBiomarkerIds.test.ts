import { describe, it, expect } from 'vitest';
import { LEGACY_ID_ORDER, legacyIdToKey } from './legacyBiomarkerIds';
import { ISSUED_BIOMARKER_KEYS } from '@data/biomarkers/keys.snapshot';

describe('legacyIdToKey', () => {
  it('maps 1-based dictionary positions to keys', () => {
    expect(legacyIdToKey(1)).toBe(LEGACY_ID_ORDER[0]);
    expect(legacyIdToKey(LEGACY_ID_ORDER.length)).toBe(LEGACY_ID_ORDER[LEGACY_ID_ORDER.length - 1]);
  });

  it('maps known positions to the biomarkers they referred to', () => {
    expect(legacyIdToKey(1)).toBe('white-blood-cell-count');
    expect(legacyIdToKey(3)).toBe('hemoglobin');
  });

  it('maps hash IDs of unknown biomarkers to legacy unknown keys', () => {
    expect(legacyIdToKey(10042)).toBe('unknown:legacy-10042');
  });

  it('maps IDs outside the dictionary to legacy unknown keys instead of guessing', () => {
    expect(legacyIdToKey(0)).toBe('unknown:legacy-0');
    expect(legacyIdToKey(-3)).toBe('unknown:legacy--3');
    expect(legacyIdToKey(LEGACY_ID_ORDER.length + 1)).toBe(`unknown:legacy-${LEGACY_ID_ORDER.length + 1}`);
    expect(legacyIdToKey(2.5)).toBe('unknown:legacy-2.5');
  });

  it('only refers to keys that were issued', () => {
    const issued = new Set(ISSUED_BIOMARKER_KEYS);
    LEGACY_ID_ORDER.forEach((key) => expect(issued.has(key), key).toBe(true));
  });
});
