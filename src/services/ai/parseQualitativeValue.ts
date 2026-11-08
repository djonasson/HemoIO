/**
 * Qualitative Value Parser
 *
 * Reads a result printed as a word or as crosses ("Assenti", "Positivo",
 * "Tracce", "++") as the number it stands for, keeping the printed word.
 *
 * The scale: absent/negative 0 and present/positive 1 (boolean); traces
 * 0.5 and one to four crosses ("+" to "++++", "1+" to "4+") 1 to 4
 * (ordinal), so a cross is one step and traces sit below the first.
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

/** "positivo ++" reads as its crosses; "1+" to "4+" as theirs */
const CROSSES = /^(?:(?:positiv[oaie]|positive|presente?|presenti)\s*)?(\+{1,4})$/;
const NUMBERED_CROSSES = /^([1-4])\s*\+$/;

/**
 * The kind and number of a printed qualitative result, or undefined for
 * anything else (a number, free text with no presence meaning)
 */
export function readQualitativeWord(printed: string): Omit<QualitativeReading, 'text'> | undefined {
  const word = printed
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s([]+|[\s.)\]]+$/g, '');
  const crosses = word.match(CROSSES);
  if (crosses) return { kind: 'ordinal', value: crosses[1].length };
  const numbered = word.match(NUMBERED_CROSSES);
  if (numbered) return { kind: 'ordinal', value: Number(numbered[1]) };
  if (TRACES.has(word)) return { kind: 'ordinal', value: TRACES_VALUE };
  if (ABSENT.has(word)) return { kind: 'boolean', value: 0 };
  if (PRESENT.has(word)) return { kind: 'boolean', value: 1 };
  return undefined;
}

/**
 * A model's value with the printed word it gave for a qualitative result.
 * A word the scale knows reads as the scale says. A word it does not know
 * (another language's) keeps the number the model gave it, a boolean when
 * that is 0 or 1. A value given as a word with no number reads by the
 * scale too. Anything else is a number or an interval (parseIntervalValue).
 */
export function parseExtractedValue(value: unknown, printed: unknown): ReadValue {
  const word = typeof printed === 'string' ? printed.trim() : '';
  if (word !== '') {
    const known = readQualitativeWord(word);
    if (known) return qualitativeValue({ text: word, ...known });
    // A number given as the word is no qualitative result
    if (typeof value === 'number' && Number.isFinite(value) && !/^[\d.,\s<>-]+$/.test(word)) {
      const kind = value === 0 || value === 1 ? 'boolean' : 'ordinal';
      return qualitativeValue({ text: word, kind, value });
    }
  }
  if (typeof value === 'string') {
    const known = readQualitativeWord(value);
    if (known) return qualitativeValue({ text: value.trim(), ...known });
  }
  return parseIntervalValue(value);
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
