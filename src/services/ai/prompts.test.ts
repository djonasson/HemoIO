// src/services/ai/prompts.test.ts
import { describe, it, expect } from 'vitest';
import {
  ENHANCED_SYSTEM_PROMPT,
  RESPONSE_SCHEMA,
  TEST_CHOICE_SYSTEM_PROMPT,
  createTestChoicePrompt,
} from './prompts';

describe('the extraction prompt', () => {
  it('lists the known tests and asks for the key of each value', () => {
    expect(ENHANCED_SYSTEM_PROMPT).toContain('KNOWN TESTS');
    expect(ENHANCED_SYSTEM_PROMPT).toContain('urine-creatinine: Urine Creatinine');
    expect(ENHANCED_SYSTEM_PROMPT).toContain('biomarkerKey');
  });

  it('no longer tells the AI that urea is blood urea nitrogen', () => {
    expect(ENHANCED_SYSTEM_PROMPT).not.toMatch(/BUN: Blood Urea Nitrogen, Urea/);
  });

  it('accepts a key or null in the response schema', () => {
    expect(RESPONSE_SCHEMA.properties.biomarkers.items.properties).toHaveProperty('biomarkerKey');
  });
});

describe('the test choice prompt', () => {
  it('tells the model to choose only from the listed codes, or null, and when to doubt', () => {
    expect(TEST_CHOICE_SYSTEM_PROMPT).toMatch(/ONLY a code from/);
    expect(TEST_CHOICE_SYSTEM_PROMPT).toContain('null');
    expect(TEST_CHOICE_SYSTEM_PROMPT).toMatch(/"confident" to false when two or more candidates fit/);
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
    expect(prompt).toContain('"id": "1"');
    expect(prompt).toContain('Creatinina');
    expect(prompt).toContain('24h urine');
    expect(prompt).toContain('2162-6');
    expect(prompt).toContain('Creatinine [Mass/volume] in Urine');
    expect(prompt).not.toContain('0.9');
  });
});
