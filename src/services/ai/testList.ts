/**
 * The dictionary's tests as the AI is shown them, one line each:
 * "urine-creatinine: Urine Creatinine [urine; mg/dL, µmol/L, g/L]". The
 * units let the AI tell a concentration from an amount per day, and a
 * count from a percentage.
 */
import type { BiomarkerDefinition } from '@data/biomarkers/dictionary';

export function buildTestList(definitions: readonly BiomarkerDefinition[]): string {
  return definitions
    .map((d) => {
      const units = [...new Set([d.canonicalUnit, ...d.alternativeUnits].filter(Boolean))];
      return `${d.key}: ${d.name} [${d.specimenType ?? 'unspecified'}; ${units.join(', ') || 'no unit'}]`;
    })
    .join('\n');
}
