/**
 * Convert a measurement (value plus reference range) to a target unit.
 *
 * The value and its range are converted as one: if any part cannot be
 * converted, the whole measurement keeps its original unit, so a value is
 * never labelled with a unit it was not expressed in.
 */

import { canConvert, convertValue, ConversionError } from './conversion';

export interface Measurement {
  value: number;
  unit: string;
  referenceRangeLow?: number;
  referenceRangeHigh?: number;
}

export interface ConvertedMeasurement {
  value: number;
  unit: string;
  referenceRange: { low?: number; high?: number };
}

/** @param component - LOINC component of the test, e.g. "Glucose" */
export function convertMeasurement(
  component: string,
  measurement: Measurement,
  targetUnit: string
): ConvertedMeasurement {
  const original: ConvertedMeasurement = {
    value: measurement.value,
    unit: measurement.unit,
    referenceRange: { low: measurement.referenceRangeLow, high: measurement.referenceRangeHigh },
  };

  if (
    measurement.unit === targetUnit ||
    !component ||
    !canConvert(component, measurement.unit, targetUnit)
  ) {
    return original;
  }

  const convert = (value: number | undefined): number | undefined =>
    value === undefined
      ? undefined
      : convertValue(component, value, measurement.unit, targetUnit).convertedValue;

  try {
    return {
      value: convert(measurement.value)!,
      unit: targetUnit,
      referenceRange: {
        low: convert(measurement.referenceRangeLow),
        high: convert(measurement.referenceRangeHigh),
      },
    };
  } catch (error) {
    if (error instanceof ConversionError) return original;
    throw error;
  }
}
