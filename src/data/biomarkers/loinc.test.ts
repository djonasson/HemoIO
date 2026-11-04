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

/**
 * What LOINC's name says about the kind of quantity (its PROPERTY) for each
 * unit the dictionary stores a value in; a code whose property disagrees with
 * the unit names a different measurement of the same analyte.
 */
const UNIT_KINDS: { units: string[]; name: RegExp }[] = [
  { units: ['10^9/L', '10^12/L', 'mil/mL'], name: /\[#\/volume\]/ },
  { units: ['million'], name: /\[#\]/ },
  { units: ['RBC/HPF', 'WBC/HPF', '/HPF'], name: /\[#\/area\] .*high power field/ },
  // Also MCHC's [Entitic Mass/volume]
  { units: ['g/dL', 'g/L', 'mg/dL', 'mg/L', 'µg/dL', 'ng/mL', 'ng/dL', 'pg/mL'], name: /Mass\/volume\]/ },
  { units: ['mEq/L', 'mmol/L', 'µmol/L'], name: /\[Moles\/volume\]/ },
  { units: ['U/L'], name: /\[Enzymatic activity\/volume\]/ },
  { units: ['mIU/L', 'IU/mL'], name: /\[Units\/volume\]/ },
  // A share: a fraction, a distribution width, or one count over another
  { units: ['%'], name: /\[(Mass|Volume) Fraction\]|\[DistWidth\]|^[^[]+\/[^[]+ in / },
  { units: ['/100 WBC'], name: /\[Ratio\]/ },
  { units: ['mg/g'], name: /\[Mass Ratio\]/ },
  { units: ['mg/24h', 'g/24h'], name: /\[Mass\/time\] in 24 hour Urine/ },
  { units: ['mL'], name: /^Volume of / },
  { units: ['fL'], name: /\[Entitic mean volume\]/ },
  { units: ['pg'], name: /\[Entitic mass\]/ },
  { units: ['mm/h'], name: /\[Sedimentation Rate\]/ },
  { units: ['mL/min/1.73m²'], name: /\[Volume Rate\/Area\]/ },
  { units: ['min'], name: /\[Time\]/ },
  // Unitless: pH, specific gravity, and dipstick tests read as present or absent
  { units: [''], name: /^pH of |^Specific gravity of |\[Presence\]/ },
];

/** How LOINC's name gives the specimen (its SYSTEM) for each specimen type */
const SPECIMEN_NAMES: Record<string, RegExp> = {
  serum: /in Serum(,| or) Plasma/,
  // LOINC's MCH term names no system
  'whole-blood': /(in|of) Blood|in Red Blood Cells|^MCH /,
  urine: /(in|of) Urine/,
  'urine-24h': /24 hour Urine/,
  semen: /(in|of) Semen/,
};

/** Each coded test with the long common name of its LOINC term */
const TERMS: [string, string][] = [
  ['white-blood-cell-count', 'Leukocytes [#/volume] in Blood by Automated count'],
  ['red-blood-cell-count', 'Erythrocytes [#/volume] in Blood by Automated count'],
  ['hemoglobin', 'Hemoglobin [Mass/volume] in Blood'],
  ['hematocrit', 'Hematocrit [Volume Fraction] of Blood by Automated count'],
  ['platelet-count', 'Platelets [#/volume] in Blood by Automated count'],
  ['mean-corpuscular-volume', 'MCV [Entitic mean volume] in Red Blood Cells by Automated count'],
  ['mean-corpuscular-hemoglobin', 'MCH [Entitic mass] by Automated count'],
  ['mean-corpuscular-hemoglobin-concentration', 'MCHC [Entitic Mass/volume] in Red Blood Cells by Automated count'],
  ['red-cell-distribution-width', 'Erythrocyte [DistWidth] in Blood by Automated count'],
  ['neutrophils', 'Neutrophils [#/volume] in Blood by Automated count'],
  ['neutrophils-percentage', 'Neutrophils/Leukocytes in Blood by Automated count'],
  ['lymphocytes', 'Lymphocytes [#/volume] in Blood by Automated count'],
  ['lymphocytes-percentage', 'Lymphocytes/Leukocytes in Blood by Automated count'],
  ['monocytes', 'Monocytes [#/volume] in Blood by Automated count'],
  ['monocytes-percentage', 'Monocytes/Leukocytes in Blood by Automated count'],
  ['eosinophils', 'Eosinophils [#/volume] in Blood by Automated count'],
  ['eosinophils-percentage', 'Eosinophils/Leukocytes in Blood by Automated count'],
  ['basophils', 'Basophils [#/volume] in Blood by Automated count'],
  ['basophils-percentage', 'Basophils/Leukocytes in Blood by Automated count'],
  ['nucleated-red-blood-cells', 'Nucleated erythrocytes [#/volume] in Blood'],
  ['nucleated-red-blood-cells-percentage', 'Nucleated erythrocytes/Leukocytes [Ratio] in Blood by Automated count'],
  ['reticulocytes', 'Reticulocytes [#/volume] in Blood by Automated count'],
  ['reticulocytes-percentage', 'Reticulocytes/Erythrocytes in Blood by Automated count'],
  ['erythrocyte-sedimentation-rate', 'Erythrocyte [Sedimentation Rate] in Blood'],
  ['c-reactive-protein', 'C reactive protein [Mass/volume] in Serum or Plasma'],
  ['glucose', 'Glucose [Mass/volume] in Serum or Plasma'],
  ['creatinine', 'Creatinine [Mass/volume] in Serum or Plasma'],
  ['blood-urea-nitrogen', 'Urea nitrogen [Mass/volume] in Serum or Plasma'],
  ['urea', 'Urea [Mass/volume] in Serum or Plasma'],
  ['uric-acid', 'Urate [Mass/volume] in Serum or Plasma'],
  ['sodium', 'Sodium [Moles/volume] in Serum or Plasma'],
  ['potassium', 'Potassium [Moles/volume] in Serum or Plasma'],
  ['chloride', 'Chloride [Moles/volume] in Serum or Plasma'],
  ['carbon-dioxide', 'Carbon dioxide, total [Moles/volume] in Serum or Plasma'],
  ['calcium', 'Calcium [Mass/volume] in Serum or Plasma'],
  ['magnesium', 'Magnesium [Mass/volume] in Serum or Plasma'],
  ['egfr', 'Glomerular filtration rate [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI 2021)/1.73 sq M'],
  ['total-cholesterol', 'Cholesterol [Mass/volume] in Serum or Plasma'],
  ['ldl-cholesterol', 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation'],
  ['hdl-cholesterol', 'Cholesterol in HDL [Mass/volume] in Serum or Plasma'],
  ['triglycerides', 'Triglyceride [Mass/volume] in Serum or Plasma'],
  ['vldl-cholesterol', 'Cholesterol in VLDL [Mass/volume] in Serum or Plasma by calculation'],
  ['non-hdl-cholesterol', 'Cholesterol non HDL [Mass/volume] in Serum or Plasma'],
  ['thyroid-stimulating-hormone', 'Thyrotropin [Units/volume] in Serum or Plasma'],
  ['free-t4', 'Thyroxine (T4) free [Mass/volume] in Serum or Plasma'],
  ['total-t4', 'Thyroxine (T4) [Mass/volume] in Serum or Plasma'],
  ['free-t3', 'Triiodothyronine (T3) Free [Mass/volume] in Serum or Plasma'],
  ['total-t3', 'Triiodothyronine (T3) [Mass/volume] in Serum or Plasma'],
  ['tpo-antibodies', 'Thyroperoxidase Ab [Units/volume] in Serum or Plasma'],
  ['serum-iron', 'Iron [Mass/volume] in Serum or Plasma'],
  ['ferritin', 'Ferritin [Mass/volume] in Serum or Plasma'],
  ['total-iron-binding-capacity', 'Iron binding capacity [Mass/volume] in Serum or Plasma'],
  ['transferrin-saturation', 'Iron saturation [Mass Fraction] in Serum or Plasma'],
  ['transferrin', 'Transferrin [Mass/volume] in Serum or Plasma'],
  ['vitamin-b12', 'Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma'],
  ['vitamin-d', '25-Hydroxyvitamin D3+25-Hydroxyvitamin D2 [Mass/volume] in Serum or Plasma'],
  ['folate', 'Folate [Mass/volume] in Serum or Plasma'],
  ['vitamin-a', 'Retinol [Mass/volume] in Serum or Plasma'],
  ['hemoglobin-a1c', 'Hemoglobin A1c/Hemoglobin.total in Blood'],
  ['fructosamine', 'Fructosamine [Moles/volume] in Serum or Plasma'],
  ['urine-ph', 'pH of Urine'],
  ['urine-specific-gravity', 'Specific gravity of Urine'],
  ['urine-protein', 'Protein [Mass/volume] in Urine'],
  ['urine-glucose', 'Glucose [Mass/volume] in Urine'],
  ['urine-ketones', 'Ketones [Mass/volume] in Urine by Test strip'],
  ['urine-blood', 'Hemoglobin [Mass/volume] in Urine by Test strip'],
  ['urine-red-blood-cells', 'Erythrocytes [#/area] in Urine sediment by Microscopy high power field'],
  ['urine-wbc', 'Leukocytes [#/area] in Urine sediment by Microscopy high power field'],
  ['urine-leukocyte-esterase', 'Leukocyte esterase [Presence] in Urine by Test strip'],
  ['urine-nitrites', 'Nitrite [Presence] in Urine by Test strip'],
  ['microalbumin', 'Microalbumin [Mass/volume] in Urine'],
  ['urine-epithelial-cells', 'Epithelial cells [#/area] in Urine sediment by Microscopy high power field'],
  ['urine-creatinine', 'Creatinine [Mass/volume] in Urine'],
  ['urine-urea', 'Urea [Mass/volume] in Urine'],
  ['urine-bilirubin', 'Bilirubin.total [Mass/volume] in Urine by Test strip'],
  ['urine-urobilinogen', 'Urobilinogen [Mass/volume] in Urine by Test strip'],
  ['albumin-creatinine-ratio', 'Albumin/Creatinine [Mass Ratio] in Urine'],
  ['protein-creatinine-ratio', 'Protein/Creatinine [Mass Ratio] in Urine'],
  ['urine-volume', 'Volume of 24 hour Urine'],
  ['24-hour-urine-albumin', 'Albumin [Mass/time] in 24 hour Urine'],
  ['24-hour-urine-creatinine', 'Creatinine [Mass/time] in 24 hour Urine'],
  ['24-hour-urine-urea', 'Urea [Mass/time] in 24 hour Urine'],
  ['alanine-aminotransferase', 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma'],
  ['aspartate-aminotransferase', 'Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma'],
  ['alkaline-phosphatase', 'Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma'],
  ['bilirubin-total', 'Bilirubin.total [Mass/volume] in Serum or Plasma'],
  ['bilirubin-direct', 'Bilirubin.direct [Mass/volume] in Serum or Plasma'],
  ['gamma-glutamyl-transferase', 'Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma'],
  ['albumin', 'Albumin [Mass/volume] in Serum or Plasma'],
  ['total-protein', 'Protein [Mass/volume] in Serum or Plasma'],
  ['amylase', 'Amylase [Enzymatic activity/volume] in Serum or Plasma'],
  ['alpha-fetoprotein', 'Alpha-1-Fetoprotein [Mass/volume] in Serum or Plasma'],
  ['semen-volume', 'Volume of Semen'],
  ['liquefaction-time', 'Liquefaction [Time] in Semen'],
  ['sperm-concentration', 'Spermatozoa [#/volume] in Semen'],
  ['total-sperm-count', 'Spermatozoa [#] in Semen'],
  ['normal-sperm-morphology', 'Spermatozoa Normal/Spermatozoa in Semen'],
  ['sperm-vitality', 'Spermatozoa Viable/Spermatozoa in Semen'],
  ['total-progressive-motility', 'Spermatozoa Progressive/Spermatozoa in Semen'],
  ['total-motility', 'Spermatozoa Motile/Spermatozoa in Semen'],
  ['semen-ph', 'pH of Semen'],
  ['serum-albumin-electrophoresis', 'Albumin/Protein.total in Serum or Plasma by Electrophoresis'],
  ['alpha-1-globulin', 'Alpha 1 globulin/Protein.total in Serum or Plasma by Electrophoresis'],
  ['alpha-2-globulin', 'Alpha 2 globulin/Protein.total in Serum or Plasma by Electrophoresis'],
  ['beta-globulin', 'Beta globulin/Protein.total in Serum or Plasma by Electrophoresis'],
  ['gamma-globulin', 'Gamma globulin/Protein.total in Serum or Plasma by Electrophoresis'],
];

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

  it.each(CODED.map((definition) => [definition.name, definition.canonicalUnit, definition.loincCode!]))(
    '%s, stored in “%s”, has a code (%s) for that kind of quantity',
    (_name, unit, code) => {
      const kind = UNIT_KINDS.find((candidate) => candidate.units.includes(unit));
      expect(kind, `no kind of quantity for the unit “${unit}”`).toBeDefined();
      expect(loincName(code)).toMatch(kind!.name);
    }
  );

  it.each(
    CODED.filter((definition) => definition.canonicalUnit).map((definition) => [
      definition.name,
      definition.loincCode!,
    ])
  )('%s is a measured value, so its code (%s) is not a presence test', (_name, code) => {
    expect(loincName(code)).not.toMatch(/\[Presence\]|\[Threshold\]/);
  });

  it.each(CODED.map((definition) => [definition.name, definition.specimenType!, definition.loincCode!]))(
    '%s, taken from %s, has a code (%s) for that specimen',
    (_name, specimen, code) => {
      const name = loincName(code)!;
      expect(name).toMatch(SPECIMEN_NAMES[specimen]);
      if (specimen !== 'urine-24h') expect(name).not.toMatch(/24 hour/);
    }
  );

  // A wrong analyte, method or formula can share the right kind of quantity
  // (urea nitrogen for urea, D3 alone for D2+D3, MDRD for CKD-EPI), so each
  // test is also pinned to the LOINC term it is: change a code here on purpose.
  it.each(TERMS)('names %s by the test it is', (key, name) => {
    expect(loincName(getBiomarkerByKey(key)!.loincCode!)).toBe(name);
  });

  it('pins every coded test to its LOINC term', () => {
    expect(TERMS.map(([key]) => key).sort()).toEqual(CODED.map((definition) => definition.key).sort());
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
