/**
 * Whether Trends can chart a test value: it plots numbers only. Shared so a
 * link to a trend never leads to an empty chart.
 */
export function isTrendable<T extends { value: unknown }>(
  testValue: T
): testValue is T & { value: number } {
  return typeof testValue.value === 'number';
}
