// src/services/ai/prompts.test.ts
import { describe, it, expect } from 'vitest';
import {
  LAB_REPORT_SYSTEM_PROMPT,
  RESPONSE_SCHEMA,
  TEST_CHOICE_SYSTEM_PROMPT,
  createTestChoicePrompt,
} from './prompts';

describe('the extraction prompt', () => {
  it('asks for the sample each value is from, and no longer lists tests to choose from', () => {
    expect(LAB_REPORT_SYSTEM_PROMPT).toContain('specimenHint');
    expect(LAB_REPORT_SYSTEM_PROMPT).not.toContain('KNOWN TESTS');
    expect(LAB_REPORT_SYSTEM_PROMPT).not.toContain('biomarkerKey');
  });

  it('accepts a sample or null in the response schema', () => {
    expect(RESPONSE_SCHEMA.properties.biomarkers.items.properties).toHaveProperty('specimenHint');
    expect(RESPONSE_SCHEMA.properties.biomarkers.items.properties).not.toHaveProperty('biomarkerKey');
  });

  it('asks for qualitative results of any test, as printed, with no unit', () => {
    expect(LAB_REPORT_SYSTEM_PROMPT).toContain('QUALITATIVE VALUES (any test');
    expect(LAB_REPORT_SYSTEM_PROMPT).toMatch(/"Batteri Assenti".*value: 0, unit: "", qualitativeValue: "Assenti"/);
    expect(LAB_REPORT_SYSTEM_PROMPT).toMatch(/"\+\+" → 2/);
    expect(RESPONSE_SCHEMA.properties.biomarkers.items.properties).toHaveProperty('qualitativeValue');
  });

  it('no longer skips a presence result as descriptive, only free text', () => {
    expect(LAB_REPORT_SYSTEM_PROMPT).not.toContain('Skip purely descriptive items');
    expect(LAB_REPORT_SYSTEM_PROMPT).toContain('Skip free text with no presence meaning');
  });

  it('asks for both units of a value printed in two, without a warning', () => {
    expect(LAB_REPORT_SYSTEM_PROMPT).toMatch(/printed in two units.*extract both.*do not add a warning/s);
  });
});

describe('the test choice prompt', () => {
  it('tells the model to choose only from the listed codes, or null, and when to doubt', () => {
    expect(TEST_CHOICE_SYSTEM_PROMPT).toMatch(/ONLY a code from/);
    expect(TEST_CHOICE_SYSTEM_PROMPT).toContain('null');
    expect(TEST_CHOICE_SYSTEM_PROMPT).toMatch(/"confident" to false when two or more candidates fit/);
  });

  it('says what a value printed with no unit is', () => {
    expect(TEST_CHOICE_SYSTEM_PROMPT).toMatch(/empty unit means a result with no unit: a unitless or ordinal one/);
  });

  it('lists each value with its unit, sample and every candidate, without scores', () => {
    const prompt = createTestChoicePrompt([
      {
        id: '1',
        name: 'Creatinina',
        unit: 'mg/dL',
        specimenHint: '24h urine',
        candidates: [{ code: '2162-6', name: 'Creatinine [Mass/volume] in Urine', score: 0.9 } as never],
      },
    ]);
    expect(prompt).toContain('"id":"1"');
    expect(prompt).toContain('Creatinina');
    expect(prompt).toContain('24h urine');
    expect(prompt).toContain('2162-6');
    expect(prompt).toContain('Creatinine [Mass/volume] in Urine');
    expect(prompt).not.toContain('0.9');
  });
});
