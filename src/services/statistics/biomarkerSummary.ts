/**
 * Summary of one biomarker's recorded values: how many there are, and the
 * newest one (in the display unit when it converts).
 */
import { componentForBiomarker, convertForDisplay } from '@services/units';

type Status = 'normal' | 'low' | 'high' | 'unknown';

export interface SummarizableResult {
  date: Date;
  labName: string;
  testValues: ReadonlyArray<{
    biomarkerKey: string;
    value: number | string | boolean;
    unit: string;
    status: Status;
    numericValueType?: string;
  }>;
}

export interface BiomarkerResultSummary {
  /** Number of recorded values for the biomarker */
  count: number;
  latest: {
    value: number | string | boolean;
    unit: string;
    date: Date;
    status: Status;
    labName: string;
  };
}

/** null when the biomarker has no recorded values */
export function summarizeBiomarkerResults(
  results: ReadonlyArray<SummarizableResult>,
  biomarker: { key: string; name: string },
  displayUnit?: string
): BiomarkerResultSummary | null {
  let count = 0;
  let latest: BiomarkerResultSummary['latest'] | null = null;

  for (const result of results) {
    for (const testValue of result.testValues) {
      if (testValue.biomarkerKey !== biomarker.key) continue;
      count += 1;
      if (latest && latest.date.getTime() >= result.date.getTime()) continue;
      const shown = convertForDisplay(componentForBiomarker(biomarker.name), testValue, displayUnit);
      latest = {
        value: shown.value,
        unit: shown.unit,
        date: result.date,
        status: testValue.status,
        labName: result.labName,
      };
    }
  }

  return latest ? { count, latest } : null;
}
