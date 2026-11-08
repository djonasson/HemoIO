import { beforeAll, describe, expect, it } from 'vitest';
import { unitsMatch } from '@services/units/definitions';
import { toUcum } from '@services/units/ucum';
import { fixtureCatalog } from '@/test/loincFixture';
import { TEST_ADDONS, getAddon } from './addons';
import { createCatalog, isStopWord, loadCatalog, type Catalog, type CatalogFile } from './catalog';

const catalog = fixtureCatalog();
const ADDONS = Object.entries(TEST_ADDONS);

describe('TEST_ADDONS', () => {
  it('keeps the ranges, descriptions and units of the 110 coded dictionary tests', () => {
    expect(ADDONS).toHaveLength(110);
    expect(TEST_ADDONS['2345-7']).toMatchObject({
      referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
      canonicalUnit: 'mg/dL',
      alternativeUnits: ['mmol/L'],
    });
    expect(TEST_ADDONS['2345-7'].description).toBeTruthy();
  });

  it('keys every entry by a code in the generated catalog', async () => {
    const generated = await loadCatalog();
    const missing = ADDONS.map(([code]) => code).filter((code) => !generated.test(code));
    expect(missing).toEqual([]);
  });

  it.each(ADDONS.filter(([, addon]) => addon.referenceRange))(
    'gives %s a reference range in a UCUM unit',
    (_code, addon) => {
      expect(toUcum(addon.referenceRange!.unit)).not.toBeNull();
    }
  );

  it.each(ADDONS)('writes every unit of %s so that toUcum reads it', (_code, addon) => {
    const units = [addon.canonicalUnit, addon.referenceRange?.unit, ...(addon.alternativeUnits ?? [])];
    const unread = units.filter((unit): unit is string => unit !== undefined && toUcum(unit) === null);
    expect(unread).toEqual([]);
  });

  it.each(ADDONS.filter(([, addon]) => addon.referenceRange && addon.canonicalUnit))(
    'gives %s its reference range in its standard unit',
    (_code, addon) => {
      expect(addon.referenceRange!.unit).toBe(addon.canonicalUnit);
    }
  );

  it.each(ADDONS.filter(([, addon]) => addon.canonicalUnit))(
    'lists each unit of %s once, not again in another spelling',
    (_code, addon) => {
      const units = [addon.canonicalUnit!, ...(addon.alternativeUnits ?? [])];
      const repeated = units.filter((unit, i) => units.slice(0, i).some((earlier) => unitsMatch(earlier, unit)));
      expect(repeated).toEqual([]);
    }
  );

  it('shows reticulocytes with no method named, which trend apart from 17849-1, in %', async () => {
    const generated = await loadCatalog();
    expect(generated.trendGroup('4679-7')).not.toBe(generated.trendGroup('17849-1'));
    expect(getAddon(generated, '4679-7')).toMatchObject({ canonicalUnit: '%', alternativeUnits: ['‰'] });
  });
});

describe('getAddon', () => {
  it("finds a code's own entry", () => {
    expect(getAddon(catalog, '2345-7')).toBe(TEST_ADDONS['2345-7']);
  });

  it('falls back to the entry of a code in the same trend group', () => {
    // 14749-6, molar glucose in serum, trends with 2345-7
    expect(getAddon(catalog, '14749-6')).toBe(TEST_ADDONS['2345-7']);
  });

  it('is undefined for a code with no entry in its group', () => {
    expect(getAddon(catalog, '2351-5')).toBeUndefined();
    expect(getAddon(catalog, '99999-9')).toBeUndefined();
  });
});

describe("HemoIO's own names of tests", () => {
  const NAMED = ADDONS.flatMap(([code, addon]) => (addon.names ?? []).map((name) => [code, name] as const));
  // Names of more than one word, each with a telling word left out ("volume" says nothing of a test)
  const PARTS = NAMED.flatMap(([code, name]) => {
    const words = name.split(' ');
    if (words.length < 2) return [];
    return words.flatMap((word, i) => (isStopWord(word) ? [] : [[code, words.filter((_word, j) => j !== i).join(' ')] as const]));
  });

  // The generated catalog with and without HemoIO's names, their search indexes built before the tests' time
  let named: Catalog;
  let bare: Catalog;
  beforeAll(async () => {
    named = await loadCatalog();
    named.scoredSearch('glucosio');
    bare = createCatalog((await import('./catalog.generated.json')).default as CatalogFile, {});
    bare.scoredSearch('glucosio');
  }, 60_000);

  it.each(NAMED)('finds %s by "%s"', (code, name) => {
    expect(named.named(name).map((test) => test.code)).toContain(code);
  });

  it.each(NAMED)('gives %s "%s" only because LOINC has no such name of it', (code, name) => {
    expect(bare.named(name).map((test) => test.code)).not.toContain(code);
  });

  // A name of HemoIO's fits only as a whole: "volume medio" is not MPV's "volume piastrinico medio"
  it.each(PARTS)('finds %s by "%s", a part of its name, no better than LOINC does', (code, part) => {
    const byPart = (catalog: Catalog): number =>
      catalog.scoredSearch(part).find(({ test }) => test.code === code)?.score ?? 0;
    expect(byPart(named)).toBe(byPart(bare));
  });
});

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

let generated: Catalog;
beforeAll(async () => {
  generated = await loadCatalog();
});

/** LOINC's long common name for a code */
const loincName = (code: string): string | undefined => generated.test(code)?.name;

const CODES = Object.keys(TEST_ADDONS);

/**
 * What LOINC's name says about the kind of quantity (its PROPERTY) for each
 * standard unit HemoIO shows a test in; a code whose property disagrees with
 * the unit names a different measurement of the same analyte.
 */
const UNIT_KINDS: { units: string[]; name: RegExp }[] = [
  { units: ['10^9/L', '10^12/L', 'mil/mL', '10^6/mL'], name: /\[#\/volume\]/ },
  { units: ['million', '10^6'], name: /\[#\]/ },
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
  { units: ['', '[pH]', '1'], name: /^pH of |^Specific gravity of |\[Presence\]/ },
];

/** Each code HemoIO describes, with the long common name of its LOINC term */
const TERMS: [string, string][] = [
  ['6690-2', 'Leukocytes [#/volume] in Blood by Automated count'],
  ['789-8', 'Erythrocytes [#/volume] in Blood by Automated count'],
  ['718-7', 'Hemoglobin [Mass/volume] in Blood'],
  ['4544-3', 'Hematocrit [Volume Fraction] of Blood by Automated count'],
  ['777-3', 'Platelets [#/volume] in Blood by Automated count'],
  ['787-2', 'MCV [Entitic mean volume] in Red Blood Cells by Automated count'],
  ['785-6', 'MCH [Entitic mass] by Automated count'],
  ['786-4', 'MCHC [Entitic Mass/volume] in Red Blood Cells by Automated count'],
  ['788-0', 'Erythrocyte [DistWidth] in Blood by Automated count'],
  ['751-8', 'Neutrophils [#/volume] in Blood by Automated count'],
  ['770-8', 'Neutrophils/Leukocytes in Blood by Automated count'],
  ['731-0', 'Lymphocytes [#/volume] in Blood by Automated count'],
  ['736-9', 'Lymphocytes/Leukocytes in Blood by Automated count'],
  ['742-7', 'Monocytes [#/volume] in Blood by Automated count'],
  ['5905-5', 'Monocytes/Leukocytes in Blood by Automated count'],
  ['711-2', 'Eosinophils [#/volume] in Blood by Automated count'],
  ['713-8', 'Eosinophils/Leukocytes in Blood by Automated count'],
  ['704-7', 'Basophils [#/volume] in Blood by Automated count'],
  ['706-2', 'Basophils/Leukocytes in Blood by Automated count'],
  ['30392-5', 'Nucleated erythrocytes [#/volume] in Blood'],
  ['2157-6', 'Creatine kinase [Enzymatic activity/volume] in Serum or Plasma'],
  ['32623-1', 'Platelet [Entitic mean volume] in Blood by Automated count'],
  ['58413-6', 'Nucleated erythrocytes/Leukocytes [Ratio] in Blood by Automated count'],
  ['60474-4', 'Reticulocytes [#/volume] in Blood by Automated count'],
  ['17849-1', 'Reticulocytes/Erythrocytes in Blood by Automated count'],
  ['4679-7', 'Reticulocytes/Erythrocytes in Blood'],
  ['30341-2', 'Erythrocyte [Sedimentation Rate] in Blood'],
  ['1988-5', 'C reactive protein [Mass/volume] in Serum or Plasma'],
  ['2345-7', 'Glucose [Mass/volume] in Serum or Plasma'],
  ['2160-0', 'Creatinine [Mass/volume] in Serum or Plasma'],
  ['3094-0', 'Urea nitrogen [Mass/volume] in Serum or Plasma'],
  ['3091-6', 'Urea [Mass/volume] in Serum or Plasma'],
  ['3084-1', 'Urate [Mass/volume] in Serum or Plasma'],
  ['2951-2', 'Sodium [Moles/volume] in Serum or Plasma'],
  ['2823-3', 'Potassium [Moles/volume] in Serum or Plasma'],
  ['2075-0', 'Chloride [Moles/volume] in Serum or Plasma'],
  ['2028-9', 'Carbon dioxide, total [Moles/volume] in Serum or Plasma'],
  ['17861-6', 'Calcium [Mass/volume] in Serum or Plasma'],
  ['19123-9', 'Magnesium [Mass/volume] in Serum or Plasma'],
  ['98979-8', 'Glomerular filtration rate [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI 2021)/1.73 sq M'],
  ['2093-3', 'Cholesterol [Mass/volume] in Serum or Plasma'],
  ['13457-7', 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation'],
  ['2085-9', 'Cholesterol in HDL [Mass/volume] in Serum or Plasma'],
  ['2571-8', 'Triglyceride [Mass/volume] in Serum or Plasma'],
  ['13458-5', 'Cholesterol in VLDL [Mass/volume] in Serum or Plasma by calculation'],
  ['43396-1', 'Cholesterol non HDL [Mass/volume] in Serum or Plasma'],
  ['3016-3', 'Thyrotropin [Units/volume] in Serum or Plasma'],
  ['3024-7', 'Thyroxine (T4) free [Mass/volume] in Serum or Plasma'],
  ['3026-2', 'Thyroxine (T4) [Mass/volume] in Serum or Plasma'],
  ['3051-0', 'Triiodothyronine (T3) Free [Mass/volume] in Serum or Plasma'],
  ['3053-6', 'Triiodothyronine (T3) [Mass/volume] in Serum or Plasma'],
  ['8099-4', 'Thyroperoxidase Ab [Units/volume] in Serum or Plasma'],
  ['2498-4', 'Iron [Mass/volume] in Serum or Plasma'],
  ['2276-4', 'Ferritin [Mass/volume] in Serum or Plasma'],
  ['2500-7', 'Iron binding capacity [Mass/volume] in Serum or Plasma'],
  ['2502-3', 'Iron saturation [Mass Fraction] in Serum or Plasma'],
  ['3034-6', 'Transferrin [Mass/volume] in Serum or Plasma'],
  ['2132-9', 'Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma'],
  ['62292-8', '25-Hydroxyvitamin D3+25-Hydroxyvitamin D2 [Mass/volume] in Serum or Plasma'],
  ['2284-8', 'Folate [Mass/volume] in Serum or Plasma'],
  ['2923-1', 'Retinol [Mass/volume] in Serum or Plasma'],
  ['4548-4', 'Hemoglobin A1c/Hemoglobin.total in Blood'],
  ['15069-8', 'Fructosamine [Moles/volume] in Serum or Plasma'],
  ['2756-5', 'pH of Urine'],
  ['2965-2', 'Specific gravity of Urine'],
  ['2888-6', 'Protein [Mass/volume] in Urine'],
  ['2350-7', 'Glucose [Mass/volume] in Urine'],
  ['5797-6', 'Ketones [Mass/volume] in Urine by Test strip'],
  ['33903-6', 'Ketones [Presence] in Urine'],
  ['49137-3', 'Hemoglobin [Mass/volume] in Urine by Test strip'],
  ['13945-1', 'Erythrocytes [#/area] in Urine sediment by Microscopy high power field'],
  ['5821-4', 'Leukocytes [#/area] in Urine sediment by Microscopy high power field'],
  ['5799-2', 'Leukocyte esterase [Presence] in Urine by Test strip'],
  ['5802-4', 'Nitrite [Presence] in Urine by Test strip'],
  ['14957-5', 'Microalbumin [Mass/volume] in Urine'],
  ['5787-7', 'Epithelial cells [#/area] in Urine sediment by Microscopy high power field'],
  ['2161-8', 'Creatinine [Mass/volume] in Urine'],
  ['3092-4', 'Urea [Mass/volume] in Urine'],
  ['20505-4', 'Bilirubin.total [Mass/volume] in Urine by Test strip'],
  ['20405-7', 'Urobilinogen [Mass/volume] in Urine by Test strip'],
  ['9318-7', 'Albumin/Creatinine [Mass Ratio] in Urine'],
  ['2890-2', 'Protein/Creatinine [Mass Ratio] in Urine'],
  ['3167-4', 'Volume of 24 hour Urine'],
  ['1755-8', 'Albumin [Mass/time] in 24 hour Urine'],
  ['2162-6', 'Creatinine [Mass/time] in 24 hour Urine'],
  ['48999-7', 'Urea [Mass/time] in 24 hour Urine'],
  ['1742-6', 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma'],
  ['1920-8', 'Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma'],
  ['6768-6', 'Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma'],
  ['1975-2', 'Bilirubin.total [Mass/volume] in Serum or Plasma'],
  ['1968-7', 'Bilirubin.direct [Mass/volume] in Serum or Plasma'],
  ['2324-2', 'Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma'],
  ['1751-7', 'Albumin [Mass/volume] in Serum or Plasma'],
  ['2885-2', 'Protein [Mass/volume] in Serum or Plasma'],
  ['1798-8', 'Amylase [Enzymatic activity/volume] in Serum or Plasma'],
  ['1834-1', 'Alpha-1-Fetoprotein [Mass/volume] in Serum or Plasma'],
  ['3160-9', 'Volume of Semen'],
  ['10580-9', 'Liquefaction [Time] in Semen'],
  ['9780-8', 'Spermatozoa [#/volume] in Semen'],
  ['107184-4', 'Spermatozoa [#] in Semen'],
  ['10622-9', 'Spermatozoa Normal/Spermatozoa in Semen'],
  ['10613-8', 'Spermatozoa Viable/Spermatozoa in Semen'],
  ['14194-5', 'Spermatozoa Progressive/Spermatozoa in Semen'],
  ['6800-7', 'Spermatozoa Motile/Spermatozoa in Semen'],
  ['2752-4', 'pH of Semen'],
  ['13980-8', 'Albumin/Protein.total in Serum or Plasma by Electrophoresis'],
  ['13978-2', 'Alpha 1 globulin/Protein.total in Serum or Plasma by Electrophoresis'],
  ['13981-6', 'Alpha 2 globulin/Protein.total in Serum or Plasma by Electrophoresis'],
  ['13982-4', 'Beta globulin/Protein.total in Serum or Plasma by Electrophoresis'],
  ['13983-2', 'Gamma globulin/Protein.total in Serum or Plasma by Electrophoresis'],
];

describe('LOINC codes HemoIO describes', () => {
  it.each(CODES.map((code) => [TEST_ADDONS[code].shortName, code]))(
    '%s has a well-formed code (%s) with LOINC’s name for it',
    (_name, code) => {
      const [number, digit] = code.split('-');
      expect(Number(digit)).toBe(checkDigit(number));
      expect(loincName(code)).toBeTruthy();
    }
  );

  it.each(
    CODES.filter((code) => TEST_ADDONS[code].canonicalUnit !== undefined).map((code) => [
      TEST_ADDONS[code].shortName,
      TEST_ADDONS[code].canonicalUnit!,
      code,
    ])
  )('%s, shown in “%s”, has a code (%s) for that kind of quantity', (_name, unit, code) => {
    const kind = UNIT_KINDS.find((candidate) => candidate.units.includes(unit));
    expect(kind, `no kind of quantity for the unit “${unit}”`).toBeDefined();
    expect(loincName(code)).toMatch(kind!.name);
  });

  it.each(
    CODES.filter((code) => TEST_ADDONS[code].canonicalUnit).map((code) => [TEST_ADDONS[code].shortName, code])
  )('%s is a measured value, so its code (%s) is not a presence test', (_name, code) => {
    expect(loincName(code)).not.toMatch(/\[Presence\]|\[Threshold\]/);
  });

  // A wrong analyte, method or formula can share the right kind of quantity
  // (urea nitrogen for urea, D3 alone for D2+D3, MDRD for CKD-EPI), so each
  // code is also pinned to the LOINC term it is: change a code here on purpose.
  it.each(TERMS)('names %s by the test it is', (code, name) => {
    expect(loincName(code)).toBe(name);
  });

  it('pins every code HemoIO describes to its LOINC term', () => {
    expect(TERMS.map(([code]) => code).sort()).toEqual([...CODES].sort());
  });
});
