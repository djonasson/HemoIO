/**
 * Roughly how many characters a token holds in this prompt: mistral reads
 * the prompt with an Italian report as 2.35 characters a token, so the
 * estimate stays below that and the prompt is never cut off
 */
const CHARACTERS_PER_TOKEN = 2.3;
/** The step sizes come in: each costs memory for the model's cache, each change a reload */
const CONTEXT_STEP = 4096;
/** Room for one image a vision model reads (up to about 2,900 tokens for llava 1.6) */
const TOKENS_PER_IMAGE = 3072;

/** A context size for one request, and the room its answer has in it */
export interface OllamaContext {
  size: number;
  answerRoom: number;
}

/**
 * The context to request from Ollama: the prompt's estimated tokens, its
 * images, the answer limit asked for and `slack` spare, rounded up to a
 * multiple of 4096; the answer gets all of it beside the prompt and the
 * slack, so at least that limit. Ollama's default is smaller, and it cuts
 * longer prompts off silently. Ollama reloads the model whenever the size
 * changes, so sizes come in steps that reports of similar length share,
 * small enough not to double the memory (and the provider asks a model
 * for the size it accepted before while that is larger, falling back to
 * the report's own).
 */
export function ollamaContext(
  promptCharacters: number,
  answerTokens: number,
  images: number,
  slack = 0
): OllamaContext {
  const prompt = promptTokens(promptCharacters, images);
  const size = Math.ceil((prompt + answerTokens + slack) / CONTEXT_STEP) * CONTEXT_STEP;
  return { size, answerRoom: size - prompt - slack };
}

/** The tokens a prompt of this many characters and images is estimated to take */
export function promptTokens(promptCharacters: number, images = 0): number {
  return Math.ceil(promptCharacters / CHARACTERS_PER_TOKEN) + images * TOKENS_PER_IMAGE;
}
