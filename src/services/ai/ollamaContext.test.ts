// src/services/ai/ollamaContext.test.ts
import { describe, it, expect } from 'vitest';
import { ollamaContext, promptTokens } from './ollamaContext';

const ollamaContextSize = (characters: number, answer: number, images = 0) =>
  ollamaContext(characters, answer, images, 0).size;

describe('ollamaContextSize', () => {
  it('fits the prompt and the answer, rounded up to a multiple of 4096', () => {
    // 35,000 characters ≈ 15,200 tokens, plus 4,096 for the answer
    expect(ollamaContextSize(35_000, 4096)).toBe(20_480);
  });

  it("counts tokens as a tokenizer of medical text does, not English prose", () => {
    // Measured: mistral reads this prompt with a 12,454-character report,
    // 26,504 characters in all, as 11,301 tokens
    expect(ollamaContextSize(26_504, 4096)).toBeGreaterThanOrEqual(11_301 + 4096);
  });

  it('gives reports of similar length the same size, so Ollama keeps the model loaded', () => {
    expect(ollamaContextSize(30_000, 4096)).toBe(ollamaContextSize(31_000, 4096));
  });

  it('makes room for the images a vision model reads', () => {
    expect(ollamaContextSize(33_000, 4096, 1)).toBeGreaterThan(ollamaContextSize(33_000, 4096));
  });

  it('never asks for less than 4096', () => {
    expect(ollamaContextSize(100, 256)).toBe(4096);
  });

  it('gives the answer the room beside the prompt and the slack, at least the limit asked for', () => {
    for (const characters of [100, 9_000, 9_400, 35_000]) {
      const { size, answerRoom } = ollamaContext(characters, 4096, 0, 1024);
      expect(answerRoom, String(characters)).toBeGreaterThanOrEqual(4096);
      expect(size - promptTokens(characters) - answerRoom, String(characters)).toBe(1024);
    }
  });
});
