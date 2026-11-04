/**
 * The sample a model named for a value ("urine", "24h urine", "serum"), as
 * an optional property: absent when it named none or gave something else
 */
export function withSpecimenHint(raw: Record<string, unknown>): { specimenHint?: string } {
  const hint = raw.specimenHint;
  const trimmed = typeof hint === 'string' ? hint.trim() : '';
  return trimmed === '' ? {} : { specimenHint: trimmed };
}
