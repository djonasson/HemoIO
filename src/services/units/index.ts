export {
  convertValue,
  convertReferenceRange,
  canConvert,
  getSupportedUnits,
  formatValueWithUnit,
  parseValueWithUnit,
  normalizeUnit,
  ConversionError,
  type ConversionResult,
  type ReferenceRange,
} from './conversion';

export {
  UNIT_CONVERSIONS,
  findConversionDefinition,
  getConversionFactor,
  normalizeUnitForLookup,
  unitsMatch,
  type UnitConversion,
  type SubstanceConversions,
  type Substance,
  type SubstanceRef,
} from './definitions';

export {
  convertMeasurement,
  type Measurement,
  type ConvertedMeasurement,
} from './convertMeasurement';
export {
  preferredUnitOptions,
  preferredUnitFor,
  resolveDisplayUnit,
  convertForDisplay,
  type UnitSource,
  type DisplayableValue,
} from './displayUnit';
