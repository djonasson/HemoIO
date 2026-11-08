/**
 * The lines Trends draws: one per test, where codes that trend together
 * (glucose in mg/dL and in mmol/L) are one test, shown in its preferred
 * unit. A value that cannot be converted to its line's unit is not read on
 * that line's scale: it goes on a line of its own, for its unit.
 */
import { testKey, testName, testUnits, trendCode } from '@data/loinc/display';
import {
  convertMeasurement,
  normalizeUnitForLookup,
  preferredUnitOptions,
  resolveDisplayUnit,
  unitsMatch,
} from '@services/units';
import { isTrendable } from '@/utils/isTrendable';
import type { Catalog } from '@data/loinc/catalog';
import type { TrendDataPoint } from './trendAnalysis';
import type { CensoredComparator, NumericValueType } from '@/types';

type Status = 'normal' | 'low' | 'high' | 'unknown';

export interface TrendableResult {
  date: Date;
  labName: string;
  testValues: ReadonlyArray<{
    id?: number;
    labResultId: number;
    biomarkerKey: string;
    rawText?: string;
    value: unknown;
    unit: string;
    referenceRangeLow?: number;
    referenceRangeHigh?: number;
    status: Status;
    numericValueType?: NumericValueType;
    intervalLow?: number;
    intervalHigh?: number;
    censored?: CensoredComparator;
  }>;
}

export interface TrendLine {
  /** Identifies the line: its test's trend code, with the unit for a line of its own */
  key: string;
  /** The code the test is shown under; its notes are filed under it */
  trendCode: string;
  /** The key the test's preferred unit, target and acknowledged alerts are kept under (see testKey) */
  testKey: string;
  /** The line's name: the test's name, with the unit for a line of its own */
  name: string;
  /** The test's name alone, for what belongs to the whole test (its reference, its notes) */
  testName: string;
  unit: string;
  /** Units the line can be shown in; none for a line of its own */
  unitOptions: string[];
  /** The test's LOINC class, "Other" for a value that is not a LOINC test */
  classLabel: string;
  /** Whether the test has a page in the biomarker dictionary: a LOINC test */
  isLoincTest: boolean;
  /** Oldest first */
  dataPoints: TrendDataPoint[];
  /** The test's values on lines of their own: their unit does not convert to this line's */
  elsewhere: { count: number; units: string[] };
}

const OTHER_CLASS = 'Other';

/** One key for a unit however it is spelled or cased, as unitsMatch reads units */
function unitKey(unit: string): string {
  return normalizeUnitForLookup(unit).toLowerCase();
}

/** A line of its own's name: the test's, with the unit its values share */
function ownLineName(name: string, unit: string): string {
  return unit ? `${name} in ${unit}` : `${name} with no unit`;
}

/**
 * An interval's ends, which read in its own unit only: converted, its
 * midpoint is a number in another unit, and its ends are not
 */
function intervalOf(
  value: TrendableResult['testValues'][number],
  shownUnit: string
): Pick<TrendDataPoint, 'interval'> {
  const { numericValueType, intervalLow, intervalHigh } = value;
  if (numericValueType !== 'interval' || intervalLow === undefined || intervalHigh === undefined) return {};
  return shownUnit === value.unit ? { interval: { low: intervalLow, high: intervalHigh } } : {};
}

/** Every line, in no order; keyed by TrendLine.key */
export function buildTrendLines(
  catalog: Catalog,
  results: ReadonlyArray<TrendableResult>,
  unitPreferences: Readonly<Record<string, string>>
): Map<string, TrendLine> {
  type Value = TrendableResult['testValues'][number] & { value: number };
  const byTest = new Map<string, Array<{ result: TrendableResult; value: Value }>>();
  for (const result of results) {
    for (const value of result.testValues) {
      if (!isTrendable(value)) continue;
      const key = testKey(catalog, value.biomarkerKey);
      const entries = byTest.get(key);
      if (entries) entries.push({ result, value });
      else byTest.set(key, [{ result, value }]);
    }
  }

  const lines = new Map<string, TrendLine>();
  for (const [key, entries] of byTest) {
    entries.sort((a, b) => a.result.date.getTime() - b.result.date.getTime());
    const code = trendCode(catalog, key);
    const test = catalog.test(code);
    const units = testUnits(catalog, code);
    const name = testName(catalog, key, entries[0].value.rawText);
    const classLabel = test ? catalog.classLabel(test.classCode) : OTHER_CLASS;

    // The preferred unit when the test offers it, else its standard unit;
    // a test HemoIO has no unit for keeps its first unit
    const lineUnit = resolveDisplayUnit(units, unitPreferences[key]) ?? entries[0].value.unit;
    const byUnit = new Map<string, TrendDataPoint[]>();
    let main: TrendDataPoint[] = [];
    for (const { result, value } of entries) {
      const converted = convertMeasurement(
        catalog.test(value.biomarkerKey) ?? '',
        {
          value: value.value,
          unit: value.unit,
          referenceRangeLow: value.referenceRangeLow,
          referenceRangeHigh: value.referenceRangeHigh,
        },
        lineUnit
      );
      const point: TrendDataPoint = {
        date: result.date,
        value: converted.value,
        unit: converted.unit,
        status: value.status,
        referenceRange: converted.referenceRange,
        labName: result.labName,
        testValueId: value.id,
        labResultId: value.labResultId,
        ...intervalOf(value, converted.unit),
        ...(value.censored ? { censored: value.censored } : {}),
      };
      if (unitsMatch(converted.unit, lineUnit)) {
        main.push({ ...point, unit: lineUnit });
      } else {
        const points = byUnit.get(unitKey(converted.unit));
        if (points) points.push(point);
        else byUnit.set(unitKey(converted.unit), [point]);
      }
    }

    let unit = lineUnit;
    if (main.length === 0) {
      // Nothing converts to the line's unit: the unit most values share takes its place
      const [mostKey, most] = [...byUnit].sort((a, b) => b[1].length - a[1].length)[0];
      byUnit.delete(mostKey);
      main = most;
      unit = most[0].unit;
    }
    const others = [...byUnit.values()];
    lines.set(code, {
      key: code,
      trendCode: code,
      testKey: key,
      name,
      testName: name,
      unit,
      unitOptions: units ? preferredUnitOptions(units) : [],
      classLabel,
      isLoincTest: test !== undefined,
      dataPoints: main,
      elsewhere: {
        count: others.reduce((sum, points) => sum + points.length, 0),
        units: others.map((points) => points[0].unit),
      },
    });
    for (const points of others) {
      const otherUnit = points[0].unit;
      const lineKey = ownLineName(code, unitKey(otherUnit));
      lines.set(lineKey, {
        key: lineKey,
        trendCode: code,
        testKey: key,
        name: ownLineName(name, otherUnit),
        testName: name,
        unit: otherUnit,
        unitOptions: [],
        classLabel,
        isLoincTest: test !== undefined,
        dataPoints: points,
        elsewhere: { count: 0, units: [] },
      });
    }
  }
  return lines;
}
