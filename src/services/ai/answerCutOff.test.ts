import { describe, it, expect } from 'vitest';
import { ANSWER_CUT_OFF, answerCutOffError, longerAnswerLimit } from './answerCutOff';
import { AIAnalysisError } from './types';

describe('longerAnswerLimit', () => {
  it('is four times the limit cut off', () => {
    expect(longerAnswerLimit(4096)).toBe(16384);
  });

  it("never goes above the model's own limit", () => {
    expect(longerAnswerLimit(16000, 32000)).toBe(32000);
  });

  it('is none when the model can write no more', () => {
    expect(longerAnswerLimit(8192, 8192)).toBeUndefined();
    expect(longerAnswerLimit(10000, 8192)).toBeUndefined();
  });
});

describe('answerCutOffError', () => {
  it('says the answer was cut off before all values were read, and to split the report', () => {
    const error = answerCutOffError('anthropic', 64000, 128000);

    expect(error).toBeInstanceOf(AIAnalysisError);
    expect(error.code).toBe(ANSWER_CUT_OFF);
    expect(error.provider).toBe('anthropic');
    expect(error.message).toBe(
      "The AI's answer was cut off at HemoIO's limit of 64000 tokens before all values were read. " +
        'Split the report into smaller files and import them one by one.'
    );
  });

  it("names the model's own limit when that was reached", () => {
    expect(answerCutOffError('openai', 16384, 16384).message).toMatch(/at the model's limit of 16384 tokens/);
  });

  it('says what else happened', () => {
    expect(answerCutOffError('ollama', 2048, Infinity, 'Asking again with more room failed (timeout).').message).toMatch(
      /before all values were read\. Asking again with more room failed \(timeout\)\. Split the report/
    );
  });
});
