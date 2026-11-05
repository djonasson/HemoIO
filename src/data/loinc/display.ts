/**
 * How a stored value's test is named and described on screen.
 *
 * A value's test is its LOINC code, or an "unknown:" key for a value saved
 * as not a LOINC test. Codes that trend together (Catalog.trendGroup) are
 * one test on screen: one name, one line, one personal target and one
 * preferred unit. What the user keeps for the test is kept under its test
 * key (testKey), and it is shown under its trend code (trendCode).
 */
import { unitsMatch } from '@/utils/unitSpelling';
import { TEST_ADDONS, type TestAddon } from './addons';
import { byRank, isDayUrine, type Catalog, type CatalogTest } from './catalog';

/** What a stored value says about its test */
export interface StoredTest {
  biomarkerKey: string;
  /** The name the report printed */
  rawText?: string;
}

/**
 * How long a test's sample was collected over, as its long name says ("12
 * hour Urine", "Urine collected for unspecified duration"); empty for a
 * sample taken at one time
 */
function collectionTime(test: CatalogTest): string {
  if (isDayUrine(test)) return '24h';
  const said = /\b(\d+) ?(?:hour|hr|h)\b|\bunspecified duration\b/i.exec(test.name);
  return said ? (said[1] ? `${said[1]}h` : 'unspecified') : '';
}

/**
 * HemoIO's add-on for a code: its own, else that of a code it trends with
 * whose sample is collected over the same time. A 24-hour urine test's name,
 * description and units are not those of a 2-hour or 12-hour collection.
 */
export function testAddon(catalog: Catalog, code: string): TestAddon | undefined {
  const own = TEST_ADDONS[code];
  if (own) return own;
  const test = catalog.test(code);
  if (!test) return undefined;
  const time = collectionTime(test);
  const lender = catalog
    .groupCodes(catalog.trendGroup(code))
    .map((member) => catalog.test(member))
    .find((member) => member && TEST_ADDONS[member.code] && collectionTime(member) === time);
  return lender && TEST_ADDONS[lender.code];
}

/**
 * The name HemoIO shows: the add-on's short name if it has one, else
 * LOINC's short name, else its long common name. A value that is not a
 * LOINC test shows the name its report printed.
 */
export function testDisplayName(catalog: Catalog, { biomarkerKey, rawText }: StoredTest): string {
  const test = catalog.test(biomarkerKey);
  if (test) return testAddon(catalog, test.code)?.shortName ?? (test.shortName || test.name);
  return rawText?.trim() || 'Unknown test';
}

/**
 * The name of a test as a whole, for a value's key or a test key: the name
 * of the code it is shown under. Where that is LOINC's short name and the
 * test's codes are of mass and of moles alike, the short name loses the
 * property it ends with: "Glucose Bld-mCnc" names glucose in mg/dL only,
 * the test of both is "Glucose Bld".
 */
export function testName(catalog: Catalog, key: string, rawText?: string): string {
  const code = trendCode(catalog, key);
  const name = testDisplayName(catalog, { biomarkerKey: code, rawText });
  const test = catalog.test(code);
  if (!test || name !== test.shortName) return name;
  const properties = new Set(
    catalog.groupCodes(catalog.trendGroup(code)).map((member) => catalog.test(member)?.property)
  );
  return properties.size > 1 ? name.replace(/-[ms][A-Z][A-Za-z]*$/, '') : name;
}

/** HemoIO's description of a test, when it has one */
export function testDescription(catalog: Catalog, code: string): string | undefined {
  return testAddon(catalog, code)?.description;
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
  const range = testAddon(catalog, code)?.referenceRange;
  if (!range || TEST_ADDONS[code]) return range;
  const units = catalog.test(code)?.units ?? [];
  return units.some((unit) => unitsMatch(unit, range.unit)) ? range : undefined;
}

/**
 * The key what the user keeps for a test is kept under: its preferred unit,
 * personal target and acknowledged alerts. It is the test's trend group,
 * which LOINC's groups give, so it stays when HemoIO's add-ons or LOINC's
 * ranks change which code the test is shown under. A key that is not in the
 * catalog (a value that is not a LOINC test) is its own.
 */
export function testKey(catalog: Catalog, biomarkerKey: string): string {
  return catalog.trendGroup(biomarkerKey);
}

/** A blood test of one site (arterial, venous, capillary, cord blood), not of blood in general */
function isSiteOfBlood(test: CatalogTest): boolean {
  return /^Bld./.test(test.system);
}

/**
 * The code a test is shown under, for a value's key or a test key: the
 * member of its trend group that HemoIO has an add-on for, else the group's
 * most common code. A code of blood in general comes before one of an
 * arterial or venous sample, so a line of both is not named after one of
 * them. A key that is not in the catalog (a value that is not a LOINC test)
 * is its own.
 */
export function trendCode(catalog: Catalog, key: string): string {
  const members = catalog
    .groupCodes(catalog.trendGroup(key))
    .map((code) => catalog.test(code))
    .filter((test): test is CatalogTest => test !== undefined);
  const described = members.filter((test) => TEST_ADDONS[test.code]);
  const likeliest = described.length ? described : members;
  const general = likeliest.filter((test) => !isSiteOfBlood(test));
  return [...(general.length ? general : likeliest)].sort(byRank)[0]?.code ?? key;
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
  const addon = testAddon(catalog, code);
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

/** A LOINC system's readable name ("Ser/Plas" is "Serum/Plasma") */
export function systemLabel(system: string): string {
  return SYSTEM_LABELS[system] ?? system;
}

/** The sample of a test, as its LOINC system and timing give it ("24h Urine") */
export function sampleLabel(test: CatalogTest): string {
  if (isDayUrine(test)) return '24h Urine';
  return systemLabel(test.system);
}

/** A code as the LOINC license asks it be shown: with LOINC's long name for it */
export function loincTestLabel(test: CatalogTest): string {
  return `LOINC ${test.code}: ${test.name}`;
}
