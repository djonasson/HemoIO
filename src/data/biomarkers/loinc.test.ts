import { describe, it, expect } from 'vitest';
import { BIOMARKER_DEFINITIONS, getBiomarkerByKey } from './dictionary';
import { LOINC_NOTICE, loincLabel, loincName } from './loinc';

/** LOINC's check digit: the Mod 10 (Luhn) digit of the code's number */
function checkDigit(number: string): number {
  let sum = 0;
  [...number].reverse().forEach((char, index) => {
    let digit = Number(char);
    if (index % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  });
  return (10 - (sum % 10)) % 10;
}

const CODED = BIOMARKER_DEFINITIONS.filter((definition) => definition.loincCode);

describe('LOINC codes of the biomarker dictionary', () => {
  it.each(CODED.map((definition) => [definition.name, definition.loincCode!]))(
    '%s has a well-formed code (%s) with LOINC’s name for it',
    (_name, code) => {
      const [number, digit] = code.split('-');
      expect(Number(digit)).toBe(checkDigit(number));
      expect(loincName(code)).toBeTruthy();
    }
  );

  it('gives each test its own code', () => {
    const codes = CODED.map((definition) => definition.loincCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it.each([
    ['fructosamine', 'Fructosamine [Moles/volume] in Serum or Plasma'],
    ['alpha-2-globulin', 'Alpha 2 globulin/Protein.total in Serum or Plasma by Electrophoresis'],
    ['gamma-globulin', 'Gamma globulin/Protein.total in Serum or Plasma by Electrophoresis'],
    ['urine-urea', 'Urea [Mass/volume] in Urine'],
    ['semen-volume', 'Volume of Semen'],
    ['sperm-concentration', 'Spermatozoa [#/volume] in Semen'],
  ])('names %s by the test it is', (key, name) => {
    expect(loincName(getBiomarkerByKey(key)!.loincCode!)).toBe(name);
  });
});

describe('loincLabel', () => {
  it("shows a code with LOINC's name for it", () => {
    expect(loincLabel('2345-7')).toBe('LOINC 2345-7: Glucose [Mass/volume] in Serum or Plasma');
  });

  it('shows a code it has no name for alone', () => {
    expect(loincLabel('99999-9')).toBe('LOINC 99999-9');
  });
});

describe('LOINC_NOTICE', () => {
  it('is the notice the LOINC license asks for', () => {
    expect(LOINC_NOTICE).toBe(
      'This material contains content from LOINC (http://loinc.org). LOINC is copyright © Regenstrief Institute, Inc. and the Logical Observation Identifiers Names and Codes (LOINC) Committee and is available at no cost under the license at http://loinc.org/license. LOINC® is a registered United States trademark of Regenstrief Institute, Inc.'
    );
  });
});
