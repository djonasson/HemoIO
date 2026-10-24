/**
 * Dictionary suggestions for typing a biomarker name in review
 */
import {
  findBiomarker,
  searchBiomarkers,
  type BiomarkerDefinition,
} from '@data/biomarkers/dictionary';
import { canConvert, normalizeUnit } from '@services/units/conversion';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

/** Dictionary names containing the text, by name first, then by alias */
export function suggestBiomarkerNames(search: string, limit = 10): string[] {
  const term = search.trim().toLowerCase();
  if (!term) return [];
  const matches = searchBiomarkers(term);
  const byName = matches.filter((b) => b.name.toLowerCase().includes(term));
  const byAlias = matches.filter((b) => !b.name.toLowerCase().includes(term));
  return [...byName, ...byAlias].slice(0, limit).map((b) => b.name);
}

/** Units the dictionary knows for a biomarker name or alias */
export function unitOptionsFor(name: string): string[] {
  const definition = findBiomarker(name);
  if (!definition) return [];
  return [...new Set([definition.canonicalUnit, ...definition.alternativeUnits].filter(Boolean))];
}

/**
 * Rename a value: the dictionary match follows the name, so free text is
 * saved as an unknown biomarker rather than under its previous match. The
 * unit is left as it is (an empty one gets the biomarker's standard unit):
 * typing passes through names of other biomarkers, and the number was
 * measured in that unit. Review asks for a fitting unit before saving.
 */
export function applyBiomarkerName<T extends MatchedBiomarker>(biomarker: T, name: string): T {
  const match = findBiomarker(name);
  return {
    ...biomarker,
    name,
    dictionaryMatch: match,
    isExactMatch: match !== undefined,
    unit: biomarker.unit || match?.canonicalUnit || '',
    renamedInReview: true,
  };
}

/** Units compared as written, ignoring case and how micro is spelled */
function unitKey(unit: string): string {
  return normalizeUnit(unit.trim().replace(/\u03bc/g, '\u00b5')).toLowerCase();
}

/**
 * Whether a value in `unit` can be saved under this biomarker: a unit the
 * dictionary lists for it, or one that converts to its standard unit
 */
export function unitFitsBiomarker(definition: BiomarkerDefinition, unit: string): boolean {
  const listed = [definition.canonicalUnit, ...definition.alternativeUnits];
  return (
    listed.some((option) => unitKey(option) === unitKey(unit)) ||
    canConvert(definition.name, unit, definition.canonicalUnit)
  );
}
