// src/services/ai/testList.test.ts
import { describe, it, expect } from 'vitest';
import { buildTestList } from './testList';
import { BIOMARKER_DEFINITIONS, getBiomarkerByKey } from '@data/biomarkers/dictionary';

describe('buildTestList', () => {
  it('gives one line per test: key, name, specimen and units', () => {
    const lines = buildTestList([getBiomarkerByKey('urine-creatinine')!]).split('\n');
    expect(lines).toEqual([
      'urine-creatinine: Urine Creatinine [urine; mg/dL, µmol/L, umol/L, g/L, mmol/L]',
    ]);
  });

  it('lists every dictionary test, in dictionary order', () => {
    const keys = buildTestList(BIOMARKER_DEFINITIONS)
      .split('\n')
      .map((line) => line.slice(0, line.indexOf(':')));
    expect(keys).toEqual(BIOMARKER_DEFINITIONS.map((d) => d.key));
  });

  it('marks a unitless test', () => {
    const ph = BIOMARKER_DEFINITIONS.find(
      (d) => d.canonicalUnit === '' && d.alternativeUnits.length === 0
    )!;
    expect(buildTestList([ph])).toMatch(/\[[^;]*; no unit\]$/);
  });
});
