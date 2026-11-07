/**
 * What an import saves from the reviewed files: the rules the review step
 * checks against and the wizard saves by
 */

import { isPerHundredCounted } from '@/utils/unitSpelling';
import { getAddon } from '@data/loinc/addons';
import { nameKey } from '@data/loinc/keys';
import { unitsMatch } from '@services/units';
import { toUcum, ucumProperties } from '@services/units/ucum';
import { needsTest } from './identification';
import { groupBySameTest, settleGroup } from './sameMeasurement';
import { quantityKind, type Catalog } from '@data/loinc/catalog';
import type { MatchedBiomarker } from './LabReportAnalyzer';

/** A reviewed file: its name and its values as edited */
export interface ReviewedFile {
  fileName: string;
  editedBiomarkers: MatchedBiomarker[];
}

/**
 * Why a value is left out: a twin in a unit that cannot be read next to a
 * value of its name with a code, or a duplicate, the same measurement as
 * another value of its test that is saved
 */
export type SetAsideReason = 'twin' | 'duplicate';

/** A value an import leaves out, and the file it came from */
export interface SetAsideValue {
  fileName: string;
  biomarker: MatchedBiomarker;
  reason: SetAsideReason;
  /** For a duplicate: the value saved in its place */
  savedAs?: MatchedBiomarker;
}

/** The files an import saves and the values it leaves out */
export interface SavePlan<T extends ReviewedFile> {
  toSave: T[];
  notSaved: SetAsideValue[];
}

/** What a value lacks to be saved */
export type MissingField = 'name' | 'value' | 'unit';

/** Standard units of tests whose results have no unit: pH, specific gravity */
const NO_UNIT = new Set(['', '1', '[pH]']);

/** A unit with no dimension: UCUM's unity or an annotation alone ("{ratio}") */
const isUnitless = (ucum: string): boolean => NO_UNIT.has(ucum) || /^\{[^}]*\}$/.test(ucum);

/**
 * Whether a LOINC test's results come with no unit: an ordinal, a pH, a
 * specific gravity, a ratio LOINC gives no dimension
 */
function hasNoUnit(catalog: Catalog, code: string): boolean {
  const test = catalog.test(code);
  if (!test) return false;
  const canonical = getAddon(catalog, code)?.canonicalUnit;
  if (test.scale !== 'Qn' || test.property === 'SpGrav') return true;
  if (canonical !== undefined) return NO_UNIT.has(canonical);
  return test.units.length > 0 && test.units.every(isUnitless);
}

/**
 * What a value lacks to be saved: a name, a number, or a unit. A value the
 * report gave no unit may have none while it has no test (a screening
 * result saved as "Not a LOINC test"), and so may one of a test whose
 * results have none. A value of a test measured in a unit needs one, even
 * when the report printed none: saved without, it could not be converted
 * nor drawn beside the test's other values.
 */
export function missingFields(biomarker: MatchedBiomarker, catalog?: Catalog): MissingField[] {
  const missing: MissingField[] = [];
  if (!biomarker.name) missing.push('name');
  if (!Number.isFinite(biomarker.value)) missing.push('value');
  const reportGaveUnit = !biomarker.analyzed || biomarker.analyzed.unit.trim() !== '';
  const testHasUnit = !(catalog && biomarker.loincCode && hasNoUnit(catalog, biomarker.loincCode));
  const needsUnit = testHasUnit && (reportGaveUnit || (!!catalog && !!biomarker.loincCode));
  if (!biomarker.unit.trim() && needsUnit) missing.push('unit');
  return missing;
}

/** Whether a value's unit fits its test, surely does not, or tells nothing certain */
export type UnitFit = 'fits' | 'misfits' | 'unknown';

/**
 * How a value's unit fits its test. A unit the test is offered in
 * (HemoIO's own units for it, LOINC's examples) fits, whatever UCUM reads
 * it as ("UI/L" for an enzyme, "%" for MCHC); else a unit fits when UCUM
 * reads it as the test's kind of quantity, and misfits when it surely is
 * not (a U/L value as a mass concentration, a daily amount as a
 * concentration). A unit UCUM cannot read, or that tells nothing certain,
 * is not judged.
 */
export function unitFit(biomarker: MatchedBiomarker, catalog: Catalog): UnitFit {
  const test = biomarker.loincCode ? catalog.test(biomarker.loincCode) : undefined;
  const ucum = biomarker.unit.trim() ? toUcum(biomarker.unit) : null;
  if (!test || !ucum) return 'unknown';
  const addon = getAddon(catalog, test.code);
  const offered = [...(addon?.canonicalUnit ? [addon.canonicalUnit] : []), ...(addon?.alternativeUnits ?? [])];
  const fitsOffered = offered.some((unit) => unitsMatch(unit, biomarker.unit) || toUcum(unit) === ucum);
  if (fitsOffered || test.units.includes(ucum)) return 'fits';
  const kinds = ucumProperties(ucum).map(quantityKind);
  if (kinds.length === 0) return 'unknown';
  return kinds.includes(quantityKind(test.property)) ? 'fits' : 'misfits';
}

/** Whether a value's unit is surely not one of its test's kind (see unitFit) */
export function unitMisfits(biomarker: MatchedBiomarker, catalog: Catalog): boolean {
  return unitFit(biomarker, catalog) === 'misfits';
}

/** Whether a value has its test or "Not a LOINC test", and nothing missing */
function isReady(biomarker: MatchedBiomarker, catalog: Catalog): boolean {
  return missingFields(biomarker, catalog).length === 0 && !needsTest(biomarker);
}

/**
 * Whether a value is a twin the import may leave out on its own: one with
 * no test, unchanged by the user, given as a share of 100 of something UCUM
 * cannot read ("/100 HPF"). Any other unit may be another measurement (a
 * 24-hour amount next to a concentration), and a value the user chose a
 * test for, or typed, is theirs: they still ask for a test.
 */
function mayLeaveOut(biomarker: MatchedBiomarker): boolean {
  const { analyzed } = biomarker;
  return (
    !!analyzed &&
    biomarker.identifiedBy !== 'user' &&
    needsTest(biomarker) &&
    nameKey(biomarker.name) === nameKey(analyzed.name) &&
    biomarker.unit === analyzed.unit &&
    isPerHundredCounted(biomarker.unit) &&
    toUcum(biomarker.unit) === null
  );
}

/**
 * Whether a twin (see mayLeaveOut) is the same test as a value saved with a
 * code: the same printed name, no other sample said, and that code among
 * the twin's candidates when it has any. A urine sediment count printed
 * under the name of a blood count is not the blood count's twin.
 */
function isTwinOf(twin: MatchedBiomarker, coded: MatchedBiomarker): boolean {
  return (
    nameKey(twin.name) === nameKey(coded.name) &&
    (!twin.specimenHint || !coded.specimenHint || twin.specimenHint === coded.specimenHint) &&
    (twin.candidates.length === 0 || twin.candidates.some((candidate) => candidate.code === coded.loincCode))
  );
}

/**
 * The values of a file the import leaves out: twins (see mayLeaveOut) of a
 * value of the same test saved with a code (see isTwinOf). A report that
 * gives one test in two forms keeps the one it can read, and the user need
 * not remove the other by hand.
 */
function twins(values: readonly MatchedBiomarker[], catalog: Catalog): MatchedBiomarker[] {
  const candidates = values.filter(mayLeaveOut);
  if (candidates.length === 0) return [];
  const coded = values.filter((value) => value.loincCode && isReady(value, catalog));
  return candidates.filter((twin) => coded.some((value) => isTwinOf(twin, value)));
}

/**
 * The values of a file that are the same measurement as another value of
 * their test, each with the one saved in its place (in the standard unit,
 * else the first): a value the analyzer could not merge, as it had no test
 * then, is merged once the user gives it one. Values the analyzer would
 * call a conflict (see isSettled) are all kept, for the user to settle.
 */
function duplicates(
  values: readonly MatchedBiomarker[],
  catalog: Catalog
): Map<MatchedBiomarker, MatchedBiomarker> {
  const left = new Map<MatchedBiomarker, MatchedBiomarker>();
  const coded = values.filter((value) => value.loincCode && isReady(value, catalog));
  for (const group of groupBySameTest(coded, catalog)) {
    if (group.length === 1) continue;
    const settled = settleGroup(group, catalog);
    if (settled.settled) for (const [biomarker, kept] of settled.setAside) left.set(biomarker, kept);
  }
  return left;
}

/** The values of a file the import leaves out, and why */
function setAside(
  values: readonly MatchedBiomarker[],
  catalog: Catalog
): Map<MatchedBiomarker, Omit<SetAsideValue, 'fileName'>> {
  const left = new Map<MatchedBiomarker, Omit<SetAsideValue, 'fileName'>>();
  for (const biomarker of twins(values, catalog)) left.set(biomarker, { biomarker, reason: 'twin' });
  for (const [biomarker, savedAs] of duplicates(values, catalog)) {
    left.set(biomarker, { biomarker, reason: 'duplicate', savedAs });
  }
  return left;
}

/**
 * The files an import saves, without the values it leaves out, and those
 * values. A file left without values (a failed file the user did not fill
 * in) is not saved, but stays in the review so going back keeps its edits.
 */
export function planSave<T extends ReviewedFile>(results: readonly T[], catalog: Catalog): SavePlan<T> {
  const toSave: T[] = [];
  const notSaved: SetAsideValue[] = [];
  for (const result of results) {
    const left = setAside(result.editedBiomarkers, catalog);
    for (const value of left.values()) notSaved.push({ fileName: result.fileName, ...value });
    const kept =
      left.size === 0
        ? result
        : { ...result, editedBiomarkers: result.editedBiomarkers.filter((b) => !left.has(b)) };
    if (kept.editedBiomarkers.length > 0) toSave.push(kept);
  }
  return { toSave, notSaved };
}

/** Whether a value still needs its test chosen, or "Not a LOINC test", before it can be saved */
export { needsTest } from './identification';
