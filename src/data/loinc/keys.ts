/**
 * The stored key of a value's test: a LOINC code ("2345-7"), or an
 * "unknown:" key made from its printed name when it is not a LOINC test
 */

const UNKNOWN_PREFIX = 'unknown:';

/** A name as every lookup reads it: case, spacing and accent encoding aside */
export function nameKey(name: string): string {
  return name.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Key for a value that is not a LOINC test, derived from its printed name so
 * the same name always gets the same key.
 *
 * Normalised to NFKC so composed and decomposed spellings match. Letters,
 * combining marks and digits are kept, as are "%" and "#", which distinguish
 * percentage and absolute-count variants of the same test (e.g. "IG%" vs
 * "IG#").
 */
export function unknownBiomarkerKey(printedName: string): string {
  const normalized = printedName
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}%#]/gu, '');
  return `${UNKNOWN_PREFIX}${normalized || 'unnamed'}`;
}

/** Whether a stored key is that of a value saved as not a LOINC test */
export function isUnknownKey(key: string): boolean {
  return key.startsWith(UNKNOWN_PREFIX);
}
