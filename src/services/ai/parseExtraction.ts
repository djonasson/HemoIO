/**
 * Reading an analysis answer, the same way for every provider: the JSON
 * object in the model's text, checked against RESPONSE_SCHEMA. A value
 * that is not in the schema's shape is left out with a note saying how
 * many were; an answer with no list of values is an error.
 */
import { rangeUnitOf, withParsedValue } from './withParsedValue';
import { withSpecimenHint } from './specimenHint';
import { AI_PROVIDER_NAMES, AIAnalysisError } from './types';
import type { AIProviderType, ExtractedBiomarker } from './types';

/** The code of the error for an answer that is not an analysis answer at all */
export const MALFORMED_ANSWER = 'malformed_answer';

/** What an analysis answer gives */
export interface ParsedExtraction {
  biomarkers: ExtractedBiomarker[];
  labDate?: string;
  labName?: string;
  patientName?: string;
  warnings: string[];
}

/** A unit as given, cleaned, and a reference range it carried ("mg/dL 70-100") */
export interface CleanedUnit {
  unit: string;
  extractedRange?: { low?: number; high?: number };
}

export interface ParseExtractionOptions {
  /** Cleans each unit (and a range's unit); a range found in a value's unit fills in a range not given */
  cleanUnit?: (unit: string) => CleanedUnit;
}

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The note for values left out because they were not in the expected form; no value's content */
export function droppedValuesNote(count: number): string {
  return count === 1
    ? "1 value in the AI's answer was not in the expected form and was left out."
    : `${count} values in the AI's answer were not in the expected form and were left out.`;
}

/**
 * The JSON object in a model's text: inside a code block or among other
 * text, and with unquoted property names ({ low: 5 }), as some local
 * models write
 */
function readJsonObject(content: string): unknown {
  const cleaned = content
    .replace(/^```(?:json)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in response');
  try {
    return JSON.parse(match[0]);
  } catch (error) {
    try {
      return JSON.parse(match[0].replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3'));
    } catch {
      throw error;
    }
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Whether a value is in the schema's shape: a name; a number or a string
 * as value (or none beside a qualitative result as printed); a text unit
 * and a number as confidence, when given. A null is as good as absent:
 * strict structured output gives null for what the report does not have.
 */
function isWellFormed(raw: unknown): raw is Raw {
  if (!isRecord(raw)) return false;
  if (typeof raw.name !== 'string' || raw.name.trim() === '') return false;
  const printedWord = typeof raw.qualitativeValue === 'string' && raw.qualitativeValue.trim() !== '';
  const hasValue = isFiniteNumber(raw.value) || typeof raw.value === 'string' || (raw.value == null && printedWord);
  if (!hasValue) return false;
  if (raw.unit != null && typeof raw.unit !== 'string') return false;
  if (raw.confidence != null && !isFiniteNumber(raw.confidence)) return false;
  return true;
}

function readBiomarker(raw: Raw, cleanUnit: (unit: string) => CleanedUnit): ExtractedBiomarker {
  const { unit, extractedRange } = cleanUnit(typeof raw.unit === 'string' ? raw.unit : '');
  const range = isRecord(raw.referenceRange) ? raw.referenceRange : undefined;
  const low = isFiniteNumber(range?.low) ? range.low : extractedRange?.low;
  const high = isFiniteNumber(range?.high) ? range.high : extractedRange?.high;
  const rangeUnit = typeof range?.unit === 'string' ? cleanUnit(range.unit).unit : undefined;

  return {
    name: raw.name as string,
    ...withSpecimenHint(raw),
    ...withParsedValue(raw, unit),
    referenceRange:
      low !== undefined || high !== undefined ? { low, high, unit: rangeUnitOf(rangeUnit, unit) } : undefined,
    method: raw.method ? String(raw.method) : undefined,
    // Kept within 0-1; none (or 0) is a middling one
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0.5)),
    notes: raw.notes ? String(raw.notes) : undefined,
  };
}

const asIs = (unit: string): CleanedUnit => ({ unit });

/**
 * The values, lab date and name, patient name and notes of an analysis
 * answer.
 *
 * @param content - The model's answer text
 * @param provider - The provider that gave it, for the error
 * @throws AIAnalysisError when the answer has no JSON object, or no list of values
 */
export function parseExtraction(
  content: string,
  provider: AIProviderType,
  options: ParseExtractionOptions = {}
): ParsedExtraction {
  const fail = (reason: string) =>
    new AIAnalysisError(`Failed to parse ${AI_PROVIDER_NAMES[provider]} response: ${reason}`, provider, MALFORMED_ANSWER);

  let data: unknown;
  try {
    data = readJsonObject(content);
  } catch (error) {
    throw fail(error instanceof Error ? error.message : String(error));
  }
  if (!isRecord(data)) throw fail('the answer is not a JSON object');
  if (!Array.isArray(data.biomarkers)) throw fail('the answer has no list of values');

  const wellFormed = data.biomarkers.filter(isWellFormed);
  const dropped = data.biomarkers.length - wellFormed.length;
  const warnings = Array.isArray(data.warnings) ? data.warnings.map((w: unknown) => String(w)) : [];

  return {
    biomarkers: wellFormed.map((raw) => readBiomarker(raw, options.cleanUnit ?? asIs)),
    labDate: data.labDate ? String(data.labDate) : undefined,
    labName: data.labName ? String(data.labName) : undefined,
    patientName: data.patientName ? String(data.patientName) : undefined,
    warnings: dropped > 0 ? [...warnings, droppedValuesNote(dropped)] : warnings,
  };
}

/** The mean of the values' confidences; 0 for none */
export function overallConfidence(biomarkers: ExtractedBiomarker[]): number {
  if (biomarkers.length === 0) return 0;
  return biomarkers.reduce((sum, b) => sum + b.confidence, 0) / biomarkers.length;
}
