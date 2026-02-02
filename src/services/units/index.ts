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
  type UnitConversion,
  type BiomarkerConversions,
} from './definitions';
