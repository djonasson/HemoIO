/**
 * Dictionary suggestions for typing a biomarker name in review
 */
import { findBiomarker, searchBiomarkers } from '@data/biomarkers/dictionary';
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
 * saved as an unknown biomarker rather than under its previous match
 */
export function applyBiomarkerName<T extends MatchedBiomarker>(biomarker: T, name: string): T {
  const match = findBiomarker(name);
  return {
    ...biomarker,
    name,
    dictionaryMatch: match,
    isExactMatch: match !== undefined,
    unit: unitAfterRename(biomarker.unit, match?.canonicalUnit, unitOptionsFor(name)),
  };
}

/**
 * The unit after a rename: kept when the biomarker can have it (or is not in
 * the dictionary), else the biomarker's own unit, so e.g. renaming Glucose
 * (mg/dL) to Hemoglobin does not save Hemoglobin in mg/dL
 */
function unitAfterRename(unit: string, canonicalUnit: string | undefined, options: string[]): string {
  if (canonicalUnit === undefined) return unit;
  if (!unit) return canonicalUnit;
  const known = options.some((option) => option.toLowerCase() === unit.toLowerCase());
  return known ? unit : canonicalUnit;
}
