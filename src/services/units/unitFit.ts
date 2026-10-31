/**
 * Whether a value's unit fits a dictionary test, the check review, the
 * analyzer and saving share
 */
import type { BiomarkerDefinition } from '@data/biomarkers/dictionary';
import { canConvert } from './conversion';
import { unitsMatch } from './definitions';

/**
 * Whether a value in `unit` can be saved under this biomarker: a unit the
 * dictionary lists for it, or one that converts to its standard unit
 */
export function unitFitsBiomarker(definition: BiomarkerDefinition, unit: string): boolean {
  const listed = [definition.canonicalUnit, ...definition.alternativeUnits];
  return (
    listed.some((option) => unitsMatch(option, unit)) ||
    canConvert(definition.name, unit, definition.canonicalUnit)
  );
}
