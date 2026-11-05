/**
 * Which unit a test is shown in, and converting a value for display.
 *
 * A preference only counts when the test offers that unit, so a stale or
 * edited preference can never mislabel a value.
 */
import { canConvert } from './conversion';
import { convertMeasurement } from './convertMeasurement';
import { unitsMatch, type SubstanceRef } from './definitions';

/** What a test needs to offer units: its substance and the units HemoIO shows it in */
export interface UnitSource {
  substance: SubstanceRef;
  canonicalUnit: string;
  alternativeUnits?: string[];
}

/** Standard unit first, then every alternative the standard unit converts to */
export function preferredUnitOptions(definition: UnitSource): string[] {
  const units = new Set([definition.canonicalUnit, ...(definition.alternativeUnits ?? [])]);
  return [...units].filter(
    (unit) =>
      unit === definition.canonicalUnit ||
      canConvert(definition.substance, definition.canonicalUnit, unit)
  );
}

/** The stored preference if the test offers it, else undefined */
export function preferredUnitFor(
  definition: UnitSource | undefined,
  preferred: string | undefined
): string | undefined {
  if (!definition || !preferred) return undefined;
  // In the offered spelling: a preference stored as "umol/L" is µmol/L
  return preferredUnitOptions(definition).find((unit) => unitsMatch(unit, preferred));
}

/**
 * Unit a test is shown in: the offered preference, else the standard unit;
 * undefined when HemoIO has no standard unit for it
 */
export function resolveDisplayUnit(
  definition: UnitSource | undefined,
  preferred: string | undefined
): string | undefined {
  return preferredUnitFor(definition, preferred) ?? definition?.canonicalUnit;
}

export interface DisplayableValue {
  value: unknown;
  unit: string;
  referenceRangeLow?: number;
  referenceRangeHigh?: number;
  numericValueType?: string;
}

/**
 * The value and its range in `targetUnit`, converted as `substance`.
 * Unchanged when there is no target, the value is not a plain number
 * (Positive/Negative, text, an interval), or it cannot be converted.
 */
export function convertForDisplay<T extends DisplayableValue>(
  substance: SubstanceRef,
  item: T,
  targetUnit: string | undefined
): T {
  if (!targetUnit || typeof item.value !== 'number' || item.numericValueType === 'interval') {
    return item;
  }
  const converted = convertMeasurement(
    substance,
    {
      value: item.value,
      unit: item.unit,
      referenceRangeLow: item.referenceRangeLow,
      referenceRangeHigh: item.referenceRangeHigh,
    },
    targetUnit
  );
  if (converted.unit === item.unit) return item;
  return {
    ...item,
    value: converted.value,
    unit: converted.unit,
    referenceRangeLow: converted.referenceRange.low,
    referenceRangeHigh: converted.referenceRange.high,
  };
}
