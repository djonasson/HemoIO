/**
 * Unit Conversion Service
 *
 * Provides utilities for converting biomarker values between different units.
 */

import { findConversionDefinition, getConversionFactor } from './definitions';

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

/**
 * Round a number to specified decimal places
 */
function roundToPrecision(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

/**
 * Convert a biomarker value from one unit to another
 *
 * @param biomarkerName - Name or alias of the biomarker
 * @param value - The value to convert
 * @param fromUnit - The source unit
 * @param toUnit - The target unit
 * @param precision - Optional decimal places (auto-determined if not provided)
 * @returns ConversionResult with converted value
 * @throws ConversionError if conversion is not supported
 */
export function convertValue(
  biomarkerName: string,
  value: number,
  fromUnit: string,
  toUnit: string,
  precision?: number
): ConversionResult {
  const normalizedFrom = fromUnit.trim();
  const normalizedTo = toUnit.trim();

  // Handle same unit case
  if (normalizedFrom.toLowerCase() === normalizedTo.toLowerCase()) {
    const usedPrecision = precision ?? getPrecisionForUnit(normalizedTo);
    return {
      originalValue: value,
      originalUnit: normalizedFrom,
      convertedValue: roundToPrecision(value, usedPrecision),
      targetUnit: normalizedTo,
      precision: usedPrecision,
    };
  }

  // Get conversion factor
  const factor = getConversionFactor(biomarkerName, normalizedFrom, normalizedTo);

  if (factor === undefined) {
    // Check if biomarker exists
    const definition = findConversionDefinition(biomarkerName);
    if (!definition) {
      throw new ConversionError(
        `No conversion definitions found for biomarker "${biomarkerName}"`
      );
    }
    throw new ConversionError(
      `Conversion from "${normalizedFrom}" to "${normalizedTo}" is not supported for "${biomarkerName}"`
    );
  }

  const usedPrecision = precision ?? getPrecisionForUnit(normalizedTo);
  const convertedValue = roundToPrecision(value * factor, usedPrecision);

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
 * @param biomarkerName - Name or alias of the biomarker
 * @param range - The reference range to convert
 * @param toUnit - The target unit
 * @param precision - Optional decimal places
 * @returns Converted reference range
 * @throws ConversionError if conversion is not supported
 */
export function convertReferenceRange(
  biomarkerName: string,
  range: ReferenceRange,
  toUnit: string,
  precision?: number
): ReferenceRange {
  const usedPrecision = precision ?? getPrecisionForUnit(toUnit);

  const result: ReferenceRange = {
    unit: toUnit,
  };

  if (range.low !== undefined) {
    const lowResult = convertValue(
      biomarkerName,
      range.low,
      range.unit,
      toUnit,
      usedPrecision
    );
    result.low = lowResult.convertedValue;
  }

  if (range.high !== undefined) {
    const highResult = convertValue(
      biomarkerName,
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
 * Check if a conversion is supported for a biomarker
 *
 * @param biomarkerName - Name or alias of the biomarker
 * @param fromUnit - The source unit
 * @param toUnit - The target unit
 * @returns true if conversion is supported
 */
export function canConvert(
  biomarkerName: string,
  fromUnit: string,
  toUnit: string
): boolean {
  if (fromUnit.toLowerCase().trim() === toUnit.toLowerCase().trim()) {
    return true;
  }
  return getConversionFactor(biomarkerName, fromUnit, toUnit) !== undefined;
}

/**
 * Get all supported units for a biomarker
 *
 * @param biomarkerName - Name or alias of the biomarker
 * @returns Array of supported unit strings, or empty array if biomarker not found
 */
export function getSupportedUnits(biomarkerName: string): string[] {
  const definition = findConversionDefinition(biomarkerName);
  if (!definition) return [];

  const units = new Set<string>();
  for (const conversion of definition.conversions) {
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
  const usedPrecision = precision ?? getPrecisionForUnit(unit);
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
  const normalizations: Record<string, string> = {
    'umol/l': 'µmol/L',
    'umol/L': 'µmol/L',
    'µmol/l': 'µmol/L',
    'nmol/l': 'nmol/L',
    'pmol/l': 'pmol/L',
    'mg/dl': 'mg/dL',
    'mmol/l': 'mmol/L',
    'g/dl': 'g/dL',
    'g/l': 'g/L',
    'ng/ml': 'ng/mL',
    'pg/ml': 'pg/mL',
    'ug/dl': 'µg/dL',
    'ug/dL': 'µg/dL',
    'µg/dl': 'µg/dL',
    'miu/l': 'mIU/L',
    'mIU/l': 'mIU/L',
    'uiu/ml': 'µIU/mL',
    'µiu/ml': 'µIU/mL',
    'u/l': 'U/L',
    'iu/l': 'IU/L',
    'meq/l': 'mEq/L',
  };

  const lowercase = unit.toLowerCase().trim();
  return normalizations[lowercase] ?? unit.trim();
}
