import { describe, it, expect } from 'vitest';
import { createSimilarNameMatcher, type Embedder } from './similarNames';
import { getBiomarkerByKey } from '@data/biomarkers/dictionary';

/**
 * Embeds by a fixed table: a text in the table is a unit vector on its axis,
 * any other text on an axis of its own (so it is like nothing else)
 */
function tableEmbedder(axes: Record<string, number>): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  const others = new Map<string, number>();
  return {
    calls,
    async embed(texts) {
      calls.push(texts);
      return texts.map((t) => {
        const text = t.toLowerCase();
        if (!(text in axes) && !others.has(text)) others.set(text, 16 + others.size);
        const v = new Array<number>(512).fill(0);
        v[axes[text] ?? others.get(text)!] = 1;
        return v;
      });
    },
  };
}

const urea = getBiomarkerByKey('urine-urea')!;
const creatinine = getBiomarkerByKey('urine-creatinine')!;

describe('createSimilarNameMatcher', () => {
  it('returns the tests whose names mean the same, above the threshold', async () => {
    const embedder = tableEmbedder({ 'urine urea': 0, 'urea urinaria': 0, 'urine creatinine': 1 });
    const matcher = createSimilarNameMatcher(embedder, [urea, creatinine], 0.8);
    expect(await matcher.similar('Urea urinaria')).toEqual([urea]);
  });

  it('returns nothing below the threshold', async () => {
    const matcher = createSimilarNameMatcher(tableEmbedder({ 'urine urea': 0 }), [urea], 0.8);
    expect(await matcher.similar('Zorblatin')).toEqual([]);
  });

  it("embeds the dictionary's names and aliases once", async () => {
    const embedder = tableEmbedder({});
    const matcher = createSimilarNameMatcher(embedder, [urea], 0.8);
    await matcher.similar('a');
    await matcher.similar('b');
    expect(embedder.calls.filter((c) => c.length > 1)).toHaveLength(1);
  });

  it('embeds names asked for at the same time in one call', async () => {
    const embedder = tableEmbedder({ 'urine urea': 0, 'urea urinaria': 0 });
    const matcher = createSimilarNameMatcher(embedder, [urea], 0.8);

    const results = await Promise.all([matcher.similar('Urea urinaria'), matcher.similar('Zorb')]);

    expect(results).toEqual([[urea], []]);
    // The dictionary once, then both names together
    expect(embedder.calls).toHaveLength(2);
    expect(embedder.calls[1]).toEqual(['Urea urinaria', 'Zorb']);
  });

  it("embeds the dictionary again after a failed try, rather than failing every later name", async () => {
    const embedder = tableEmbedder({ 'urine urea': 0, 'urea urinaria': 0 });
    const embed = embedder.embed.bind(embedder);
    let fail = true;
    embedder.embed = async (texts) => {
      if (fail) {
        fail = false;
        throw new Error('out of memory');
      }
      return embed(texts);
    };
    const matcher = createSimilarNameMatcher(embedder, [urea], 0.8);

    await expect(matcher.similar('Urea urinaria')).rejects.toThrow('out of memory');
    expect(await matcher.similar('Urea urinaria')).toEqual([urea]);
  });
});
