/**
 * Qualitative Value Parser
 *
 * Reads a result printed as a word or as crosses ("Assenti", "Positivo",
 * "Tracce", "++") as the number it stands for, keeping the printed word.
 *
 * The scale: absent/negative 0 and present/positive 1 (boolean); traces
 * 0.5 and one to four crosses ("+" to "++++", "1+" to "4+") 1 to 4
 * (ordinal), so a cross is one step and traces sit below the first. A
 * microscopy count in words reads on the crosses' steps: rare, occasional
 * or scarce 1, a few 2, frequent 3, many or numerous 4.
 */

import { parseIntervalValue, type ParsedValue } from './parseIntervalValue';
import type { ExtractedBiomarker, QualitativeReading } from './types';

/** A model's value as read: a number, an interval, or a qualitative result */
export interface ReadValue extends ParsedValue {
  qualitative?: QualitativeReading;
}

const ABSENT = new Set([
  'assente', 'assenti', 'assenza', 'negativo', 'negativa', 'negativi', 'negative', 'neg',
  'absent', 'not detected', 'none detected', 'non rilevato', 'non rilevata', 'non rilevati',
  'non rilevate', 'non rilevabile', 'non rilevabili',
]);

const PRESENT = new Set([
  'presente', 'presenti', 'positivo', 'positiva', 'positivi', 'positive', 'pos', 'present',
  'detected', 'rilevato', 'rilevata', 'rilevati', 'rilevate',
]);

const TRACES = new Set(['tracce', 'traccia', 'trace', 'traces', 'tr']);

/** The value of traces on the ordinal scale: below one cross */
const TRACES_VALUE = 0.5;

/**
 * A microscopy count in words (sediment, smears), Italian and English, on
 * the crosses' steps: some cells were seen, so never 0
 */
const QUANTITY = new Map<string, number>([
  ...['rari', 'rare', 'raro', 'rara', 'rare cells', 'occasionali', 'occasionale', 'occasional', 'scarsi', 'scarse', 'scarso', 'scarsa', 'sporadici', 'sporadiche'].map(
    (word) => [word, 1] as const
  ),
  ...['alcuni', 'alcune', 'few', 'a few', 'qualche'].map((word) => [word, 2] as const),
  ...['frequenti', 'frequente', 'frequent', 'moderate', 'moderati', 'moderate cells'].map((word) => [word, 3] as const),
  ...['numerosi', 'numerose', 'numerous', 'molti', 'molte', 'many', 'abbondanti'].map((word) => [word, 4] as const),
]);

/** "positivo ++" reads as its crosses; "1+" to "4+" as theirs */
const CROSSES = /^(?:(?:positiv[oaie]|positive|presente?|presenti)\s*)?(\+{1,4})$/;
const NUMBERED_CROSSES = /^([1-4])\s*\+$/;

/**
 * The kind and number of a printed qualitative result, or undefined for
 * anything else (a number, free text with no presence meaning)
 */
export function readQualitativeWord(printed: string): Omit<QualitativeReading, 'text'> | undefined {
  const word = wordOf(printed);
  const crosses = word.match(CROSSES);
  if (crosses) return { kind: 'ordinal', value: crosses[1].length };
  const numbered = word.match(NUMBERED_CROSSES);
  if (numbered) return { kind: 'ordinal', value: Number(numbered[1]) };
  if (TRACES.has(word)) return { kind: 'ordinal', value: TRACES_VALUE };
  if (ABSENT.has(word)) return { kind: 'boolean', value: 0 };
  if (PRESENT.has(word)) return { kind: 'boolean', value: 1 };
  const quantity = QUANTITY.get(word);
  if (quantity !== undefined) return { kind: 'ordinal', value: quantity };
  return undefined;
}

/** A printed word as the tables hold it: lower case, single spaces, no brackets or full stop */
function wordOf(printed: string): string {
  return printed
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s([]+|[\s.)\]]+$/g, '');
}

/**
 * A model's value with the printed word it gave for a qualitative result.
 * Only a word the scale knows counts, and only while it does not replace a
 * measured number: when the model gave no number, or the very number the
 * word reads as. So "0.05 S/CO Negativo" stays 0.05, and "N/A", "Normale"
 * or "95 mg/dL" never make a value a word. A count in words ("Rari",
 * "Few") is kept over a 0 too: cells were seen, so it is never "0 per
 * campo". A value given as a word reads by the scale too. Anything else is
 * a number or an interval (parseIntervalValue).
 */
export function parseExtractedValue(value: unknown, printed: unknown): ReadValue {
  const given = typeof value === 'string' ? readQualitativeWord(value) : undefined;
  const read: ReadValue = given
    ? qualitativeValue({ text: String(value).trim(), ...given })
    : parseIntervalValue(value);
  const word = typeof printed === 'string' ? printed.trim() : '';
  const known = word ? readQualitativeWord(word) : undefined;
  if (!known || read.qualitative) return read;
  const measured = Number.isFinite(read.value);
  const noneCounted = QUANTITY.has(wordOf(word)) && read.value === 0 && !read.isInterval && !read.censored;
  if (measured && !noneCounted && (read.value !== known.value || read.isInterval || read.censored)) return read;
  return qualitativeValue({ text: word, ...known });
}

function qualitativeValue(qualitative: QualitativeReading): ReadValue {
  return { value: qualitative.value, isInterval: false, qualitative };
}

/**
 * A value's printed qualitative result while the value is still the number
 * it reads as; undefined once the value was edited to another number
 */
export function heldQualitative(
  biomarker: Pick<ExtractedBiomarker, 'value' | 'qualitative'>
): QualitativeReading | undefined {
  const { qualitative } = biomarker;
  return qualitative && qualitative.value === biomarker.value ? qualitative : undefined;
}
