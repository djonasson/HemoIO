import { describe, it, expect } from 'vitest';
import { BIOMARKER_DEFINITIONS, getBiomarkerByKey } from './dictionary';
import { RELATED_BIOMARKER_GROUPS } from './related';

describe('related biomarkers', () => {
  it('curates the groups the spec names', () => {
    expect(Object.keys(RELATED_BIOMARKER_GROUPS).sort()).toEqual(
      [
        'cbc-indices',
        'electrolytes',
        'glucose-metabolism',
        'iron',
        'kidney',
        'lipids',
        'liver',
        'thyroid',
      ].sort()
    );
  });

  it('only names biomarkers that exist', () => {
    for (const biomarker of BIOMARKER_DEFINITIONS) {
      for (const key of biomarker.related) {
        expect(getBiomarkerByKey(key), `${biomarker.key} → ${key}`).toBeDefined();
      }
    }
    for (const keys of Object.values(RELATED_BIOMARKER_GROUPS)) {
      for (const key of keys) expect(getBiomarkerByKey(key), key).toBeDefined();
    }
  });

  it('relates biomarkers both ways and never to themselves', () => {
    for (const biomarker of BIOMARKER_DEFINITIONS) {
      expect(biomarker.related).not.toContain(biomarker.key);
      for (const key of biomarker.related) {
        expect(getBiomarkerByKey(key)?.related, `${key} → ${biomarker.key}`).toContain(
          biomarker.key
        );
      }
    }
  });

  it('relates glucose to HbA1c', () => {
    expect(getBiomarkerByKey('glucose')?.related).toContain('hemoglobin-a1c');
  });

  it('gives biomarkers outside the groups no relations', () => {
    expect(getBiomarkerByKey('semen-volume')?.related).toEqual([]);
  });
});
