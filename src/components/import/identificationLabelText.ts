/**
 * What review says a value's identification needs checked
 */
import type { IdentificationFlag } from '@services/analysis/LabReportAnalyzer';

export const IDENTIFICATION_LABELS: Record<IdentificationFlag, string> = {
  ambiguous: 'Choose a test',
  'not-identified': 'Not identified',
  'no-unit': 'No unit in report',
};
