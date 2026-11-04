/**
 * Which unit a biomarker is shown in, and converting a value for display.
 *
 * A preference only counts when the biomarker offers that unit, so a stale
 * or edited preference (from an old backup) can never mislabel a value.
 */
import { canConvert } from './conversion';
import { convertMeasurement } from './convertMeasurement';
import { unitsMatch } from './definitions';
import { componentForBiomarker } from './legacyComponents';

/** What a biomarker definition needs to offer units */
export interface UnitSource {
  /** Dictionary name, read as a LOINC component through componentForBiomarker until Task 8 */
  name: string;
  canonicalUnit: string;
  alternativeUnits?: string[];
}

/** Standard unit first, then every alternative the standard unit converts to */
export function preferredUnitOptions(definition: UnitSource): string[] {
  const units = new Set([definition.canonicalUnit, ...(definition.alternativeUnits ?? [])]);
  return [...units].filter(
    (unit) =>
      unit === definition.canonicalUnit ||
      canConvert(componentForBiomarker(definition.name), definition.canonicalUnit, unit)
  );
}

/** The stored preference if the biomarker offers it, else undefined */
export function preferredUnitFor(
  definition: UnitSource | undefined,
  preferred: string | undefined
): string | undefined {
  if (!definition || !preferred) return undefined;
  // In the offered spelling: a preference stored as "umol/L" is µmol/L
  return preferredUnitOptions(definition).find((unit) => unitsMatch(unit, preferred));
}

/**
 * Unit a biomarker is shown in: the offered preference, else the standard
 * unit; undefined when the biomarker is not in the dictionary
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
 * The value and its range in `targetUnit`, converted as the substance
 * `component` (a LOINC component). Unchanged when there is no
 * target, the value is not a plain number (Positive/Negative, text, an
 * interval), or it cannot be converted.
 */
export function convertForDisplay<T extends DisplayableValue>(
  component: string,
  item: T,
  targetUnit: string | undefined
): T {
  if (!targetUnit || typeof item.value !== 'number' || item.numericValueType === 'interval') {
    return item;
  }
  const converted = convertMeasurement(
    component,
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
