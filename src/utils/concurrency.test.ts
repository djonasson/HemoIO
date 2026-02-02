import { describe, it, expect, vi } from 'vitest';
import { processWithConcurrency } from './concurrency';

describe('processWithConcurrency', () => {
  it('processes all items', async () => {
    const items = [1, 2, 3, 4, 5];
    const processed: number[] = [];

    await processWithConcurrency(
      items,
      async (item) => {
        processed.push(item);
      },
      2
    );

    expect(processed).toHaveLength(5);
    expect(processed.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('passes correct index to processor', async () => {
    const items = ['a', 'b', 'c'];
    const indices: number[] = [];

    await processWithConcurrency(
      items,
      async (_item, index) => {
        indices.push(index);
      },
      2
    );

    expect(indices.sort()).toEqual([0, 1, 2]);
  });

  it('respects concurrency limit', async () => {
    const items = [1, 2, 3, 4, 5];
    let currentConcurrency = 0;
    let maxConcurrency = 0;
    const concurrencyLimit = 2;

    await processWithConcurrency(
      items,
      async () => {
        currentConcurrency++;
        maxConcurrency = Math.max(maxConcurrency, currentConcurrency);
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentConcurrency--;
      },
      concurrencyLimit
    );

    expect(maxConcurrency).toBeLessThanOrEqual(concurrencyLimit);
  });

  it('processes sequentially with concurrency of 1', async () => {
    const items = [1, 2, 3];
    const order: number[] = [];

    await processWithConcurrency(
      items,
      async (item) => {
        order.push(item);
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
      1
    );

    // With concurrency 1, items should complete in order
    expect(order).toEqual([1, 2, 3]);
  });

  it('handles empty array', async () => {
    const processor = vi.fn();

    await processWithConcurrency([], processor, 3);

    expect(processor).not.toHaveBeenCalled();
  });

  it('throws error if concurrency is less than 1', async () => {
    await expect(
      processWithConcurrency([1, 2, 3], async () => {}, 0)
    ).rejects.toThrow('Concurrency must be at least 1');
  });

  it('propagates errors from processor', async () => {
    const items = [1, 2, 3];
    const error = new Error('Processing failed');

    await expect(
      processWithConcurrency(
        items,
        async (item) => {
          if (item === 2) {
            throw error;
          }
        },
        2
      )
    ).rejects.toThrow('Processing failed');
  });

  it('continues processing other items when one fails with high concurrency', async () => {
    const items = [1, 2, 3, 4, 5];
    const completed: number[] = [];

    try {
      await processWithConcurrency(
        items,
        async (item) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          if (item === 3) {
            throw new Error('Item 3 failed');
          }
          completed.push(item);
        },
        5 // High concurrency - all start at once
      );
    } catch {
      // Error expected
    }

    // Items 1, 2, 4, 5 should have completed (or started) before/despite the error
    expect(completed.length).toBeGreaterThan(0);
  });
});
