/**
 * Concurrency Utilities
 *
 * Helpers for processing items with controlled concurrency.
 */

/**
 * Process items with a controlled concurrency limit.
 *
 * Items are processed in order of their indices, but may complete out of order.
 * The processor function receives both the item and its index.
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param concurrency - Maximum number of concurrent operations
 * @returns Promise that resolves when all items are processed
 *
 * @example
 * ```ts
 * await processWithConcurrency(
 *   files,
 *   async (file, index) => {
 *     console.log(`Processing file ${index}`);
 *     await uploadFile(file);
 *   },
 *   3 // Process 3 files at a time
 * );
 * ```
 */
export async function processWithConcurrency<T>(
  items: T[],
  processor: (item: T, index: number) => Promise<void>,
  concurrency: number
): Promise<void> {
  if (concurrency < 1) {
    throw new Error('Concurrency must be at least 1');
  }

  if (items.length === 0) {
    return;
  }

  const executing = new Set<Promise<void>>();
  const allPromises: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const promise = processor(item, i);
    allPromises.push(promise);

    // Create a wrapper that removes from executing set when done (success or error)
    const wrapped = promise.finally(() => executing.delete(wrapped));
    executing.add(wrapped);

    if (executing.size >= concurrency) {
      // Wait for at least one to complete (don't care about errors here, just slot availability)
      await Promise.race(executing).catch(() => {});
    }
  }

  // Wait for all and propagate any errors
  await Promise.all(allPromises);
}
