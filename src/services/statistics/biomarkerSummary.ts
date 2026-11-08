/**
 * Summary of one test's recorded values: how many there are, and the
 * newest one (in the display unit when it converts). A test is a trend
 * group: its values may be recorded under any of the group's codes.
 */
import { trendCode } from '@data/loinc/display';
import { convertForDisplay } from '@services/units';
import type { Catalog } from '@data/loinc/catalog';
import { isTrendable } from '@/utils/isTrendable';
import type { StatusBasis } from './valueStatus';
import type { CensoredComparator, LabFlag, NumericValueType } from '@/types';

type Status = 'normal' | 'low' | 'high' | 'unknown';

export interface SummarizableResult {
  date: Date;
  labName: string;
  testValues: ReadonlyArray<{
    biomarkerKey: string;
    value: number | string | boolean;
    unit: string;
    status: Status;
    statusBasis?: StatusBasis;
    labFlag?: LabFlag;
    numericValueType?: NumericValueType;
    intervalLow?: number;
    intervalHigh?: number;
    censored?: CensoredComparator;
  }>;
}

export interface BiomarkerResultSummary {
  /** Number of recorded values of the test */
  count: number;
  /** Whether Trends can chart any of them: a number, not a word (see isTrendable) */
  trendable: boolean;
  latest: {
    value: number | string | boolean;
    unit: string;
    /** An interval's kind and ends, so it reads as its ends ("5-10") */
    numericValueType?: NumericValueType;
    intervalLow?: number;
    intervalHigh?: number;
    /** A censored value's comparator, so "< 10" never reads as 10 */
    censored?: CensoredComparator;
    date: Date;
    status: Status;
    /** What gave the status, as the timeline says it */
    statusBasis?: StatusBasis;
    /** The lab's own mark */
    labFlag?: LabFlag;
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
  let trendable = false;
  let latest: BiomarkerResultSummary['latest'] | null = null;

  for (const result of results) {
    for (const testValue of result.testValues) {
      if (trendCode(catalog, testValue.biomarkerKey) !== code) continue;
      count += 1;
      trendable ||= isTrendable(testValue);
      if (latest && latest.date.getTime() >= result.date.getTime()) continue;
      const shown = convertForDisplay(catalog.test(testValue.biomarkerKey) ?? '', testValue, displayUnit);
      latest = {
        value: shown.value,
        unit: shown.unit,
        numericValueType: shown.numericValueType,
        intervalLow: shown.intervalLow,
        intervalHigh: shown.intervalHigh,
        censored: shown.censored,
        date: result.date,
        status: testValue.status,
        statusBasis: testValue.statusBasis,
        labFlag: testValue.labFlag,
        labName: result.labName,
      };
    }
  }

  return latest ? { count, trendable, latest } : null;
}
