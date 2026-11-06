/** "1 record", "3 records": the count, then the noun, with an s unless the count is 1 */
export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
