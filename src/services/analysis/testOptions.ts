/**
 * The tests offered when choosing a value's test, each told apart by the
 * parts of its LOINC name and what HemoIO knows of it
 */
import { sampleLabel, testDescription, unitOptions } from '@data/loinc/display';
import { COMMON_RANK, MATCH_SCORE } from './loincMatch';
import { unitFit, type UnitFit } from './reviewedSave';
import type { Catalog, CatalogTest } from '@data/loinc/catalog';
import type { MatchedBiomarker } from './LabReportAnalyzer';

/** A test to choose, in the parts that tell it from the others */
export interface TestOptionDetails {
  code: string;
  /** LOINC long common name, shown with the code as the license asks */
  name: string;
  /** What is measured: "Glomerular filtration rate" */
  component: string;
  /** The kind of quantity, as LOINC's long name writes it: "Mass/volume" */
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
  reason?: string;
}

/** LOINC's long name gives the kind in brackets ("Glucose [Mass/volume] in Blood"); else its property code */
function kindOf(test: CatalogTest): string {
  return /\[([^\]]+)\]/.exec(test.name)?.[1] ?? test.property;
}

/** Why a test the value may be is offered: the AI's guess, or how well its name fits the printed one */
function reasonFor(code: string, biomarker: MatchedBiomarker): string | undefined {
  if (biomarker.aiPick === code) return "The AI's best guess";
  const candidate = biomarker.candidates.find((c) => c.code === code);
  if (!candidate) return undefined;
  if (candidate.score >= 1) return 'Name matches';
  if (candidate.score >= MATCH_SCORE) return 'Name matches in other words';
  if (candidate.score > 0) return 'Name is similar';
  return 'A usual test in this unit';
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
    const description = testDescription(catalog, code);
    const reason = suggested ? reasonFor(code, biomarker) : undefined;
    return [
      {
        code,
        name: test.name,
        component: test.component,
        kind: kindOf(test),
        sample: sampleLabel(test),
        method: test.method,
        units: unitOptions(catalog, code),
        unitFit: unitFit({ ...biomarker, loincCode: code }, catalog),
        common: test.rank > 0 && test.rank <= COMMON_RANK,
        ...(description && { description }),
        ...(reason && { reason }),
      },
    ];
  });
}
