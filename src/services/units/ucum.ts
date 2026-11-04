/**
 * Units as UCUM: the spelling lab reports use turned into UCUM syntax, what a
 * UCUM unit measures, and conversion between UCUM units of one dimension.
 * The UCUM library is the one place that decides what a unit means.
 */
import { UcumLhcUtils } from '@lhncbc/ucum-lhc';
import type { UcumUnit } from '@lhncbc/ucum-lhc';
import { normalizeUnitForLookup } from '@utils/unitSpelling';

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Spellings that need their own rule to reach UCUM, in the order they apply */
const UCUM_REWRITES: ReadonlyArray<[RegExp, string | ((...groups: string[]) => string)]> = [
  [/^\/100 WBC$/, '/100{WBCs}'],
  // "x10³/µL", "10^9/L", "×10^6/µL": a power of ten that counts
  [/^[x×]?10(?:\^(\d+)|([⁰¹²³⁴⁵⁶⁷⁸⁹]+))/, (_all, power = '', superscript = '') =>
    `10*${power || [...superscript].map((c) => SUPERSCRIPT_DIGITS.indexOf(c)).join('')}`],
  [/^K\//, '10*3/'],
  [/^M\//, '10*6/'],
  [/^cells?\//i, '{cells}/'],
  [/\bmcg\b/, 'ug'],
  [/\bmEq\b/, 'meq'],
  // International units are an arbitrary unit in brackets, with a prefix outside
  [/(^|\/)([mµ]?)IU\b/, (_all, start, prefix) => `${start}${prefix}[IU]`],
  [/\/hpf$/i, '/[HPF]'],
  [/\/24 ?h$/i, '/(24.h)'],
  [/\/1\.73 ?m[²2]$/, '/(1.73.m2)'],
  [/µ/g, 'u'],
];

const utils = UcumLhcUtils.getInstance();

/**
 * Runs a UCUM library call without its console.log, which prints the unit
 * text of every string it rejects
 */
function quietly<T>(call: () => T): T {
  const log = console.log;
  console.log = () => undefined;
  try {
    return call();
  } finally {
    console.log = log;
  }
}

/** The unit as UCUM reads it, or null when UCUM does not accept it */
function readUnit(ucum: string): UcumUnit | null {
  if (!ucum.trim()) return null;
  const parsed = quietly(() => utils.getSpecifiedUnit(ucum, 'validate'));
  return parsed.status === 'valid' && parsed.unit ? parsed.unit : null;
}

/**
 * The UCUM code for a unit as a report prints it ("x10³/µL" is "10*3/uL"),
 * or null when it is not a unit UCUM accepts
 */
export function toUcum(printed: string): string | null {
  let unit = normalizeUnitForLookup(printed);
  for (const [pattern, replacement] of UCUM_REWRITES) {
    unit = unit.replace(pattern, replacement as string);
  }
  return readUnit(unit) ? unit : null;
}

/** Whether a unit is a share of something: "%" or a count per 100 */
function isShare(ucum: string): boolean {
  return ucum === '%' || ucum.startsWith('/100');
}

/** Whether a unit counts an amount of substance (moles or equivalents) */
function isAmount(unit: UcumUnit): boolean {
  return unit.moleExp_ !== 0 || unit.equivalentExp_ !== 0;
}

/**
 * The LOINC properties a unit implies, decided from what it measures: mass
 * per volume is a mass concentration, amount per volume a substance
 * concentration, and so on. Empty when the unit says nothing certain.
 */
export function ucumProperties(ucum: string): string[] {
  const unit = readUnit(ucum);
  if (!unit?.dim_) return [];
  const [length, time, mass] = unit.dim_.dimVec_;
  const amount = isAmount(unit);

  if (ucum.includes('[HPF]')) return ['Naric', 'NCnc'];
  if (isShare(ucum)) return ['NFr', 'MFr', 'VFr', 'SFr', 'Ratio'];
  if (unit.isArbitrary_ || /^\{[^}]*\}$/.test(ucum)) return ['ACnc', 'Ratio', 'Titr'];
  if (ucum === '1') return ['SpGrav', 'Ratio', 'pH'];

  if (length === -3 && time === 0) {
    if (mass === 1 && !amount) return ['MCnc'];
    if (mass === 0 && amount) return ['SCnc'];
    if (mass === 0) return ['NCnc'];
  }
  if (length === -3 && time === -1 && mass === 0 && amount) return ['CCnc'];
  if (length === 0 && time === -1) {
    if (mass === 1 && !amount) return ['MRat'];
    if (mass === 0 && amount) return ['SRat'];
  }
  return [];
}

/**
 * A value in another UCUM unit of the same dimension (mg/dL to g/L), or null
 * when the units differ in dimension or UCUM does not read them. Mass to
 * moles needs a molar mass and is not done here.
 */
export function convertUcum(value: number, from: string, to: string): number | null {
  if (!Number.isFinite(value) || !readUnit(from) || !readUnit(to)) return null;
  const result = quietly(() => utils.convertUnitTo(from, value, to));
  if (result.status !== 'succeeded' || result.toVal === null) return null;
  // The library multiplies by factors such as 1e-3, which leaves 4.999999999999999
  return Number(result.toVal.toPrecision(12));
}

/**
 * Whether one unit is a mass concentration and the other an amount
 * concentration. A rate (per volume per time) is not a concentration.
 */
export function isMassAndMolar(a: string, b: string): boolean {
  const first = readUnit(a);
  const second = readUnit(b);
  if (!first?.dim_ || !second?.dim_) return false;
  const perVolume = (unit: UcumUnit, mass: number): boolean => {
    const [length, time, unitMass] = unit.dim_?.dimVec_ ?? [];
    return length === -3 && time === 0 && unitMass === mass;
  };
  const massConcentration = (unit: UcumUnit): boolean => !isAmount(unit) && perVolume(unit, 1);
  const amountConcentration = (unit: UcumUnit): boolean => isAmount(unit) && perVolume(unit, 0);
  return (
    (massConcentration(first) && amountConcentration(second)) ||
    (amountConcentration(first) && massConcentration(second))
  );
}
