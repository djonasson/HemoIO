/**
 * What review says a value's identification needs checked
 */
import type { IdentificationFlag, MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

export const IDENTIFICATION_LABELS: Record<IdentificationFlag, (b: MatchedBiomarker) => string> = {
  'unit-mismatch': () => "Unit doesn't fit",
  'name-disagrees': (b) => `Name suggests ${b.nameSuggests?.name ?? 'another test'}`,
  'name-only': () => 'Matched by name only',
  'similar-name': () => 'Matched by similar name',
  'not-identified': () => 'Not identified',
};
