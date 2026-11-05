/**
 * Unit Conversion Definitions
 *
 * UCUM converts units of one dimension for any test (g/dL to g/L, cells/µL
 * to 10^9/L, mIU/mL to IU/L). What it cannot know is kept here, by
 * substance, the LOINC component ("Glucose", "Creatinine"):
 * - its chemistry: the molar mass that turns a mass into moles (glucose
 *   mg/dL to mmol/L) and the ion's charge that turns moles into
 *   equivalents (magnesium mmol/L to mEq/L), which UCUM then applies;
 * - conversions no unit arithmetic gives: an equation (HbA1c % to
 *   mmol/mol), an arbitrary unit against a mass or an enzyme unit, a share
 *   against a ratio, an approximation for one sample.
 * One substance has one entry, whatever the sample.
 */

import { unitsMatch } from '../../utils/unitSpelling';
import { ucumConversion, type Chemistry, type LinearConversion } from './ucum';

export { normalizeUnitForLookup, unitsMatch } from '../../utils/unitSpelling';
export type { Chemistry, LinearConversion } from './ucum';

/**
 * Unit conversion factor definition
 */
export interface UnitConversion {
  /** Source unit */
  from: string;
  /** Target unit */
  to: string;
  /** Multiply by this factor to convert from -> to */
  factor: number;
  /** Added after multiplying, for conversions that are not plain ratios */
  offset?: number;
  /**
   * Only for values in these LOINC systems (samples): an approximation that
   * holds for one sample type alone
   */
  systems?: readonly string[];
}

/**
 * What a value measures, as far as converting it goes: its LOINC component,
 * with the system (sample) where a conversion depends on it. A catalog test
 * is one. A plain string is a component alone.
 */
export interface Substance {
  component: string;
  system?: string;
}

export type SubstanceRef = string | Substance;

function asSubstance(ref: SubstanceRef): Substance {
  return typeof ref === 'string' ? { component: ref } : ref;
}

/**
 * The unit conversions of one substance
 */
export interface SubstanceConversions {
  /** LOINC component, e.g. "Hemoglobin A1c/Hemoglobin.total" */
  component: string;
  /** Available unit conversions */
  conversions: UnitConversion[];
}

/**
 * Molar masses (g/mol) and ion charges by LOINC component. A protein's
 * molar mass is that of the molecule its assays are calibrated to; a
 * substance whose molecules vary (lipoprotein(a), fructosamine, the
 * immunoglobulins) has none, as no one factor converts it.
 */
export const CHEMISTRY: ReadonlyMap<string, Chemistry> = new Map(
  Object.entries<Chemistry>({
    // Electrolytes and minerals
    sodium: { molarMass: 22.99, charge: 1 },
    potassium: { molarMass: 39.098, charge: 1 },
    chloride: { molarMass: 35.45, charge: 1 },
    // Total CO2 is measured as bicarbonate, one charge
    'carbon dioxide': { charge: 1 },
    bicarbonate: { molarMass: 61.02, charge: 1 },
    calcium: { molarMass: 40.08, charge: 2 },
    magnesium: { molarMass: 24.305, charge: 2 },
    lithium: { molarMass: 6.94, charge: 1 },
    // Phosphate is reported as its phosphorus
    phosphate: { molarMass: 30.97 },
    iron: { molarMass: 55.845 },
    // Iron binding capacity is the iron it binds
    'iron binding capacity': { molarMass: 55.845 },
    zinc: { molarMass: 65.38 },
    copper: { molarMass: 63.546 },
    selenium: { molarMass: 78.97 },
    lead: { molarMass: 207.2 },
    mercury: { molarMass: 200.59 },
    // Metabolites
    glucose: { molarMass: 180.16 },
    'estimated average glucose': { molarMass: 180.16 },
    creatinine: { molarMass: 113.12 },
    creatine: { molarMass: 131.13 },
    urea: { molarMass: 60.06 },
    // Urea nitrogen is the two nitrogen atoms of urea
    'urea nitrogen': { molarMass: 28.014 },
    urate: { molarMass: 168.11 },
    bilirubin: { molarMass: 584.66 },
    urobilinogen: { molarMass: 590.72 },
    cholesterol: { molarMass: 386.65 },
    // An average triglyceride (as triolein)
    triglyceride: { molarMass: 885 },
    lactate: { molarMass: 89.07 },
    ammonia: { molarMass: 17.03 },
    // Urine ketones are read as acetoacetate
    ketones: { molarMass: 102.09 },
    'beta hydroxybutyrate': { molarMass: 104.1 },
    homocysteine: { molarMass: 135.18 },
    methylmalonate: { molarMass: 118.09 },
    oxalate: { molarMass: 88.02 },
    citrate: { molarMass: 189.1 },
    ethanol: { molarMass: 46.07 },
    // Vitamins
    calcidiol: { molarMass: 400.64 },
    ercalcidiol: { molarMass: 412.65 },
    'calcidiol+ercalcidiol': { molarMass: 400.64 },
    calcitriol: { molarMass: 416.64 },
    cholecalciferol: { molarMass: 384.64 },
    cobalamins: { molarMass: 1355.37 },
    folate: { molarMass: 441.4 },
    retinol: { molarMass: 286.45 },
    'alpha tocopherol': { molarMass: 430.71 },
    'pyridoxal phosphate': { molarMass: 247.14 },
    ascorbate: { molarMass: 176.12 },
    // Hormones
    thyroxine: { molarMass: 776.87 },
    triiodothyronine: { molarMass: 650.97 },
    cortisol: { molarMass: 362.46 },
    testosterone: { molarMass: 288.42 },
    estradiol: { molarMass: 272.38 },
    estriol: { molarMass: 288.38 },
    progesterone: { molarMass: 314.46 },
    '17-hydroxyprogesterone': { molarMass: 330.46 },
    androstenedione: { molarMass: 286.41 },
    aldosterone: { molarMass: 360.44 },
    dehydroepiandrosterone: { molarMass: 288.42 },
    'dehydroepiandrosterone sulfate': { molarMass: 368.49 },
    'parathyrin.intact': { molarMass: 9425 },
    corticotropin: { molarMass: 4541 },
    'c peptide': { molarMass: 3020.3 },
    'natriuretic peptide.b': { molarMass: 3464 },
    'natriuretic peptide.b prohormone n-terminal': { molarMass: 8457 },
    metanephrine: { molarMass: 197.23 },
    normetanephrine: { molarMass: 183.2 },
    // Proteins
    // Hemoglobin per monomer (16 114.5 g/mol): g/dL × 0.6206 = mmol/L
    hemoglobin: { molarMass: 16114.5 },
    albumin: { molarMass: 66472 },
    transferrin: { molarMass: 79570 },
    ferritin: { molarMass: 445000 },
    'c reactive protein': { molarMass: 105000 },
    'alpha-1-fetoprotein': { molarMass: 69000 },
    'beta-2-microglobulin': { molarMass: 11800 },
    prealbumin: { molarMass: 54980 },
    // Drugs
    acetaminophen: { molarMass: 151.16 },
    salicylates: { molarMass: 138.12 },
    digoxin: { molarMass: 780.94 },
    vancomycin: { molarMass: 1449.3 },
    valproate: { molarMass: 144.21 },
    phenytoin: { molarMass: 252.27 },
    carbamazepine: { molarMass: 236.27 },
    phenobarbital: { molarMass: 232.24 },
    lamotrigine: { molarMass: 256.09 },
    levetiracetam: { molarMass: 170.21 },
    methotrexate: { molarMass: 454.44 },
    cyclosporine: { molarMass: 1202.61 },
    theophylline: { molarMass: 180.16 },
    cotinine: { molarMass: 176.22 },
    nicotine: { molarMass: 162.23 },
  })
);

/**
 * HbA1c conversions
 * NGSP (%) to IFCC (mmol/mol), the IFCC–NGSP master equation:
 * IFCC = (NGSP − 2.15) × 10.929, so NGSP = IFCC / 10.929 + 2.15
 */
const hba1cConversions: SubstanceConversions = {
  component: 'Hemoglobin A1c/Hemoglobin.total',
  conversions: [
    { from: '%', to: 'mmol/mol', factor: 10.929, offset: -2.15 * 10.929 },
    { from: 'mmol/mol', to: '%', factor: 1 / 10.929, offset: 2.15 },
  ],
};

/**
 * Urine albumin (microalbumin): mg/L ↔ µg/min, assuming 1440 min/day and
 * ~1.5 L urine/day on average. An approximation that holds for urine alone.
 */
const albuminConversions: SubstanceConversions = {
  component: 'Albumin',
  conversions: [
    { from: 'mg/L', to: 'µg/min', factor: 1.04, systems: ['Urine'] },
    { from: 'µg/min', to: 'mg/L', factor: 0.96, systems: ['Urine'] },
  ],
};

/**
 * Hematocrit: a percentage of the blood's volume, or that as a ratio
 */
const hematocritConversions: SubstanceConversions = {
  component: 'Erythrocyte/Blood',
  conversions: [
    { from: '%', to: 'L/L', factor: 0.01 },
    { from: '%', to: 'ratio', factor: 0.01 },
    { from: 'L/L', to: '%', factor: 100 },
    { from: 'ratio', to: '%', factor: 100 },
    { from: 'L/L', to: 'ratio', factor: 1 },
    { from: 'ratio', to: 'L/L', factor: 1 },
  ],
};

/**
 * Reticulocytes as a share of red cells: per mille is a tenth of a percent
 */
const reticulocytePercentageConversions: SubstanceConversions = {
  component: 'Reticulocytes/Erythrocytes',
  conversions: [
    { from: '‰', to: '%', factor: 0.1 },
    { from: '%', to: '‰', factor: 10 },
  ],
};

/**
 * Nucleated red blood cells per 100 white cells is a percentage
 */
const nrbcPercentageConversions: SubstanceConversions = {
  component: 'Erythrocytes.nucleated/Leukocytes',
  conversions: [
    { from: '/100 WBC', to: '%', factor: 1 },
    { from: '%', to: '/100 WBC', factor: 1 },
  ],
};

/**
 * TPO antibodies: labs print the international unit as U/mL too
 */
const tpoAntibodiesConversions: SubstanceConversions = {
  component: 'Thyroperoxidase Ab',
  conversions: [
    { from: 'IU/mL', to: 'U/mL', factor: 1 },
    { from: 'U/mL', to: 'IU/mL', factor: 1 },
  ],
};

/**
 * Enzymes (ALT, AST, ALP, GGT, Amylase): U/L and IU/L are equivalent
 */
const ENZYME_UNITS: UnitConversion[] = [
  { from: 'U/L', to: 'IU/L', factor: 1 },
  { from: 'IU/L', to: 'U/L', factor: 1 },
];

const enzymeConversions: SubstanceConversions[] = [
  'Alanine aminotransferase',
  'Aspartate aminotransferase',
  'Alkaline phosphatase',
  'Gamma glutamyl transferase',
  'Amylase',
].map((component) => ({ component, conversions: ENZYME_UNITS }));

/**
 * Alpha-fetoprotein in international units of the WHO standard 72/225:
 * 1 IU = 1.21 ng
 */
const afpConversions: SubstanceConversions = {
  component: 'Alpha-1-Fetoprotein',
  conversions: [
    { from: 'IU/mL', to: 'ng/mL', factor: 1.21 },
    { from: 'ng/mL', to: 'IU/mL', factor: 1 / 1.21 },
  ],
};

/**
 * Urine urobilinogen in Ehrlich units: about one mg/dL each
 * (µmol/L × 0.0592 = mg/dL)
 */
const urineUrobilinogenConversions: SubstanceConversions = {
  component: 'Urobilinogen',
  conversions: [
    { from: 'mg/dL', to: 'EU/dL', factor: 1 },
    { from: 'µmol/L', to: 'EU/dL', factor: 0.0592 },
    { from: 'EU/dL', to: 'mg/dL', factor: 1 },
    { from: 'EU/dL', to: 'µmol/L', factor: 16.9 },
  ],
};

/**
 * Ratios to creatinine, by creatinine's molar mass (113.12 g/mol):
 * mg/mmol × 8.84 = mg/g
 */
const CREATININE_RATIO_UNITS: UnitConversion[] = [
  { from: 'mg/mmol', to: 'mg/g', factor: 8.84 },
  { from: 'mg/g', to: 'mg/mmol', factor: 0.1131 },
];

const creatinineRatioConversions: SubstanceConversions[] = ['Protein/Creatinine', 'Albumin/Creatinine'].map(
  (component) => ({ component, conversions: CREATININE_RATIO_UNITS })
);

/**
 * A total sperm count, in millions however written
 */
const spermCountConversions: SubstanceConversions = {
  component: 'Spermatozoa',
  conversions: [
    { from: 'M', to: 'million', factor: 1 },
    { from: 'million', to: 'M', factor: 1 },
  ],
};

/**
 * All conversion definitions
 */
export const UNIT_CONVERSIONS: SubstanceConversions[] = [
  hba1cConversions,
  albuminConversions,
  hematocritConversions,
  reticulocytePercentageConversions,
  nrbcPercentageConversions,
  tpoAntibodiesConversions,
  ...enzymeConversions,
  afpConversions,
  urineUrobilinogenConversions,
  ...creatinineRatioConversions,
  spermCountConversions,
];

const BY_COMPONENT = new Map(UNIT_CONVERSIONS.map((definition) => [definition.component.toLowerCase(), definition]));

/**
 * A substance's entry in a table keyed by lowercase component. A component
 * with a subpart uses its substance's entry when it has none of its own:
 * "Cholesterol.in LDL" and "Glucose^2H post 75 g glucose PO" convert as
 * cholesterol and glucose. A ratio of two substances ("Albumin/Creatinine")
 * has only its own.
 */
function entryOf<T>(table: ReadonlyMap<string, T>, substance: SubstanceRef): T | undefined {
  const key = asSubstance(substance).component.trim().toLowerCase();
  const own = table.get(key);
  if (own || key.includes('/')) return own;
  return table.get(key.split(/[.^]/)[0]);
}

/** The conversions UCUM cannot give for a substance (see entryOf) */
export function findConversionDefinition(substance: SubstanceRef): SubstanceConversions | undefined {
  return entryOf(BY_COMPONENT, substance);
}

/** A substance's molar mass and charge (see entryOf), or none known */
export function chemistryOf(substance: SubstanceRef): Chemistry {
  return entryOf(CHEMISTRY, substance) ?? {};
}

/** The conversions of a substance that apply to its sample */
export function conversionsOf(substance: SubstanceRef): UnitConversion[] {
  const { system } = asSubstance(substance);
  return (findConversionDefinition(substance)?.conversions ?? []).filter(
    (conversion) =>
      conversion.systems === undefined || (system !== undefined && conversion.systems.includes(system))
  );
}

const IDENTITY: LinearConversion = { factor: 1, offset: 0 };

/** One conversion, then another */
function then(first: LinearConversion, second: LinearConversion): LinearConversion {
  return { factor: first.factor * second.factor, offset: first.offset * second.factor + second.offset };
}

/** Between two units UCUM rescales without knowing the substance (mg/dL to mg/L) */
function rescale(from: string, to: string): LinearConversion | undefined {
  return unitsMatch(from, to) ? IDENTITY : ucumConversion(from, to);
}

/**
 * The conversion between two units for a substance: one of its own
 * conversions, with UCUM rescaling either end (urine albumin mg/dL to
 * µg/min goes through mg/L), else as UCUM converts with the substance's
 * molar mass and charge
 */
export function getConversion(
  substance: SubstanceRef,
  fromUnit: string,
  toUnit: string
): LinearConversion | undefined {
  // Same unit, however spelled: no conversion needed, even for a test with none
  if (unitsMatch(fromUnit, toUnit)) return IDENTITY;
  const conversions = conversionsOf(substance);
  const own = (c: UnitConversion): LinearConversion => ({ factor: c.factor, offset: c.offset ?? 0 });

  const direct = conversions.find((c) => unitsMatch(c.from, fromUnit) && unitsMatch(c.to, toUnit));
  if (direct) return own(direct);

  for (const conversion of conversions) {
    const before = rescale(fromUnit, conversion.from);
    const after = before && rescale(conversion.to, toUnit);
    if (before && after) return then(then(before, own(conversion)), after);
  }
  return ucumConversion(fromUnit, toUnit, chemistryOf(substance));
}
