// src/services/ai/ollamaContext.test.ts
import { describe, it, expect } from 'vitest';
import { ollamaContextSize } from './ollamaContext';

describe('ollamaContextSize', () => {
  it('fits the prompt and the answer, rounded up to a multiple of 1024', () => {
    // 35,000 characters ≈ 10,000 tokens, plus 4,096 for the answer
    expect(ollamaContextSize(35_000, 4096)).toBe(14_336);
  });

  it('never asks for less than 4096', () => {
    expect(ollamaContextSize(100, 256)).toBe(4096);
  });
});
