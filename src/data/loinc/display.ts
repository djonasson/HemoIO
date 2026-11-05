/**
 * How a stored value's test is named and described on screen.
 *
 * A value's test is its LOINC code, or an "unknown:" key for a value saved
 * as not a LOINC test. Codes that trend together (Catalog.trendGroup) are
 * one test on screen: one name, one line, one personal target and one
 * preferred unit, all kept under the group's trend code.
 */
import { unitsMatch } from '@/utils/unitSpelling';
import { TEST_ADDONS, getAddon } from './addons';
import { byRank, isDayUrine, type Catalog, type CatalogTest } from './catalog';

/** What a stored value says about its test */
export interface StoredTest {
  biomarkerKey: string;
  /** The name the report printed */
  rawText?: string;
}

/**
 * The name HemoIO shows: the add-on's short name if it has one, else
 * LOINC's short name, else its long common name. A value that is not a
 * LOINC test shows the name its report printed.
 */
export function testDisplayName(catalog: Catalog, { biomarkerKey, rawText }: StoredTest): string {
  const test = catalog.test(biomarkerKey);
  if (test) return getAddon(catalog, test.code)?.shortName ?? (test.shortName || test.name);
  return rawText?.trim() || 'Unknown test';
}

/** HemoIO's description of a test, when it has one */
export function testDescription(catalog: Catalog, code: string): string | undefined {
  return getAddon(catalog, code)?.description;
}

export interface StandardRange {
  low?: number;
  high?: number;
  unit: string;
}

/**
 * HemoIO's standard adult range for a code. A range the code inherits from
 * another code of its trend group is given only in a unit the code itself
 * is reported in: a range in another unit (mg/dL for glucose in mmol/L) is
 * not one a value of the code can be read against, so its printed range
 * is used instead.
 */
export function standardRange(catalog: Catalog, code: string): StandardRange | undefined {
  const range = getAddon(catalog, code)?.referenceRange;
  if (!range || TEST_ADDONS[code]) return range;
  const units = catalog.test(code)?.units ?? [];
  return units.some((unit) => unitsMatch(unit, range.unit)) ? range : undefined;
}

/**
 * The code a test is shown and kept under: for a code, the member of its
 * trend group that HemoIO has an add-on for, else the group's most common
 * code. A key that is not in the catalog (a value that is not a LOINC
 * test) is its own.
 */
export function trendCode(catalog: Catalog, biomarkerKey: string): string {
  if (!catalog.test(biomarkerKey)) return biomarkerKey;
  const members = catalog
    .groupCodes(catalog.trendGroup(biomarkerKey))
    .map((code) => catalog.test(code))
    .filter((test): test is CatalogTest => test !== undefined);
  const described = members.filter((test) => TEST_ADDONS[test.code]);
  return [...(described.length ? described : members)].sort(byRank)[0]?.code ?? biomarkerKey;
}

/** The units HemoIO shows a code in, with what converting them needs */
export interface TestUnits {
  substance: CatalogTest;
  canonicalUnit: string;
  alternativeUnits: string[];
}

/** undefined for a code HemoIO has no standard unit for */
export function testUnits(catalog: Catalog, code: string): TestUnits | undefined {
  const test = catalog.test(code);
  const addon = getAddon(catalog, code);
  if (!test || !addon?.canonicalUnit) return undefined;
  return {
    substance: test,
    canonicalUnit: addon.canonicalUnit,
    alternativeUnits: addon.alternativeUnits ?? [],
  };
}

/** The units offered for a test's values: HemoIO's standard and other units for it, else LOINC's examples */
export function unitOptions(catalog: Catalog, code: string): string[] {
  const units = testUnits(catalog, code);
  const options = units ? [units.canonicalUnit, ...units.alternativeUnits] : (catalog.test(code)?.units ?? []);
  return [...new Set(options.filter(Boolean))];
}

/** The unit a test's target is given in: its standard unit, else its range's, else the first LOINC gives */
export function targetUnit(catalog: Catalog, code: string): string {
  return (
    testUnits(catalog, code)?.canonicalUnit ??
    standardRange(catalog, code)?.unit ??
    catalog.test(code)?.units[0] ??
    ''
  );
}

/** Readable names of the LOINC systems (samples) */
const SYSTEM_LABELS: Readonly<Record<string, string>> = {
  'Ser/Plas': 'Serum/Plasma',
  Ser: 'Serum',
  Plas: 'Plasma',
  Bld: 'Whole Blood',
  BldC: 'Capillary',
  RBC: 'Red Blood Cells',
  Urine: 'Urine',
  'Urine sed': 'Urine Sediment',
  Semen: 'Semen',
  CSF: 'CSF',
  Saliva: 'Saliva',
  Stool: 'Stool',
};

/** The sample of a test, as its LOINC system and timing give it ("24h Urine") */
export function sampleLabel(test: CatalogTest): string {
  if (isDayUrine(test)) return '24h Urine';
  return SYSTEM_LABELS[test.system] ?? test.system;
}

/**
 * Samples a printed name can end with, as in "Glucose (urine)": the only
 * sample a value that is not a LOINC test has
 */
const PRINTED_SAMPLES: { pattern: RegExp; label: string }[] = [
  { pattern: /\s*\(urine,?\s*24h?\)\s*$/i, label: '24h Urine' },
  { pattern: /\s*\(24h?\s*urine\)\s*$/i, label: '24h Urine' },
  { pattern: /\s*\(urine[^)]*\)\s*$/i, label: 'Urine' },
  { pattern: /\s*\(plasma[^)]*\)\s*$/i, label: 'Plasma' },
  { pattern: /\s*\(serum[^)]*\)\s*$/i, label: 'Serum' },
  { pattern: /\s*\(siero[^)]*\)\s*$/i, label: 'Serum' }, // Italian for serum
  { pattern: /\s*\(sangue[^)]*\)\s*$/i, label: 'Whole Blood' }, // Italian for blood
  { pattern: /\s*\(whole[- ]?blood[^)]*\)\s*$/i, label: 'Whole Blood' },
  { pattern: /\s*\(semen[^)]*\)\s*$/i, label: 'Semen' },
  { pattern: /\s*\(liquido seminale[^)]*\)\s*$/i, label: 'Semen' }, // Italian
  { pattern: /\s*\(csf[^)]*\)\s*$/i, label: 'CSF' },
  { pattern: /\s*\(liquor[^)]*\)\s*$/i, label: 'CSF' }, // Alternative name
  { pattern: /\s*\(saliva[^)]*\)\s*$/i, label: 'Saliva' },
  { pattern: /\s*\(stool[^)]*\)\s*$/i, label: 'Stool' },
  { pattern: /\s*\(feci[^)]*\)\s*$/i, label: 'Stool' }, // Italian for stool
];

/** A printed name without the sample it ends with, and that sample */
export function splitPrintedSample(name: string): { name: string; sample?: string } {
  for (const { pattern, label } of PRINTED_SAMPLES) {
    if (pattern.test(name)) return { name: name.replace(pattern, '').trim(), sample: label };
  }
  return { name };
}

/** A code as the LOINC license asks it be shown: with LOINC's long name for it */
export function loincTestLabel(test: CatalogTest): string {
  return `LOINC ${test.code}: ${test.name}`;
}
