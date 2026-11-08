/**
 * Whether values of one report are the same test, and the same measurement
 * of it in two units: the analyzer merges such values, and review merges a
 * value once the user gives it the test of another
 */
import { getAddon } from '@data/loinc/addons';
import { nameKey } from '@data/loinc/keys';
import { canConvert, COMPARISON_PRECISION, convertValue, normalizeUnit, unitsMatch } from '../units';
import { quantityKind, type Catalog, type CatalogTest } from '@data/loinc/catalog';
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
  const quantity = quantityKind(test.property);
  // A property with no mass and molar pair is the code's own
  if (quantity === test.property) return `code:${test.code}`;
  // "Creatinine [Mass/time] in 24 hour Urine" and "[Moles/time]": one name without the property
  const name = nameKey(test.name.replace(/\s*\[[^\]]*\]/, ''));
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
  /**
   * What conversions use: the test itself (component, property and sample),
   * as a rate or a volume converts only knowing its property
   */
  substance?: CatalogTest;
  /** HemoIO's standard unit of the test, if it has one */
  canonicalUnit?: string;
  /**
   * The unit values are compared in: the standard one, else the first unit
   * of a value that every value reaches (two values in a unit that cannot
   * reach the standard one compare in their own), else the standard one or
   * the first value's
   */
  unit: string;
}

/** The unit a group of values of one test is compared in */
export function groupUnit(group: readonly MatchedBiomarker[], catalog: Catalog): GroupUnit {
  const codes = group.flatMap((b) => (b.loincCode ? [b.loincCode] : []));
  const substance = codes.map((code) => catalog.test(code)).find(Boolean);
  const canonicalUnit = codes.map((code) => getAddon(catalog, code)?.canonicalUnit).find(Boolean);
  const reaches = (from: string, to: string): boolean =>
    unitsMatch(from, to) || (!!substance && canConvert(substance, from, to));
  const choices = [...(canonicalUnit ? [canonicalUnit] : []), ...group.map((b) => b.unit)];
  const unit =
    choices.find((choice) => group.every((b) => reaches(b.unit, choice))) ?? canonicalUnit ?? group[0].unit;
  return { substance, canonicalUnit, unit };
}

/** A value in its group's unit; one that cannot be converted has no comparison */
export function comparable(biomarker: MatchedBiomarker, { substance, unit }: GroupUnit): ComparableValue {
  if (unitsMatch(biomarker.unit, unit)) {
    return {
      biomarker,
      comparison: biomarker.value,
      converted: biomarker.value,
      allowance: roundingAllowance(biomarker.value),
    };
  }
  if (!substance || !canConvert(substance, biomarker.unit, unit)) return { biomarker, allowance: 0 };
  try {
    const convert = (value: number, precision?: number): number =>
      convertValue(substance, value, biomarker.unit, unit, precision).convertedValue;
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

/** What a printed name says in brackets: "eGFR (EKFC)" says "ekfc" */
function qualifiersOf(name: string): string[] {
  return [...name.matchAll(/\(([^()]*)\)/g)].map(([, inner]) => nameKey(inner)).filter(Boolean);
}

/** Whether two names each qualify their test in brackets, and differently */
function qualifiedApart(a: string, b: string): boolean {
  const [ofA, ofB] = [qualifiersOf(a), qualifiersOf(b)];
  return ofA.length > 0 && ofB.length > 0 && ofA.join('|') !== ofB.join('|');
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
  // In one unit, "eGFR (EKFC)" and "eGFR (Schwartz)" are two estimates, however close
  if (unitsMatch(a.biomarker.unit, b.biomarker.unit) && qualifiedApart(a.biomarker.name, b.biomarker.name)) return false;
  // In one unit, "< 10" is a bound and 10 a measurement: never the same
  if (!a.biomarker.censored !== !b.biomarker.censored && unitsMatch(a.biomarker.unit, b.biomarker.unit)) return false;
  // "> 0.50" and "< 44" bound the value from opposite sides: they say different things
  if (a.biomarker.censored && b.biomarker.censored && a.biomarker.censored[0] !== b.biomarker.censored[0]) return false;
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

/** Whether each cluster has one printed name, and no two clusters the same one */
function distinctNames(clusters: readonly ComparableValue[][]): boolean {
  const namesPerCluster = clusters.map((c) => new Set(c.map((value) => nameKey(value.biomarker.name))));
  return namesPerCluster.every(
    (names, i) =>
      names.size === 1 && namesPerCluster.every((other, j) => i === j || !other.has([...names][0]))
  );
}

/**
 * Whether each measurement of one test's values can be kept once without
 * asking. The values that can be compared must be one measurement, or
 * distinct measurements under distinct printed names (a 24-hour and a spot
 * sample). A value that cannot be compared is kept beside them only under a
 * code no other value has: nothing says it is one with them. Otherwise the
 * values conflict and the user keeps the right one.
 */
export function isSettled(values: readonly ComparableValue[], clusters: readonly ComparableValue[][]): boolean {
  if (clusters.length === 1) return true;
  const compared = clusters.filter((cluster) => cluster[0].comparison !== undefined);
  if (compared.length > 1 && !distinctNames(compared)) return false;
  const codeCount = (code: string | undefined): number =>
    values.filter((v) => v.biomarker.loincCode === code).length;
  return values.every(
    (v) => v.comparison !== undefined || (!!v.biomarker.loincCode && codeCount(v.biomarker.loincCode) === 1)
  );
}

/** The value of a cluster that is kept: the one in the standard unit, else the first */
export function preferredValue(cluster: readonly ComparableValue[], unit: GroupUnit): ComparableValue {
  const { canonicalUnit } = unit;
  return (
    cluster.find((v) => canonicalUnit !== undefined && unitsMatch(v.biomarker.unit, canonicalUnit)) ?? cluster[0]
  );
}

/**
 * The value kept for a measurement, with the comparator and the lab's mark
 * a twin set aside carries when the kept one has none: "< 44 µmol/L" beside
 * "0,50 mg/dL" is kept as "< 0.5 mg/dL", "7.2 mmol/L H" beside "130 mg/dL"
 * keeps its H
 */
function withTwinMarks(preferred: MatchedBiomarker, cluster: readonly ComparableValue[]): MatchedBiomarker {
  const censored = preferred.censored ?? cluster.find(({ biomarker }) => biomarker.censored)?.biomarker.censored;
  const labFlag = preferred.labFlag ?? cluster.find(({ biomarker }) => biomarker.labFlag)?.biomarker.labFlag;
  if (censored === preferred.censored && labFlag === preferred.labFlag) return preferred;
  return { ...preferred, censored, labFlag };
}

/** One test's values, settled or in conflict */
export type SettledGroup =
  /**
   * Each value kept, or set aside for the value kept in its place; `merged`
   * gives a kept value that took a twin's comparator or mark (see withTwinMarks)
   */
  | {
      settled: true;
      kept: MatchedBiomarker[];
      setAside: Map<MatchedBiomarker, MatchedBiomarker>;
      merged: Map<MatchedBiomarker, MatchedBiomarker>;
    }
  /** The values conflict: the user keeps the right one */
  | { settled: false; values: ComparableValue[]; unit: GroupUnit };

/**
 * Settle one test's values (see groupBySameTest): each measurement kept
 * once, in the standard unit when one of its values is in it, unless the
 * values conflict (see isSettled)
 */
export function settleGroup(group: readonly MatchedBiomarker[], catalog: Catalog): SettledGroup {
  const unit = groupUnit(group, catalog);
  const values = group.map((b) => comparable(b, unit));
  const clusters = clusterMeasurements(values);
  if (!isSettled(values, clusters)) return { settled: false, values, unit };
  const kept: MatchedBiomarker[] = [];
  const setAside = new Map<MatchedBiomarker, MatchedBiomarker>();
  const merged = new Map<MatchedBiomarker, MatchedBiomarker>();
  for (const cluster of clusters) {
    const preferred = preferredValue(cluster, unit).biomarker;
    const keptValue = withTwinMarks(preferred, cluster);
    if (keptValue !== preferred) merged.set(preferred, keptValue);
    kept.push(keptValue);
    for (const { biomarker } of cluster) if (biomarker !== preferred) setAside.set(biomarker, keptValue);
  }
  return { settled: true, kept, setAside, merged };
}
