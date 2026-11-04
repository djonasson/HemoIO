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
  unitsMatch,
  type UnitConversion,
  type SubstanceConversions,
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

export { componentForBiomarker } from './legacyComponents';
