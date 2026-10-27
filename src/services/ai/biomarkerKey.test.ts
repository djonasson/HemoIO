// src/services/ai/biomarkerKey.test.ts
import { describe, it, expect } from 'vitest';
import { readBiomarkerKey } from './biomarkerKey';

describe('readBiomarkerKey', () => {
  it('reads the key the model gave, trimmed', () => {
    expect(readBiomarkerKey({ biomarkerKey: ' urine-creatinine ' })).toBe('urine-creatinine');
  });

  it('treats null, empty and non-string keys as absent', () => {
    for (const biomarkerKey of [null, '', '   ', 42, true, {}, undefined]) {
      expect(readBiomarkerKey({ biomarkerKey })).toBeUndefined();
    }
  });
});
