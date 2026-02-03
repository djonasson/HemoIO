/**
 * Interval Value Parser
 *
 * Detects and parses interval/range values commonly found in microscopy
 * and morphological lab results (e.g., "5 - 10 eritrociti per campo").
 */

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
}

/**
 * Regular expression patterns for interval detection
 * Matches patterns like:
 * - "5-10"
 * - "5 - 10"
 * - "5 – 10" (en-dash)
 * - "5 — 10" (em-dash)
 * - "5 to 10"
 * - "<5" (less than, treated as 0-5)
 * - ">10" (greater than, treated as 10-infinity, stored as single value)
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

  // Handle "less than" notation: "<5" → single value at the threshold
  // This is typically from dipstick tests where "< X" means undetectable/below X
  // NOT treated as an interval - use the threshold value and preserve rawValue
  const lessThanMatch = valueStr.match(/^<\s*(\d+(?:[.,]\d+)?)$/);
  if (lessThanMatch) {
    const threshold = parseFloat(lessThanMatch[1].replace(',', '.'));
    if (!isNaN(threshold)) {
      // Return the threshold value (preserves more info than returning 0)
      // The rawValue preserves the original "< X" notation for display purposes
      return {
        value: threshold,
        isInterval: false,
        rawValue: valueStr,
      };
    }
  }

  // Handle "greater than" notation: ">10" → single value (can't determine upper bound)
  const greaterThanMatch = valueStr.match(/^>\s*(\d+(?:[.,]\d+)?)$/);
  if (greaterThanMatch) {
    const value = parseFloat(greaterThanMatch[1].replace(',', '.'));
    if (!isNaN(value)) {
      return {
        value,
        isInterval: false,
        rawValue: valueStr,
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
