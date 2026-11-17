/** Letters and digits a page's own text needs to be used as is: fewer, and it is a scan with a stray mark or stamp */
export const MIN_PAGE_LETTERS = 50;

/** Letters and digits in a text */
export function letterCount(text: string): number {
  return text.replace(/[^\p{L}\p{N}]/gu, '').length;
}
