/**
 * Whether values of one report are the same test, and the same measurement
 * of it in two units: the analyzer merges such values, and review merges a
 * value once the user gives it the test of another
 */
import { getAddon } from '@data/loinc/addons';
import { nameKey } from '@data/loinc/keys';
import { canConvert, convertValue, normalizeUnit, unitsMatch } from '../units';
import type { Catalog } from '@data/loinc/catalog';
import type { MatchedBiomarker } from './LabReportAnalyzer';

/**
 * Relative tolerance for comparing converted values (2% difference allowed)
 * This accounts for rounding errors that occur when:
 * 1. Labs round values before reporting
 * 2. Labs convert between units and round again
 * 3. Our conversion math introduces small floating point differences
 *
 * Example: Triglycerides 0.9 mmol/L = 79.65 mg/dL ≈ 80 mg/dL
 * vs the lab's direct measurement of 79 mg/dL - a 1.26% difference
 */
const RELATIVE_TOLERANCE = 0.02;

/** Decimal places used when converting values only to compare them */
const COMPARISON_PRECISION = 10;

/**
 * LOINC properties that come as a mass and a molar pair: MCnc and SCnc,
 * MRat and SRat… A ratio to creatinine in mg/g is MRto, in mg/mmol Ratio.
 */
const MASS_OR_MOLAR = /^(?:[MS](?:Cnc|Rat|Cnt|Rto)|Ratio)$/;

/**
 * Half the last reported digit: how far rounding can have moved a value. A
 * small whole value counts as printed with one decimal (an HbA1c "6.0 %"
 * reaches the analyzer as 6): labs print small values with decimals.
 */
function roundingAllowance(value: number): number {
  const decimals = (String(value).split('.')[1] ?? '').length;
  const printed = decimals === 0 && Math.abs(value) < 10 ? 1 : decimals;
  return 0.5 * 10 ** -printed;
}

/**
 * The test a value is, for telling duplicates: its code, with a code's mass
 * and molar forms one test (glucose mg/dL and mmol/L in serum, a 24-hour
 * amount in g and in µmol, a protein/creatinine ratio in mg/g and mg/mmol). A value with no code is only the same test as
 * one of the same printed name in the same unit: nothing else says it is.
 * Serum and blood, or a 24-hour amount and a concentration, are not one
 * test, though they may trend together.
 */
export function sameTestKey(biomarker: MatchedBiomarker, catalog: Catalog): string {
  const test = biomarker.loincCode ? catalog.test(biomarker.loincCode) : undefined;
  if (!test) {
    return biomarker.loincCode
      ? `code:${biomarker.loincCode}`
      : `name:${nameKey(biomarker.name)}|${normalizeUnit(biomarker.unit)}`;
  }
  if (!MASS_OR_MOLAR.test(test.property)) return `code:${test.code}`;
  // "Creatinine [Mass/time] in 24 hour Urine" and "[Moles/time]": one name without the property
  const name = nameKey(test.name.replace(/\s*\[[^\]]*\]/, ''));
  const quantity = test.property === 'Ratio' ? 'Rto' : test.property.slice(1);
  return `test:${test.component}|${quantity}|${test.system}|${test.method}|${name}`;
}

/** A value of a group, in the group's unit when it could be converted */
export interface ComparableValue {
  biomarker: MatchedBiomarker;
  /** Unrounded value in the group's unit (rounding before comparing adds error) */
  comparison?: number;
  /** Rounded value in the group's unit, shown in conflict messages */
  converted?: number;
  /** How far the lab's rounding can have moved the value, in the group's unit */
  allowance: number;
}

/** What the values of one test are compared in */
export interface GroupUnit {
  /** The substance conversions use: the test's LOINC component */
  component?: string;
  /** HemoIO's standard unit of the test, if it has one */
  canonicalUnit?: string;
  /** The unit values are compared in: the standard one, else the first value's */
  unit: string;
}

/** The unit a group of values of one test is compared in */
export function groupUnit(group: readonly MatchedBiomarker[], catalog: Catalog): GroupUnit {
  const codes = group.flatMap((b) => (b.loincCode ? [b.loincCode] : []));
  const component = codes.map((code) => catalog.test(code)?.component).find(Boolean);
  const canonicalUnit = codes.map((code) => getAddon(catalog, code)?.canonicalUnit).find(Boolean);
  return { component, canonicalUnit, unit: canonicalUnit ?? group[0].unit };
}

/** A value in its group's unit; one that cannot be converted has no comparison */
export function comparable(biomarker: MatchedBiomarker, { component, unit }: GroupUnit): ComparableValue {
  if (unitsMatch(biomarker.unit, unit)) {
    return {
      biomarker,
      comparison: biomarker.value,
      converted: biomarker.value,
      allowance: roundingAllowance(biomarker.value),
    };
  }
  if (!component || !canConvert(component, biomarker.unit, unit)) return { biomarker, allowance: 0 };
  try {
    const convert = (value: number, precision?: number) =>
      convertValue(component, value, biomarker.unit, unit, precision).convertedValue;
    const comparison = convert(biomarker.value, COMPARISON_PRECISION);
    const step = roundingAllowance(biomarker.value);
    return {
      biomarker,
      comparison,
      converted: convert(biomarker.value),
      allowance: Math.abs(convert(biomarker.value + step, COMPARISON_PRECISION) - comparison),
    };
  } catch {
    return { biomarker, allowance: 0 };
  }
}

/**
 * Whether two values are the same measurement, reported in the same or
 * different units.
 *
 * The tolerance is relative: an absolute allowance would treat small values
 * that differ substantially (e.g. creatinine 0.76 vs 1.5 mg/dL) as the same.
 * Values reported in different units may also differ by the rounding of each
 * (urea 3.06 mmol/L is 18.4 mg/dL, reported as 18). Anything outside is
 * flagged for review rather than merged: a borderline difference costs a
 * review, not data.
 */
export function sameMeasurement(a: ComparableValue, b: ComparableValue): boolean {
  if (a.comparison === undefined || b.comparison === undefined) return false;
  if (a.comparison === b.comparison) return true;
  const diff = Math.abs(a.comparison - b.comparison);
  const avg = (Math.abs(a.comparison) + Math.abs(b.comparison)) / 2;
  if (avg > 0 && diff / avg <= RELATIVE_TOLERANCE) return true;
  const differentUnits = !unitsMatch(a.biomarker.unit, b.biomarker.unit);
  return differentUnits && diff <= a.allowance + b.allowance;
}

/** Values grouped by the test they are (see sameTestKey), in report order */
export function groupBySameTest(
  biomarkers: readonly MatchedBiomarker[],
  catalog: Catalog
): MatchedBiomarker[][] {
  const groups = new Map<string, MatchedBiomarker[]>();
  for (const biomarker of biomarkers) {
    const key = sameTestKey(biomarker, catalog);
    const group = groups.get(key);
    if (group) group.push(biomarker);
    else groups.set(key, [biomarker]);
  }
  return [...groups.values()];
}

/** Values that are the same measurement, each cluster in report order */
export function clusterMeasurements(values: readonly ComparableValue[]): ComparableValue[][] {
  const clusters: ComparableValue[][] = [];
  for (const value of values) {
    const cluster = clusters.find((c) => sameMeasurement(c[0], value));
    if (cluster) cluster.push(value);
    else clusters.push([value]);
  }
  return clusters;
}

/**
 * Whether each measurement of one test's values can be kept once without
 * asking: there is one measurement; distinct measurements come under
 * distinct printed names (a 24-hour and a spot sample); or values that
 * cannot be compared come under different codes, so nothing says they are
 * one. Otherwise the values conflict and the user keeps the right one.
 */
export function isSettled(values: readonly ComparableValue[], clusters: readonly ComparableValue[][]): boolean {
  if (clusters.length === 1) return true;
  const reportedName = (value: ComparableValue) => value.biomarker.name.toLowerCase().trim();
  const namesPerCluster = clusters.map((c) => new Set(c.map(reportedName)));
  const distinctNames = namesPerCluster.every(
    (names, i) =>
      names.size === 1 && namesPerCluster.every((other, j) => i === j || !other.has([...names][0]))
  );
  const uncomparable = values.some((v) => v.comparison === undefined);
  const oneCode = new Set(values.map((v) => v.biomarker.loincCode)).size === 1;
  return (distinctNames && !uncomparable) || (uncomparable && !oneCode);
}

/** The value of a cluster that is kept: the one in the standard unit, else the first */
export function preferredValue(cluster: readonly ComparableValue[], unit: GroupUnit): ComparableValue {
  const { canonicalUnit } = unit;
  return (
    cluster.find((v) => canonicalUnit !== undefined && unitsMatch(v.biomarker.unit, canonicalUnit)) ?? cluster[0]
  );
}
