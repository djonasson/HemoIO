/**
 * Whether a value's unit fits a dictionary test, the check review, the
 * analyzer and saving share
 */
import { BIOMARKER_DEFINITIONS, type BiomarkerDefinition } from '@data/biomarkers/dictionary';
import { canConvert } from './conversion';
import { unitsMatch } from './definitions';
import { componentForBiomarker } from './legacyComponents';

function listedUnits(definition: BiomarkerDefinition): string[] {
  return [definition.canonicalUnit, ...definition.alternativeUnits];
}

let testsBySubstance: Map<string, BiomarkerDefinition[]> | undefined;

/** The dictionary tests of one substance (LOINC component), e.g. creatinine in serum and in urine */
function testsOfSubstance(component: string): BiomarkerDefinition[] {
  if (!testsBySubstance) {
    testsBySubstance = new Map();
    for (const definition of BIOMARKER_DEFINITIONS) {
      const key = componentForBiomarker(definition.name);
      testsBySubstance.set(key, [...(testsBySubstance.get(key) ?? []), definition]);
    }
  }
  return testsBySubstance.get(component) ?? [];
}

/**
 * Whether a value in `unit` can be saved under this biomarker: a unit the
 * dictionary lists for it, or one that converts to its standard unit. A
 * unit another test of the same substance lists is that test's: conversions
 * are by substance, so serum urea converts from g/L, but urea in g/L is the
 * urine test.
 */
export function unitFitsBiomarker(definition: BiomarkerDefinition, unit: string): boolean {
  if (listedUnits(definition).some((option) => unitsMatch(option, unit))) return true;
  const component = componentForBiomarker(definition.name);
  if (!canConvert(component, unit, definition.canonicalUnit)) return false;
  return !testsOfSubstance(component).some(
    (other) => other !== definition && listedUnits(other).some((option) => unitsMatch(option, unit))
  );
}
