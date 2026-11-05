/**
 * Tests whose names mean the same as a printed name, by a sentence
 * embedding model: the fallback for names no alias knows. The unit check
 * happens in the analyzer.
 */

/** A test with the names it may be printed as */
export interface NamedTest {
  /** The test's LOINC code */
  key: string;
  names: readonly string[];
}

export interface Embedder {
  /** One unit-length vector per text */
  embed(texts: string[]): Promise<number[][]>;
}

export interface SimilarNameMatcher {
  /** Tests above the threshold, closest first */
  similar(name: string): Promise<NamedTest[]>;
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, x, i) => sum + x * b[i], 0);
}

export function createSimilarNameMatcher(
  embedder: Embedder,
  definitions: readonly NamedTest[],
  threshold: number
): SimilarNameMatcher {
  const entries = definitions.flatMap((d) => d.names.map((text) => ({ text, definition: d })));
  let vectors: Promise<number[][]> | undefined;

  const rank = (query: number[], known: number[][]): NamedTest[] => {
    const best = new Map<string, { definition: NamedTest; score: number }>();
    known.forEach((vector, i) => {
      const score = dot(query, vector);
      const { definition } = entries[i];
      if (score >= threshold && score > (best.get(definition.key)?.score ?? -Infinity)) {
        best.set(definition.key, { definition, score });
      }
    });
    return [...best.values()].sort((a, b) => b.score - a.score).map((b) => b.definition);
  };

  // Names asked for at the same time (one report's values) are embedded in
  // one call: the model runs one inference at a time
  let pending: Array<{
    name: string;
    resolve: (tests: NamedTest[]) => void;
    reject: (error: unknown) => void;
  }> = [];
  const flush = async () => {
    const batch = pending;
    pending = [];
    try {
      if (!vectors) {
        const attempt = embedder.embed(entries.map((e) => e.text));
        vectors = attempt;
        // A failed try is not kept, so the next names try again. In the
        // browser this recovers only from a failure outside the model's
        // run: transformers.js chains every run on the one before, so a
        // failed run fails all later ones until the app reloads (the
        // import notes say so)
        attempt.catch(() => {
          if (vectors === attempt) vectors = undefined;
        });
      }
      const known = await vectors;
      const queries = await embedder.embed(batch.map((b) => b.name));
      batch.forEach((b, i) => b.resolve(rank(queries[i], known)));
    } catch (error) {
      batch.forEach((b) => b.reject(error));
    }
  };

  return {
    similar(name) {
      return new Promise((resolve, reject) => {
        pending.push({ name, resolve, reject });
        if (pending.length === 1) queueMicrotask(() => void flush());
      });
    },
  };
}
