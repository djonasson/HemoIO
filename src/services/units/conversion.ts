/**
 * Unit Conversion Service
 *
 * Provides utilities for converting test values between different units. Each
 * conversion is for a substance, named by its LOINC component ("Glucose").
 */

import {
  conversionsOf,
  findConversionDefinition,
  getConversion,
  normalizeUnitForLookup,
  type SubstanceRef,
} from './definitions';

/**
 * Result of a unit conversion
 */
export interface ConversionResult {
  /** Original value */
  originalValue: number;
  /** Original unit */
  originalUnit: string;
  /** Converted value */
  convertedValue: number;
  /** Target unit */
  targetUnit: string;
  /** Number of decimal places used */
  precision: number;
}

/**
 * Reference range with units
 */
export interface ReferenceRange {
  low?: number;
  high?: number;
  unit: string;
}

/**
 * Error thrown when conversion is not possible
 */
export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversionError';
  }
}

/**
 * Default precision (decimal places) for different unit types
 */
const DEFAULT_PRECISION: Record<string, number> = {
  'mmol/L': 2,
  'mg/dL': 0,
  'g/dL': 1,
  'g/L': 0,
  '%': 1,
  'µmol/L': 1,
  'umol/L': 1,
  'nmol/L': 1,
  'pmol/L': 1,
  'ng/mL': 1,
  'pg/mL': 0,
  'mIU/L': 2,
  'µIU/mL': 2,
  'U/L': 0,
  'IU/L': 0,
  'mEq/L': 1,
};

/**
 * Get appropriate precision for a unit
 */
function getPrecisionForUnit(unit: string): number {
  const normalizedUnit = unit.trim();
  return DEFAULT_PRECISION[normalizedUnit] ?? 2;
}

/** Fewest significant figures a displayed value may have */
const MIN_SIGNIFICANT_FIGURES = 2;

/**
 * Decimal places for displaying a value in a unit: the unit's usual
 * precision, increased when needed so small values (e.g. creatinine
 * 0.76 mg/dL) keep at least MIN_SIGNIFICANT_FIGURES instead of rounding to 1.
 */
function getPrecisionForValue(value: number, unit: string): number {
  const unitPrecision = getPrecisionForUnit(unit);
  if (value === 0 || !Number.isFinite(value)) return unitPrecision;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  return Math.max(unitPrecision, MIN_SIGNIFICANT_FIGURES - 1 - magnitude);
}

/**
 * Round a number to specified decimal places
 */
function roundToPrecision(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

/**
 * Convert a value of a substance from one unit to another
 *
 * @param substance - The test's LOINC component ("Glucose"), or the test itself
 * @param value - The value to convert
 * @param fromUnit - The source unit
 * @param toUnit - The target unit
 * @param precision - Optional decimal places (auto-determined if not provided)
 * @returns ConversionResult with converted value
 * @throws ConversionError if conversion is not supported
 */
export function convertValue(
  substance: SubstanceRef,
  value: number,
  fromUnit: string,
  toUnit: string,
  precision?: number
): ConversionResult {
  const normalizedFrom = fromUnit.trim();
  const normalizedTo = toUnit.trim();

  // Handle same unit case
  if (normalizedFrom.toLowerCase() === normalizedTo.toLowerCase()) {
    const usedPrecision = precision ?? getPrecisionForValue(value, normalizedTo);
    return {
      originalValue: value,
      originalUnit: normalizedFrom,
      convertedValue: roundToPrecision(value, usedPrecision),
      targetUnit: normalizedTo,
      precision: usedPrecision,
    };
  }

  const conversion = getConversion(substance, normalizedFrom, normalizedTo);

  if (conversion === undefined) {
    const component = typeof substance === 'string' ? substance : substance.component;
    if (!findConversionDefinition(substance)) {
      throw new ConversionError(`No conversion definitions found for "${component}"`);
    }
    throw new ConversionError(
      `Conversion from "${normalizedFrom}" to "${normalizedTo}" is not supported for "${component}"`
    );
  }

  const exact = value * conversion.factor + conversion.offset;
  const usedPrecision = precision ?? getPrecisionForValue(exact, normalizedTo);
  const convertedValue = roundToPrecision(exact, usedPrecision);

  return {
    originalValue: value,
    originalUnit: normalizedFrom,
    convertedValue,
    targetUnit: normalizedTo,
    precision: usedPrecision,
  };
}

/**
 * Convert a reference range to a different unit
 *
 * @param substance - The test's LOINC component, or the test itself
 * @param range - The reference range to convert
 * @param toUnit - The target unit
 * @param precision - Optional decimal places
 * @returns Converted reference range
 * @throws ConversionError if conversion is not supported
 */
export function convertReferenceRange(
  substance: SubstanceRef,
  range: ReferenceRange,
  toUnit: string,
  precision?: number
): ReferenceRange {
  // Without an explicit precision, each bound gets its own value-aware precision
  const usedPrecision = precision;

  const result: ReferenceRange = {
    unit: toUnit,
  };

  if (range.low !== undefined) {
    const lowResult = convertValue(
      substance,
      range.low,
      range.unit,
      toUnit,
      usedPrecision
    );
    result.low = lowResult.convertedValue;
  }

  if (range.high !== undefined) {
    const highResult = convertValue(
      substance,
      range.high,
      range.unit,
      toUnit,
      usedPrecision
    );
    result.high = highResult.convertedValue;
  }

  return result;
}

/**
 * Check if a conversion is supported for a substance
 *
 * @param substance - The test's LOINC component, or the test itself
 * @param fromUnit - The source unit
 * @param toUnit - The target unit
 * @returns true if conversion is supported
 */
export function canConvert(
  substance: SubstanceRef,
  fromUnit: string,
  toUnit: string
): boolean {
  if (fromUnit.toLowerCase().trim() === toUnit.toLowerCase().trim()) {
    return true;
  }
  return getConversion(substance, fromUnit, toUnit) !== undefined;
}

/**
 * Get all supported units for a substance
 *
 * @param substance - The test's LOINC component, or the test itself
 * @returns Array of supported unit strings, or empty array if it has no conversions
 */
export function getSupportedUnits(substance: SubstanceRef): string[] {
  const units = new Set<string>();
  for (const conversion of conversionsOf(substance)) {
    units.add(conversion.from);
    units.add(conversion.to);
  }

  return Array.from(units);
}

/**
 * Format a value with its unit for display
 *
 * @param value - The numeric value
 * @param unit - The unit
 * @param precision - Optional decimal places
 * @returns Formatted string like "5.5 mmol/L"
 */
export function formatValueWithUnit(
  value: number,
  unit: string,
  precision?: number
): string {
  const usedPrecision = precision ?? getPrecisionForValue(value, unit);
  const formattedValue = roundToPrecision(value, usedPrecision);

  // Handle units that don't need a space (like %)
  if (unit === '%') {
    return `${formattedValue}%`;
  }

  return `${formattedValue} ${unit}`;
}

/**
 * Parse a value with unit string like "5.5 mmol/L" or "100mg/dL"
 *
 * @param valueString - String containing value and unit
 * @returns Object with value and unit, or null if parsing fails
 */
export function parseValueWithUnit(
  valueString: string
): { value: number; unit: string } | null {
  // Match number followed by optional space and a unit (must contain at least one letter)
  const match = valueString.trim().match(/^([\d.]+)\s*([a-zA-Z/%µμ°^].*)$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (isNaN(value)) return null;

  const unit = match[2].trim();
  if (!unit) return null;

  return { value, unit };
}

/**
 * Normalize a unit string to a standard form
 * Handles common variations like "umol/L" -> "µmol/L"
 */
export function normalizeUnit(unit: string): string {
  return normalizeUnitForLookup(unit);
}
