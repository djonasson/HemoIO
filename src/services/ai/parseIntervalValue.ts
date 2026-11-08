/**
 * Interval Value Parser
 *
 * Detects and parses interval/range values commonly found in microscopy
 * and morphological lab results (e.g., "5 - 10 eritrociti per campo").
 */

import type { CensoredComparator } from '@/types';

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

/** A comparator and a number: "< 5", "<=0.2", "≥ 200" */
const CENSORED = /^(<=|>=|<|>|≤|≥)\s*(\d+(?:[.,]\d+)?)$/;

const COMPARATORS: Record<string, CensoredComparator> = {
  '<': '<',
  '<=': '<=',
  '≤': '<=',
  '>': '>',
  '>=': '>=',
  '≥': '>=',
};

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
    const bound = parseFloat(censoredMatch[2].replace(',', '.'));
    if (!isNaN(bound)) {
      return {
        value: bound,
        isInterval: false,
        rawValue: valueStr,
        censored: COMPARATORS[censoredMatch[1]],
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

  // Default: return 0 if unparseable (will likely be filtered out)
  return {
    value: 0,
    isInterval: false,
    rawValue: valueStr,
  };
}

/**
 * Format an interval value for display
 *
 * @param intervalLow - Lower bound
 * @param intervalHigh - Upper bound
 * @param unit - Unit of measurement
 * @returns Formatted string like "5-10 eritrociti per campo"
 */
export function formatIntervalValue(
  intervalLow: number,
  intervalHigh: number,
  unit?: string
): string {
  const range = `${intervalLow}-${intervalHigh}`;
  return unit ? `${range} ${unit}` : range;
}
