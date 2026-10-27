// src/services/ai/prompts.test.ts
import { describe, it, expect } from 'vitest';
import { ENHANCED_SYSTEM_PROMPT, RESPONSE_SCHEMA } from './prompts';

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
