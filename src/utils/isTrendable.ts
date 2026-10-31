/**
 * Whether Trends can chart a test value: it plots numbers only. Shared so
 * the views that link to a trend offer it for the same values Trends shows.
 */
export function isTrendable<T extends { value: unknown }>(
  testValue: T
): testValue is T & { value: number } {
  return typeof testValue.value === 'number';
}
