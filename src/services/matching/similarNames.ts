/**
 * Tests whose names mean the same as a printed name, by a sentence
 * embedding model: the fallback for names no alias knows. The unit check
 * happens in the analyzer.
 */
import type { BiomarkerDefinition } from '@data/biomarkers/dictionary';

export interface Embedder {
  /** One unit-length vector per text */
  embed(texts: string[]): Promise<number[][]>;
}

export interface SimilarNameMatcher {
  /** Tests above the threshold, closest first */
  similar(name: string): Promise<BiomarkerDefinition[]>;
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, x, i) => sum + x * b[i], 0);
}

export function createSimilarNameMatcher(
  embedder: Embedder,
  definitions: readonly BiomarkerDefinition[],
  threshold: number
): SimilarNameMatcher {
  const entries = definitions.flatMap((d) =>
    [d.name, ...d.aliases].map((text) => ({ text, definition: d }))
  );
  let vectors: Promise<number[][]> | undefined;

  const rank = (query: number[], dictionary: number[][]): BiomarkerDefinition[] => {
    const best = new Map<string, { definition: BiomarkerDefinition; score: number }>();
    dictionary.forEach((vector, i) => {
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
    resolve: (tests: BiomarkerDefinition[]) => void;
    reject: (error: unknown) => void;
  }> = [];
  const flush = async () => {
    const batch = pending;
    pending = [];
    try {
      vectors ??= embedder.embed(entries.map((e) => e.text));
      const dictionary = await vectors;
      const queries = await embedder.embed(batch.map((b) => b.name));
      batch.forEach((b, i) => b.resolve(rank(queries[i], dictionary)));
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
