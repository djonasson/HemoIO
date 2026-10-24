/**
 * A biomarker's standard range beside the user's personal target, as the
 * targets list and the target editor show it
 */
import type { BiomarkerDefinition } from '@data/biomarkers';

export interface PersonalTarget {
  biomarkerKey: string;
  biomarkerName: string;
  unit: string;
  standardLow?: number;
  standardHigh?: number;
  personalLow?: number;
  personalHigh?: number;
}

interface TargetRange {
  low?: number;
  high?: number;
}

/** Whether a stored target sets at least one bound */
export function hasTargetRange(range: TargetRange | undefined): range is TargetRange {
  return range !== undefined && (range.low !== undefined || range.high !== undefined);
}

export function toPersonalTarget(
  biomarker: BiomarkerDefinition,
  target: TargetRange | undefined
): PersonalTarget {
  return {
    biomarkerKey: biomarker.key,
    biomarkerName: biomarker.name,
    unit: biomarker.canonicalUnit,
    standardLow: biomarker.defaultReferenceRange?.low,
    standardHigh: biomarker.defaultReferenceRange?.high,
    personalLow: target?.low,
    personalHigh: target?.high,
  };
}
