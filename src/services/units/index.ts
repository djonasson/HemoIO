export {
  convertValue,
  canConvert,
  normalizeUnit,
  ConversionError,
  type ConversionResult,
} from './conversion';

export {
  findConversionDefinition,
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
