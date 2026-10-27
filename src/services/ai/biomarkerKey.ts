/**
 * The test key a model gave for a value: a non-empty string, trimmed. It is
 * not checked against the dictionary here; the analyzer does that.
 */
export function readBiomarkerKey(raw: Record<string, unknown>): string | undefined {
  const key = raw.biomarkerKey;
  if (typeof key !== 'string') return undefined;
  const trimmed = key.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** The key as an optional property, absent when the model gave none */
export function withBiomarkerKey(raw: Record<string, unknown>): { biomarkerKey?: string } {
  const biomarkerKey = readBiomarkerKey(raw);
  return biomarkerKey === undefined ? {} : { biomarkerKey };
}
