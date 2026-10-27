/** Roughly how many characters a token holds in lab report text */
const CHARACTERS_PER_TOKEN = 3.5;
const MINIMUM_CONTEXT = 4096;

/**
 * The context size to request from Ollama: the prompt's estimated tokens
 * plus room for the answer, rounded up to a multiple of 1024. Ollama's
 * default is smaller, and it cuts longer prompts off silently.
 */
export function ollamaContextSize(promptCharacters: number, maxTokens: number): number {
  const tokens = Math.ceil(promptCharacters / CHARACTERS_PER_TOKEN) + maxTokens;
  return Math.max(MINIMUM_CONTEXT, Math.ceil(tokens / 1024) * 1024);
}
