/**
 * Interval Value Parser
 *
 * Detects and parses interval/range values commonly found in microscopy
 * and morphological lab results (e.g., "5 - 10 eritrociti per campo").
 */

import type { CensoredComparator, ValueReading } from '@/types';

/**
 * Result of parsing a value that might be an interval
 */
export interface ParsedValue {
  /** The numeric value (midpoint for intervals) */
  value: number;
  /** Whether this is an interval value */
  isInterval: boolean;
  /** Lower bound (for intervals) */
  intervalLow?: number;
  /** Upper bound (for intervals) */
  intervalHigh?: number;
  /** Raw value string before parsing */
  rawValue?: string;
  /** For a censored value ("< 5"), how `value` bounds it */
  censored?: CensoredComparator;
}

/**
 * A comparator, as a sign or in Italian words, and a number, maybe with
 * the unit or the lab's mark after it: "< 5", "=<0,2", "≥ 200",
 * "> 200 H", "<10 mg/dL", "inferiore a 5"
 */
const CENSORED =
  /^(<=|=<|>=|=>|<|>|≤|≥|inferiore\s+a|minore\s+di|superiore\s+a|maggiore\s+di)\s*(\d+(?:[.,]\d+)*)(?![\d.,])(?:\s*\S.*)?$/i;

const COMPARATORS: Record<string, CensoredComparator> = {
  '<': '<',
  '<=': '<=',
  '=<': '<=',
  '≤': '<=',
  '>': '>',
  '>=': '>=',
  '=>': '>=',
  '≥': '>=',
  'inferiore a': '<',
  'minore di': '<',
  'superiore a': '>',
  'maggiore di': '>',
};

/**
 * A censored value's bound as an Italian report prints it: a comma is the
 * decimal mark and a dot then separates thousands ("1.000,5"); with no
 * comma, a dot before groups of exactly three digits separates thousands
 * ("> 1.000", "> 100.000"), any other dot is a decimal point ("< 0.2").
 * NaN for anything else ("1,2,3").
 */
function readBound(text: string): number {
  if (text.includes(',')) {
    return /^\d{1,3}(?:\.\d{3})*,\d+$|^\d+,\d+$/.test(text) ? Number(text.replace(/\./g, '').replace(',', '.')) : NaN;
  }
  if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) return Number(text.replace(/\./g, ''));
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
}

/**
 * Regular expression patterns for interval detection
 * Matches patterns like:
 * - "5-10"
 * - "5 - 10"
 * - "5 – 10" (en-dash)
 * - "5 — 10" (em-dash)
 * - "5 to 10"
 * Censored values ("<5", ">10", "≤ 0.2") are read apart: see CENSORED.
 */
const INTERVAL_PATTERNS = [
  // Standard range with hyphen/dash variants: "5-10", "5 - 10", "5 – 10"
  /^(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)$/,
  // Range with "to": "5 to 10"
  /^(\d+(?:[.,]\d+)?)\s+to\s+(\d+(?:[.,]\d+)?)$/i,
  // Range with "a" (Italian): "5 a 10"
  /^(\d+(?:[.,]\d+)?)\s+a\s+(\d+(?:[.,]\d+)?)$/i,
];

/**
 * Parse a value that might be an interval
 *
 * @param rawValue - The raw value from the lab report (string or number)
 * @returns Parsed value with interval information if detected
 */
export function parseIntervalValue(rawValue: string | number | unknown): ParsedValue {
  // If it's already a number, return as single value
  if (typeof rawValue === 'number') {
    return {
      value: rawValue,
      isInterval: false,
    };
  }

  // No value at all: missing, with nothing printed to show
  if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
    return { value: NaN, isInterval: false };
  }

  // Convert to string for parsing
  const valueStr = String(rawValue).trim();

  // Try each interval pattern
  for (const pattern of INTERVAL_PATTERNS) {
    const match = valueStr.match(pattern);
    if (match) {
      // Parse the low and high values (handle European decimal notation)
      const low = parseFloat(match[1].replace(',', '.'));
      const high = parseFloat(match[2].replace(',', '.'));

      // Validate the range
      if (!isNaN(low) && !isNaN(high) && low <= high) {
        // Calculate midpoint as the representative value
        const midpoint = (low + high) / 2;

        return {
          value: midpoint,
          isInterval: true,
          intervalLow: low,
          intervalHigh: high,
          rawValue: valueStr,
        };
      }
    }
  }

  // A censored value ("< 5", "≥ 200"): beyond what the method can tell,
  // so the number is a bound, not a measurement. Kept as the bound with its
  // comparator, never as a plain number.
  const censoredMatch = valueStr.match(CENSORED);
  if (censoredMatch) {
    const bound = readBound(censoredMatch[2]);
    if (!isNaN(bound)) {
      return {
        value: bound,
        isInterval: false,
        rawValue: valueStr,
        censored: COMPARATORS[censoredMatch[1].toLowerCase().replace(/\s+/g, ' ')],
      };
    }
  }

  // Try to parse as a simple number
  const numericValue = parseFloat(valueStr.replace(',', '.'));
  if (!isNaN(numericValue)) {
    return {
      value: numericValue,
      isInterval: false,
    };
  }

  // Not read: left missing (never a measured 0), so the review asks for
  // it and shows what was printed
  return {
    value: NaN,
    isInterval: false,
    rawValue: valueStr,
  };
}

/** An extracted interval value's ends; undefined for any other value, or an interval missing an end */
export function extractedInterval(
  value: { isInterval?: boolean; intervalLow?: number; intervalHigh?: number }
): ValueReading['interval'] {
  const { isInterval, intervalLow: low, intervalHigh: high } = value;
  return isInterval && low !== undefined && high !== undefined ? { low, high } : undefined;
}
