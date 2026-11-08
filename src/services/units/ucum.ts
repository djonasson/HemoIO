/**
 * Units as UCUM: the spelling lab reports use turned into UCUM syntax, what a
 * UCUM unit measures, and conversion between UCUM units: of one dimension,
 * or of mass and moles with a substance's molar mass. The UCUM library is the one place that decides what a unit means.
 */
import { UcumLhcUtils } from '@lhncbc/ucum-lhc';
import type { UcumUnit } from '@lhncbc/ucum-lhc';
import { normalizeUnitForLookup } from '@utils/unitSpelling';

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/**
 * A word a report counts per volume or per field ("RBC/HPF", "Ery/µL",
 * "eritrociti per campo"), written as a UCUM annotation: it names what is
 * counted and is not a unit. A word UCUM reads as a unit, in any case
 * ("MMOL"), is left as it is.
 */
function countedWord(word: string): string {
  return readUnit(word) || readUnit(word.toLowerCase()) ? word : `{${word}}`;
}

/** Spellings that need their own rule to reach UCUM, in the order they apply */
const UCUM_REWRITES: ReadonlyArray<[RegExp, string | ((...groups: string[]) => string)]> = [
  [/^\/100 WBC$/, '/100{WBCs}'],
  // Spaces about a slash: "ug/ L"
  [/\s*\/\s*/g, '/'],
  // A share with words for what it is of: "% Hb totale", "% in volume"
  [/^% \D.*$/, '%'],
  // The mole as "M" after a prefix ("uM/L", "nM/24 h") and in the Italian plural ("umoli/L")
  [/(^|\/)([pnuµm])M(?=\/)/, '$1$2mol'],
  [/(^|\/)([pnuµm]?)moli(?=\/|$)/, '$1$2mol'],
  // Grams written "gr" in Italian ("gr/L", "g/gr"): UCUM's grain is "[gr]"
  [/(^|\/|[mµun])gr(?=\/|$)/g, '$1g'],
  // "x10³/µL", "10^9/L", "×10^6/µL": a power of ten that counts
  [/^[x×]?10(?:\^(\d+)|([⁰¹²³⁴⁵⁶⁷⁸⁹]+))/, (_all, power = '', superscript = '') =>
    `10*${power || [...superscript].map((c) => SUPERSCRIPT_DIGITS.indexOf(c)).join('')}`],
  [/^K\//, '10*3/'],
  [/^M\//, '10*6/'],
  [/^(?:million|mil\.?)(?=\/|$)/i, '10*6'],
  [/^thousand(?=\/|$)/i, '10*3'],
  [/^cells?\//i, '{cells}/'],
  // "mc" for micro: "mcg", "mcL" ("K/mcL")
  [/\bmc(?=g\b|[lL]\b)/g, 'u'],
  [/\bmEq\b/, 'meq'],
  // International units are an arbitrary unit in brackets, with a prefix outside
  [/(^|\/)([kmµun]?)IU\b/, (_all, start, prefix) => `${start}${prefix}[IU]`],
  // The Italian spelling: "mUI/mL"
  [/(^|\/)([kmµun]?)UI\b/, (_all, start, prefix) => `${start}${prefix}[IU]`],
  // Per mille: parts per thousand
  [/‰/, '[ppth]'],
  [/^ratio$/i, '1'],
  [/\/hpf$/i, '/[HPF]'],
  // The Italian "per field", of a microscope's high-power field, maybe after what it counts
  [/^(?:([A-Za-z]{3,}) )?per campo$/i, (_all, word?: string) => `${word ? countedWord(word) : ''}/[HPF]`],
  // What is counted, named before the slash: "RBC/HPF", "Ery/µL"
  [/^([A-Z][A-Za-z]{2,})(?=\/)/, (word) => countedWord(word)],
  // A time: per 24 hours ("mg/24h", "mg/24 ore"), per hour ("mm/h", "mm/1h", "mm/hr"), per day
  [/\/24 ?(?:h|hr|hrs|hours?|ore)$/i, '/(24.h)'],
  [/\/(?:1 ?)?(?:h|hr|hrs|hours?|ora)$/i, '/h'],
  [/\/(?:day|die|giorno)$/i, '/d'],
  [/^(?:minutes?|minuti|min\.)$/i, 'min'],
  [/^(?:hours?|ore)$/i, 'h'],
  [/^(?:days?|giorni)$/i, 'd'],
  // Per body surface, with a decimal comma or a written power: "/1,73m2", "/1.73 m^2"
  [/\/1[.,]73 ?m(?:²|\^?2)$/i, '/(1.73.m2)'],
  // A length to a power, as a superscript: "µm³", "/mm³"
  [/([A-Za-zµ])([²³])/g, (_all, letter, power) => `${letter}${power === '²' ? 2 : 3}`],
  [/µ/g, 'u'],
  // UCUM writes the litre "L" ("fl" and "ml/min" are fL and mL/min)
  [/(^|[^A-Za-z])([a-zµ]?)l(?![A-Za-z])/g, '$1$2L'],
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
  const unit = rewritten(normalizeUnitForLookup(printed));
  if (readUnit(unit)) return unit;
  // A unit printed in capitals ("FL", "MG/DL"): UCUM is case-sensitive
  const lower = rewritten(normalizeUnitForLookup(printed.toLowerCase()));
  return lower !== unit && readUnit(lower) ? lower : null;
}

/** The units a D-dimer is given in: fibrinogen equivalent units or D-dimer units, about two-fold apart */
export type DimerMarker = 'FEU' | 'DDU';

const DIMER_MARKER = /\b(FEU|DDU)\b/i;

/** The D-dimer units a text names, a printed unit or a LOINC component or method ("Fibrin D-dimer FEU") */
export function dimerMarkerIn(text: string): DimerMarker | undefined {
  return text.match(DIMER_MARKER)?.[1].toUpperCase() as DimerMarker | undefined;
}

/**
 * A printed unit as its plain unit and the D-dimer units it names, however
 * the report sets them off: "ng/mL (FEU)", "ng/mL [FEU]", "mg/L FEU.",
 * "ng/mL - FEU" and "µg/L{FEU}" are all ng/mL or mg/L or µg/L in FEU
 */
export function readUnitMarker(printed: string): { unit: string; marker?: DimerMarker } {
  const marker = dimerMarkerIn(printed);
  if (!marker) return { unit: printed.trim() };
  const unit = printed
    .replace(/[([{]\s*(?:FEU|DDU)\s*[)\]}]/gi, ' ')
    .replace(/\b(?:FEU|DDU)\b/gi, ' ')
    .replace(/^[\s\-.,;:]+|[\s\-.,;:]+$/g, '')
    .replace(/\s+/g, ' ');
  return { unit, marker };
}

function rewritten(unit: string): string {
  return UCUM_REWRITES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement as string), unit);
}

/** Whether a unit is a share of something: "%", per mille or a count per 100 */
function isShare(ucum: string): boolean {
  return ucum === '%' || ucum === '[ppth]' || ucum.startsWith('/100');
}

/** UCUM's enzyme unit, with or without a prefix: "U/L", "mU/mL", "kU/L" */
const CATALYTIC_U = /(?<![A-Za-z[])[a-zµ]?U(?![A-Za-z\]])/;

/** Whether a UCUM unit is of the enzyme unit: "U/L", "mU/mL", "U/g{Hb}", not "[IU]/L" */
export function isCatalyticUnit(unit: string): boolean {
  return CATALYTIC_U.test(unit);
}

/**
 * A quantity of one cell (an "entitic" property: MCV, MCH, MCHC) is
 * printed in the units a cell's size is: fL, pg and g/dL or g/L. Read in
 * other units, it would only add the per-cell tests as rivals.
 */
const PER_CELL_UNITS: ReadonlySet<string> = new Set(['g/dL', 'g/L', 'pg', 'fL']);

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
  const perCell = (...properties: string[]): string[] => (PER_CELL_UNITS.has(ucum) ? properties : []);

  if (ucum.includes('[HPF]')) return ['Naric', 'NCnc'];
  if (isShare(ucum)) return ['NFr', 'MFr', 'VFr', 'SFr', 'Ratio', 'DistWidth'];
  if (unit.isArbitrary_ || /^\{[^}]*\}$/.test(ucum)) {
    // So many per volume is a concentration, never a ratio or a titer (a
    // dilution, of no unit). Labs print enzyme activity in international
    // units too ("ALT 30 UI/L"): so many per volume may be catalytic as well
    // as arbitrary (a hormone).
    if (length === -3 && time === 0 && mass === 0) return ucum.includes('[IU]') ? ['ACnc', 'CCnc'] : ['ACnc'];
    // So many per time: a day's amount ("UI/24 h"), of an enzyme too
    if (length === 0 && time === -1 && mass === 0) return ucum.includes('[IU]') ? ['ARat', 'CRat'] : ['ARat'];
    return ['ACnc', 'Ratio', 'Titr'];
  }
  if (ucum === '1') return ['SpGrav', 'Ratio', 'pH'];

  if (length === -3 && time === 0) {
    // A mass per volume, or that in the cells (MCHC in g/dL)
    if (mass === 1 && !amount) return ['MCnc', ...perCell('EntMCnc')];
    if (mass === 0 && amount) return ['SCnc'];
    if (mass === 0) return ['NCnc'];
  }
  // Labs print arbitrary units as "U/mL" too (antibodies), UCUM's U is catalytic
  if (length === -3 && time === -1 && mass === 0 && amount) return CATALYTIC_U.test(ucum) ? ['CCnc', 'ACnc'] : ['CCnc'];
  if (length === 0 && time === -1) {
    if (mass === 1 && !amount) return ['MRat'];
    if (mass === 0 && amount) return ['SRat'];
  }
  // An enzyme's activity over a time: a day's ("U/24 h")
  if (length === 0 && time === -2 && mass === 0 && amount && CATALYTIC_U.test(ucum)) return ['CRat'];
  // A volume, or that of one cell (MCV in fL)
  if (length === 3 && time === 0 && mass === 0 && !amount) return ['Vol', ...perCell('EntMeanVol', 'EntVol')];
  // A duration (liquefaction in minutes)
  if (length === 0 && time === 1 && mass === 0 && !amount) return ['Time'];
  if (length === 1 && time === -1 && mass === 0 && !amount) {
    // Volume per time per body surface (a filtration rate), else a speed (sedimentation)
    return /m2\b/.test(ucum) ? ['ArVRat'] : ['Vel', 'Sedimentation Rate'];
  }
  if (length === 0 && time === 0) {
    // A mass, or that of one cell (MCH in pg)
    if (mass === 1 && !amount) return ['Mass', ...perCell('EntMass')];
    // A mass per mass of something (mg/g creatinine)
    if (mass === 0 && !amount && /g/.test(ucum)) return ['MRto', 'Ratio'];
    // An amount per amount (HbA1c in mmol/mol)
    if (mass === 0 && /mol.*\/.*mol/.test(ucum)) return ['SFr', 'SRto', 'Ratio'];
    // A mass per amount of something (mg/mmol creatinine)
    if (mass === 1 && amount) return ['Ratio'];
  }
  return [];
}

/**
 * What converting a substance's units needs beyond UCUM: its molar mass, for
 * a mass to an amount (glucose mg/dL to mmol/L), and its ion's charge, for
 * an amount to equivalents (magnesium mmol/L to mEq/L)
 */
export interface Chemistry {
  /** g/mol */
  molarMass?: number;
  charge?: number;
}

/** A conversion between two units: converted = value × factor + offset */
export interface LinearConversion {
  factor: number;
  offset: number;
}

/**
 * A value in another UCUM unit (mg/dL to g/L, or with the substance's molar
 * mass mg/dL to mmol/L), or null when the units do not convert or UCUM does
 * not read them
 */
export function convertUcum(value: number, from: string, to: string, chemistry: Chemistry = {}): number | null {
  if (!Number.isFinite(value) || !readUnit(from) || !readUnit(to)) return null;
  const options = { molecularWeight: chemistry.molarMass ?? null, charge: chemistry.charge ?? null };
  const result = quietly(() => utils.convertUnitTo(from, value, to, options));
  if (result.status !== 'succeeded' || result.toVal === null) return null;
  // The library multiplies by factors such as 1e-3, which leaves 4.999999999999999
  return Number(result.toVal.toPrecision(12));
}

/** The linear conversion between two UCUM codes, from the values of 0 and 1 */
function linear(from: string, to: string, chemistry?: Chemistry): LinearConversion | undefined {
  const zero = convertUcum(0, from, to, chemistry);
  const one = convertUcum(1, from, to, chemistry);
  if (zero === null || one === null) return undefined;
  return { factor: Number((one - zero).toPrecision(12)), offset: zero };
}

const ARBITRARY_ATOM = /\[[^\]]+\]/g;

/**
 * One arbitrary unit with another prefix or per another volume: m[IU]/mL is
 * [IU]/L. UCUM converts no arbitrary unit, but the same one on both sides
 * rescales as any unit would: here as the kelvin, which neither code holds.
 */
function arbitraryRescale(from: string, to: string): LinearConversion | undefined {
  const atoms = (code: string): string => (code.match(ARBITRARY_ATOM) ?? []).join();
  if (!atoms(from) || atoms(from) !== atoms(to) || /K/.test(from + to)) return undefined;
  return linear(from.replace(ARBITRARY_ATOM, 'K'), to.replace(ARBITRARY_ATOM, 'K'));
}

/** A count that is a power of ten alone: "10*6" (a total sperm count in millions) */
const POWER_OF_TEN = /^10\*-?\d+$/;

/**
 * The conversion UCUM gives between two units as a report prints them: a
 * unit to itself however spelled, units of one dimension (g/dL to g/L,
 * cells/µL to 10^9/L, mIU/mL to IU/L), and with the substance's chemistry
 * a mass to an amount or an amount to equivalents. None for a unit of no
 * dimension (a share, a ratio: what it is a share of decides) and none
 * between different arbitrary units.
 */
export function ucumConversion(
  fromPrinted: string,
  toPrinted: string,
  chemistry: Chemistry = {}
): LinearConversion | undefined {
  const from = toUcum(fromPrinted);
  const to = toUcum(toPrinted);
  if (!from || !to) return undefined;
  // An annotation only names what is counted ("{RBC}/[HPF]" is "/[HPF]"),
  // except what a share is of ("/100{WBCs}")
  const unannotated = (code: string): string => code.replace(/\{[^}]*\}/g, '');
  if (from === to || (!isShare(from) && unannotated(from) === unannotated(to))) return { factor: 1, offset: 0 };
  const fromUnit = readUnit(from);
  const toUnit = readUnit(to);
  if (!fromUnit?.dim_ || !toUnit?.dim_) return undefined;
  if (fromUnit.isArbitrary_ || toUnit.isArbitrary_) return arbitraryRescale(from, to);
  const counts = POWER_OF_TEN.test(from) && POWER_OF_TEN.test(to);
  const dimensionless = (unit: UcumUnit): boolean => unit.dim_!.dimVec_.every((exponent) => exponent === 0);
  if (!counts && dimensionless(fromUnit) && dimensionless(toUnit)) return undefined;
  // UCUM reads a mole as a count: never take moles for cells, nor for a mass
  // unless the substance's chemistry says how (UCUM then checks the rest)
  const sameAmount =
    fromUnit.moleExp_ === toUnit.moleExp_ && fromUnit.equivalentExp_ === toUnit.equivalentExp_;
  if (!sameAmount && chemistry.molarMass === undefined && chemistry.charge === undefined) return undefined;
  return linear(from, to, chemistry);
}
