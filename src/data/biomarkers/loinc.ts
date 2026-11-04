/**
 * LOINC's own names for LOINC codes, read from the app's LOINC catalog
 *
 * This material contains content from LOINC (http://loinc.org). LOINC is
 * copyright © Regenstrief Institute, Inc. and the Logical Observation
 * Identifiers Names and Codes (LOINC) Committee and is available at no cost
 * under the license at http://loinc.org/license. LOINC® is a registered
 * United States trademark of Regenstrief Institute, Inc.
 *
 * The license asks that a LOINC code be shown with one of LOINC's names for
 * it; these are the long common names (LONG_COMMON_NAME), unchanged.
 */
import { loadedCatalog } from '@data/loinc/catalog';

/** The notice the LOINC license asks every product using LOINC to show */
export const LOINC_NOTICE =
  'This material contains content from LOINC (http://loinc.org). LOINC is copyright © Regenstrief Institute, Inc. ' +
  'and the Logical Observation Identifiers Names and Codes (LOINC) Committee and is available at no cost under the ' +
  'license at http://loinc.org/license. LOINC® is a registered United States trademark of Regenstrief Institute, Inc.';

/**
 * LOINC's long common name for a code; undefined for a code not in the
 * catalog, or before the catalog has loaded
 */
export function loincName(code: string): string | undefined {
  return loadedCatalog()?.test(code)?.name;
}

/** A code as the license asks it be shown: with LOINC's name for it */
export function loincLabel(code: string): string {
  const name = loincName(code);
  return name ? `LOINC ${code}: ${name}` : `LOINC ${code}`;
}
