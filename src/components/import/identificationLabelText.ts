/**
 * What review says a value's identification needs checked
 */
import type { IdentificationFlag } from '@services/analysis/LabReportAnalyzer';

export const IDENTIFICATION_LABELS: Record<IdentificationFlag, string> = {
  ambiguous: 'Choose a test',
  'not-identified': 'Not identified',
  'no-unit': 'No unit in report',
};

/** A unit not of the kind of the value's test: a daily amount saved as a concentration */
export const UNIT_MISFIT_LABEL = "Unit doesn't fit the test";
