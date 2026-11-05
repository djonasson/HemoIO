import { describe, expect, it } from 'vitest';
import { LOINC_NOTICE } from './notice';

describe('LOINC_NOTICE', () => {
  it('is the notice the LOINC license asks for', () => {
    expect(LOINC_NOTICE).toBe(
      'This material contains content from LOINC (http://loinc.org). LOINC is copyright © Regenstrief Institute, Inc. and the Logical Observation Identifiers Names and Codes (LOINC) Committee and is available at no cost under the license at http://loinc.org/license. LOINC® is a registered United States trademark of Regenstrief Institute, Inc.'
    );
  });
});
