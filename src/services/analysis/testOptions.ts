/**
 * The tests offered when choosing a value's test, each told apart by the
 * parts of its LOINC name and what HemoIO knows of it
 */
import { sampleLabel, testDescription, unitOptions } from '@data/loinc/display';
import { isCommon, MATCH_SCORE } from './loincMatch';
import { searchTests } from './reviewEdits';
import { unitFit, type UnitFit } from './reviewedSave';
import type { Catalog, CatalogTest } from '@data/loinc/catalog';
import type { MatchedBiomarker } from './LabReportAnalyzer';

/** Absorbs float error in candidate scores */
const SCORE_EPSILON = 1e-9;

/**
 * Why a test the value may be is offered: the AI's unsure pick, its name
 * equal to the printed one, sharing all its words, near it, or none of
 * these, one of the usual tests in the value's unit
 */
export type OfferReason = 'ai' | 'name' | 'name-words' | 'similar' | 'usual-unit';

/** A test to choose, in the parts that tell it from the others */
export interface TestOptionDetails {
  code: string;
  /** LOINC long common name, shown with the code as the license asks */
  name: string;
  /** What is measured, as LOINC's long name opens: "Hematocrit", "Specific gravity" */
  title: string;
  /** The kind of quantity, as LOINC's long name writes it in brackets ("Mass/volume"); empty when it gives none */
  kind: string;
  /** The sample: "Serum/Plasma" */
  sample: string;
  /** How it is measured; empty when LOINC names no method */
  method: string;
  /** Units the test is given in */
  units: string[];
  /** Whether the value's own unit fits the test */
  unitFit: UnitFit;
  /** One of LOINC's commonly ordered tests */
  common: boolean;
  /** HemoIO's description of the test, when it has one */
  description?: string;
  /** Why it is offered, for the tests the value may be (not search results) */
  reason?: OfferReason;
}

/**
 * What a test measures and its kind, in the words of its long name, which
 * reads better than its LOINC parts ("Hematocrit [Volume Fraction] of
 * Blood", component "Erythrocyte/Blood"): the name before its bracketed
 * kind, else before the sample or method ("Specific gravity of Urine")
 */
function titleAndKind(test: CatalogTest): { title: string; kind: string } {
  const bracketed = /^(.*?)\s*\[([^\]]+)\]/.exec(test.name);
  if (bracketed) return { title: bracketed[1], kind: bracketed[2] };
  return { title: test.name.split(/\s+(?:of|in|by)\s+/)[0], kind: '' };
}

/** Why a test the value may be is offered; none for a test that is not one of them */
function reasonFor(code: string, biomarker: MatchedBiomarker): OfferReason | undefined {
  if (biomarker.aiPick === code) return 'ai';
  const candidate = biomarker.candidates.find((c) => c.code === code);
  if (!candidate) return undefined;
  // Scores are sums of fractions: 0.8999999999999999 is 0.9
  if (candidate.score >= 1 - SCORE_EPSILON) return 'name';
  if (candidate.score >= MATCH_SCORE - SCORE_EPSILON) return 'name-words';
  return candidate.score > 0 ? 'similar' : 'usual-unit';
}

/**
 * The details of each test offered for a value, in the order given; codes
 * the catalog lacks are left out
 */
export function describeTestOptions(
  catalog: Catalog,
  biomarker: MatchedBiomarker,
  codes: readonly string[],
  { suggested }: { suggested: boolean }
): TestOptionDetails[] {
  return codes.flatMap((code) => {
    const test = catalog.test(code);
    if (!test) return [];
    return [
      {
        code,
        name: test.name,
        ...titleAndKind(test),
        sample: sampleLabel(test),
        method: test.method,
        units: unitOptions(catalog, code),
        unitFit: unitFit({ ...biomarker, loincCode: code }, catalog),
        common: isCommon(catalog, code),
        description: testDescription(catalog, code),
        reason: suggested ? reasonFor(code, biomarker) : undefined,
      },
    ];
  });
}

/**
 * The tests offered for a value: those a search finds, else the tests it
 * may be, the one it is saved as first when it is not among them
 */
export function testOptionsFor(catalog: Catalog, biomarker: MatchedBiomarker, query: string): TestOptionDetails[] {
  if (query.trim()) {
    return describeTestOptions(catalog, biomarker, searchTests(catalog, query).map(({ code }) => code), {
      suggested: false,
    });
  }
  const current = biomarker.loincCode;
  const codes = biomarker.candidates.map(({ code }) => code);
  return describeTestOptions(catalog, biomarker, current && !codes.includes(current) ? [current, ...codes] : codes, {
    suggested: true,
  });
}
