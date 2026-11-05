/**
 * Summary of one test's recorded values: how many there are, and the
 * newest one (in the display unit when it converts). A test is a trend
 * group: its values may be recorded under any of the group's codes.
 */
import { trendCode } from '@data/loinc/display';
import { convertForDisplay } from '@services/units';
import type { Catalog } from '@data/loinc/catalog';

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
  /** Number of recorded values of the test */
  count: number;
  latest: {
    value: number | string | boolean;
    unit: string;
    date: Date;
    status: Status;
    labName: string;
  };
}

/** null when the test (a trend code) has no recorded values */
export function summarizeBiomarkerResults(
  catalog: Catalog,
  results: ReadonlyArray<SummarizableResult>,
  code: string,
  displayUnit?: string
): BiomarkerResultSummary | null {
  let count = 0;
  let latest: BiomarkerResultSummary['latest'] | null = null;

  for (const result of results) {
    for (const testValue of result.testValues) {
      if (trendCode(catalog, testValue.biomarkerKey) !== code) continue;
      count += 1;
      if (latest && latest.date.getTime() >= result.date.getTime()) continue;
      const shown = convertForDisplay(catalog.test(testValue.biomarkerKey) ?? '', testValue, displayUnit);
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
