import { describe, it, expect } from 'vitest';
import { normalizeUnit } from '@services/units/conversion';
import {
  getBiomarkerByKey,
  getBiomarkerForTestValue,
  unknownBiomarkerKey,
  getBiomarkerDisplayName,
  BIOMARKER_DEFINITIONS,
  CATEGORY_NAMES,
  findBiomarker,
  getBiomarkersByCategory,
  searchBiomarkers,
  getCanonicalUnit,
  matchBiomarkerName,
  ANALYTE_GROUPS,
  BARE_ANALYTE_NAMES,
  MEASURED_WITHIN,
  OTHER_TEST_WORDS,
  TEST_WORDS,
  namedSpecimen,
} from './dictionary';

describe('Biomarker Dictionary', () => {
  describe('BIOMARKER_DEFINITIONS', () => {
    it('contains all major biomarker categories', () => {
      const categories = new Set(BIOMARKER_DEFINITIONS.map((b) => b.category));

      expect(categories.has('cbc')).toBe(true);
      expect(categories.has('metabolic')).toBe(true);
      expect(categories.has('lipid')).toBe(true);
      expect(categories.has('thyroid')).toBe(true);
      expect(categories.has('iron')).toBe(true);
      expect(categories.has('vitamin')).toBe(true);
      expect(categories.has('urinalysis')).toBe(true);
    });

    it('has required fields for all biomarkers', () => {
      for (const biomarker of BIOMARKER_DEFINITIONS) {
        expect(biomarker.name).toBeTruthy();
        expect(biomarker.category).toBeTruthy();
        expect(biomarker.canonicalUnit).toBeDefined();
        expect(Array.isArray(biomarker.aliases)).toBe(true);
        expect(Array.isArray(biomarker.alternativeUnits)).toBe(true);
        expect(biomarker.description).toBeTruthy();
      }
    });

    it('contains common CBC biomarkers', () => {
      const cbcNames = getBiomarkersByCategory('cbc').map((b) => b.name);

      expect(cbcNames).toContain('White Blood Cell Count');
      expect(cbcNames).toContain('Red Blood Cell Count');
      expect(cbcNames).toContain('Hemoglobin');
      expect(cbcNames).toContain('Hematocrit');
      expect(cbcNames).toContain('Platelet Count');
      expect(cbcNames).toContain('Mean Corpuscular Volume');
    });

    it('contains common metabolic biomarkers', () => {
      const metabolicNames = getBiomarkersByCategory('metabolic').map((b) => b.name);

      expect(metabolicNames).toContain('Glucose');
      expect(metabolicNames).toContain('Creatinine');
      expect(metabolicNames).toContain('Blood Urea Nitrogen');
      expect(metabolicNames).toContain('Sodium');
      expect(metabolicNames).toContain('Potassium');
    });

    it('contains lipid panel biomarkers', () => {
      const lipidNames = getBiomarkersByCategory('lipid').map((b) => b.name);

      expect(lipidNames).toContain('Total Cholesterol');
      expect(lipidNames).toContain('LDL Cholesterol');
      expect(lipidNames).toContain('HDL Cholesterol');
      expect(lipidNames).toContain('Triglycerides');
    });
  });

  describe('CATEGORY_NAMES', () => {
    it('provides display names for all categories', () => {
      expect(CATEGORY_NAMES.cbc).toBe('Complete Blood Count');
      expect(CATEGORY_NAMES.metabolic).toBe('Metabolic Panel');
      expect(CATEGORY_NAMES.lipid).toBe('Lipid Panel');
      expect(CATEGORY_NAMES.thyroid).toBe('Thyroid Function');
      expect(CATEGORY_NAMES.iron).toBe('Iron Studies');
      expect(CATEGORY_NAMES.vitamin).toBe('Vitamins');
      expect(CATEGORY_NAMES.urinalysis).toBe('Urinalysis');
      expect(CATEGORY_NAMES.other).toBe('Other');
    });
  });

  describe('findBiomarker', () => {
    it('finds biomarker by exact name', () => {
      const glucose = findBiomarker('Glucose');
      expect(glucose).toBeDefined();
      expect(glucose?.name).toBe('Glucose');
    });

    it('finds biomarker by alias', () => {
      const wbc = findBiomarker('WBC');
      expect(wbc).toBeDefined();
      expect(wbc?.name).toBe('White Blood Cell Count');
    });

    it('is case-insensitive', () => {
      const glucose1 = findBiomarker('glucose');
      const glucose2 = findBiomarker('GLUCOSE');
      const glucose3 = findBiomarker('Glucose');

      expect(glucose1?.name).toBe('Glucose');
      expect(glucose2?.name).toBe('Glucose');
      expect(glucose3?.name).toBe('Glucose');
    });

    it('returns undefined for unknown biomarker', () => {
      const unknown = findBiomarker('Unknown Marker');
      expect(unknown).toBeUndefined();
    });

    it('trims whitespace', () => {
      const glucose = findBiomarker('  Glucose  ');
      expect(glucose?.name).toBe('Glucose');
    });
  });

  describe('getBiomarkersByCategory', () => {
    it('returns all biomarkers in a category', () => {
      const cbc = getBiomarkersByCategory('cbc');
      expect(cbc.length).toBeGreaterThan(0);
      expect(cbc.every((b) => b.category === 'cbc')).toBe(true);
    });

    it('returns empty array for category with no biomarkers', () => {
      const other = getBiomarkersByCategory('other');
      expect(Array.isArray(other)).toBe(true);
    });
  });

  describe('searchBiomarkers', () => {
    it('ranks the test the text names exactly first, then names starting with it, then the rest', () => {
      expect(searchBiomarkers('Urea')[0].key).toBe('urea');
      const names = searchBiomarkers('urine').map((d) => d.name.toLowerCase());
      const firstOther = names.findIndex((n) => !n.startsWith('urine'));
      expect(names.slice(firstOther).some((n) => n.startsWith('urine'))).toBe(false);
    });

    it('finds biomarkers by partial name match', () => {
      const results = searchBiomarkers('glucose');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((b) => b.name === 'Glucose')).toBe(true);
    });

    it('finds biomarkers by partial alias match', () => {
      const results = searchBiomarkers('chol');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((b) => b.name.includes('Cholesterol'))).toBe(true);
    });

    it('returns empty array for no matches', () => {
      const results = searchBiomarkers('xyz123notfound');
      expect(results).toEqual([]);
    });

    it('returns empty array for empty query', () => {
      const results = searchBiomarkers('');
      expect(results).toEqual([]);
    });

    it('reads the text as names are read: spacing and accent encoding aside', () => {
      const keys = (query: string) => searchBiomarkers(query).map((d) => d.key);
      expect(keys('vitamin  b')).toEqual(keys('vitamin b'));
      expect(keys('vitamin b').length).toBeGreaterThan(0);
      expect(keys('velocità'.normalize('NFD'))).toEqual(keys('velocità'));
      expect(keys('velocità').length).toBeGreaterThan(0);
    });

    it('is case-insensitive', () => {
      const results1 = searchBiomarkers('hemoglobin');
      const results2 = searchBiomarkers('HEMOGLOBIN');
      expect(results1.length).toBe(results2.length);
    });
  });

  describe('getCanonicalUnit', () => {
    it('returns canonical unit for a biomarker', () => {
      expect(getCanonicalUnit('Glucose')).toBe('mg/dL');
      expect(getCanonicalUnit('Hemoglobin')).toBe('g/dL');
      expect(getCanonicalUnit('TSH')).toBe('mIU/L');
    });

    it('works with aliases', () => {
      expect(getCanonicalUnit('WBC')).toBe('10^9/L');
      expect(getCanonicalUnit('Hgb')).toBe('g/dL');
    });

    it('returns undefined for unknown biomarker', () => {
      expect(getCanonicalUnit('Unknown')).toBeUndefined();
    });
  });



  describe('biomarker keys', () => {
    it('gives every biomarker a unique kebab-case key', () => {
      const keys = BIOMARKER_DEFINITIONS.map((b) => b.key);
      expect(new Set(keys).size).toBe(keys.length);
      keys.forEach((key) => expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
    });

    it('looks up a biomarker by key', () => {
      expect(getBiomarkerByKey('glucose')?.name).toBe('Glucose');
      expect(getBiomarkerByKey('no-such-key')).toBeUndefined();
    });

    it('names a test value by its dictionary entry, else its extracted text', () => {
      expect(getBiomarkerDisplayName({ biomarkerKey: 'glucose', rawText: 'GLU' })).toBe('Glucose');
      expect(getBiomarkerDisplayName({ biomarkerKey: 'unknown:zorb', rawText: 'Zorb' })).toBe('Zorb');
      expect(getBiomarkerDisplayName({ biomarkerKey: 'unknown:zorb', rawText: '' })).toBe(
        'Unknown biomarker'
      );
    });

    it('builds stable keys for unknown biomarkers', () => {
      expect(unknownBiomarkerKey('Zorblatin')).toBe('unknown:zorblatin');
      expect(unknownBiomarkerKey('  Zorb-latin (serum) ')).toBe('unknown:zorblatinserum');
    });

    it('keeps percentage and absolute-count variants apart', () => {
      // e.g. "IG%" vs "IG#"
      expect(unknownBiomarkerKey('IG%')).not.toBe(unknownBiomarkerKey('IG#'));
      expect(unknownBiomarkerKey('IG%')).toBe('unknown:ig%');
      expect(unknownBiomarkerKey('IG#')).toBe('unknown:ig#');
    });

    it('gives the same key to the same name in different Unicode forms', () => {
      const composed = 'Glicemia à digiuno'.normalize('NFC');
      const decomposed = 'Glicemia à digiuno'.normalize('NFD');
      expect(unknownBiomarkerKey(decomposed)).toBe(unknownBiomarkerKey(composed));
    });

    it('keeps combining marks that distinguish names', () => {
      // Devanagari vowel signs are combining marks; dropping them merges names
      expect(unknownBiomarkerKey('रक्त')).not.toBe(unknownBiomarkerKey('रकत'));
    });

    it('never builds an empty unknown key', () => {
      expect(unknownBiomarkerKey('—')).toBe('unknown:unnamed');
      expect(unknownBiomarkerKey('')).toBe('unknown:unnamed');
      // Non-Latin names keep their letters
      expect(unknownBiomarkerKey('血糖')).toBe('unknown:血糖');
    });

    it('identifies a stored value by its key only, never by its extracted text', () => {
      // Stored values carry their printed name, which never files them under a test
      const stored = (biomarkerKey: string, rawText: string) => ({ biomarkerKey, rawText });
      expect(getBiomarkerForTestValue(stored('hemoglobin', 'Hemo-globin'))?.name).toBe('Hemoglobin');
      expect(getBiomarkerForTestValue(stored('unknown:bloodsugar', 'Blood Sugar'))).toBeUndefined();
      expect(getBiomarkerDisplayName(stored('unknown:glucose', 'Glucose'))).toBe('Glucose');
      expect(getBiomarkerForTestValue(stored('unknown:zorblatin', 'Zorblatin'))).toBeUndefined();
    });

  });
});

describe('matchBiomarkerName with a qualifier', () => {
  const keyOf = (name: string) => matchBiomarkerName(name)?.key;

  it('matches the specimen a qualifier names', () => {
    expect(keyOf('Creatinina (urine, per litro)')).toBe('urine-creatinine');
    expect(keyOf('Creatinina (urine, spot)')).toBe('urine-creatinine');
    expect(keyOf('Creatinina (urine, 24h)')).toBe('24-hour-urine-creatinine');
    expect(keyOf('Urea (urine, per litro)')).toBe('urine-urea');
    expect(keyOf('Urea (urine, 24 ore)')).toBe('24-hour-urine-urea');
    expect(keyOf('Albumina/creatinina (urine)')).toBe('albumin-creatinine-ratio');
  });

  it('never falls back to the blood test for a urine qualifier', () => {
    expect(keyOf('Bilirubina diretta (urine, spot)')).toBeUndefined();
  });

  it('ignores a qualifier that only says it is the blood test, or its total', () => {
    expect(keyOf('Vitamina D (25-OH, totale)')).toBe('vitamin-d');
    expect(keyOf('Glucosio (siero)')).toBe('glucose');
    expect(keyOf('Creatinine (serum)')).toBe('creatinine');
    expect(keyOf('Bilirubin (tot.)')).toBe('bilirubin-total');
    expect(keyOf('Bilirubin (total)')).toBe('bilirubin-total');
  });

  it("ignores a qualifier that restates the test: its abbreviation, specimen or method", () => {
    for (const name of [
      'Emoglobina (HGB)',
      'Ematocrito (HCT)',
      'Leucociti (WBC)',
      'Tireotropina (TSH)',
      'Gamma GT (GGT)',
      'Urea (UREA)',
      'Bilirubin (TBIL)',
      'Creatinina (sierica)',
      'Sodio (siero/plasma)',
      'Glucosio (a digiuno)',
      'eGFR (CKD-EPI)',
      'Vitamina D (25 OH)',
      'Rapporto proteine/creatinina (PCR)',
      'Glucosio (sangue venoso)',
      'Glucose (fasting plasma)',
      'eGFR (CKD-EPI 2021)',
      'Emoglobina glicata (IFCC)',
      'Creatinina (metodo enzimatico)',
      'Vitamina D (25-OHD)',
      'Vitamina D (25OHD)',
      'eGFR (CKDEPI)',
      'GGT (IFCC)',
      'AST (IFCC)',
      'ALT (IFCC)',
      'Gamma GT (siero, IFCC)',
      'ALP (IFCC method)',
      'Glucosio (siero a digiuno)',
      'Glicemia (digiuno)',
      'Glucose (plasma fasting)',
      'Calcio (sierico totale)',
      'Creatinine (enzymatic method)',
      'HbA1c (IFCC method)',
      'Vitamina D (25-OH totale)',
      'eGFR (CKD-EPI, 2021)',
      'Sodio (sangue  venoso)',
      'Sodio (sangue\tvenoso)',
      'Glucosio (a\u00a0digiuno)',
      'eGFR (CKD-EPI  2021)',
      'eGFR (CKD EPI)',
      'eGFR (CKD EPI 2021)',
      'eGFR (CKD -EPI)',
      'Vitamina D (25 -OH)',
    ]) {
      const base = keyOf(name.replace(/\s*\(.*\)$/, ''));
      expect(base, name).toBeDefined();
      expect(keyOf(name), name).toBe(base);
    }
  });

  it('never files a blood value under a urine test by a blood-specimen qualifier', () => {
    for (const name of [
      'pH (venoso)',
      'pH (capillare)',
      'pH (siero/plasma)',
      'pH (intero)',
      'pH (whole)',
      'Blood (whole)',
      'Chetoni (plasmatica)',
      'Protein (serum/plasma)',
    ]) {
      expect(keyOf(name), name).toBeUndefined();
    }
  });

  it("never takes a lone fragment, or another test's method, for the same test", () => {
    // "(D)" is direct bilirubin; IFCC and DCCT are HbA1c's units, not hemoglobin's
    expect(keyOf('Bilirubin (D)')).toBeUndefined();
    expect(keyOf('Emoglobina (IFCC)')).toBeUndefined();
    expect(keyOf('Emoglobina (DCCT)')).toBeUndefined();
    expect(keyOf('Glucosio (2021)')).toBeUndefined();
    expect(keyOf('Glucosio (a)')).toBeUndefined();
  });

  it('never takes a method naming another test, or an unknown method, for the same test', () => {
    for (const name of [
      'Calcio (metodo ionizzato)',
      'Colesterolo (metodo HDL)',
      'Bilirubin (method direct)',
      'Emoglobina (metodo IFCC)',
      'Emoglobina (metodo HPLC)',
    ]) {
      expect(keyOf(name), name).toBeUndefined();
    }
  });

  it('never takes a qualifier that names another test for the base test', () => {
    for (const name of [
      'Cholesterol (HDL)',
      'Colesterolo (LDL)',
      'Colesterolo (non HDL)',
      'Calcio (ionizzato)',
      'Bilirubin (indirect)',
      'Bilirubin (direct)',
    ]) {
      const base = keyOf(name.replace(/\s*\(.*\)$/, ''));
      // No test, or another test than the base name's
      expect(keyOf(name) === undefined || keyOf(name) !== base, name).toBe(true);
    }
    expect(keyOf('Cholesterol (HDL)')).toBeUndefined();
    expect(keyOf('Calcio (ionizzato)')).toBeUndefined();
  });
});

describe('Italian names', () => {
  it.each([
    ['Urea', 'urea'],
    ['Acido urico', 'uric-acid'],
    ['Ferro', 'serum-iron'],
    ['Vitamina D (25-OH)', 'vitamin-d'],
    ['Eritroblasti', 'nucleated-red-blood-cells'],
    ['Eritroblasti (%)', 'nucleated-red-blood-cells-percentage'],
    ['Reticolociti', 'reticulocytes'],
    ['Reticolociti (%)', 'reticulocytes-percentage'],
    ['Reticulocytes (%)', 'reticulocytes-percentage'],
    // A 24-hour urine collection: its concentration and its amount per day
    ['Creatinina/L (urine 24h)', 'urine-creatinine'],
    ['Creatinina 24h (urine)', '24-hour-urine-creatinine'],
    ['Urea/L (urine 24h)', 'urine-urea'],
    ['Urea 24h (urine)', '24-hour-urine-urea'],
    // As the report itself prints them, under its timed urine collections
    ['Creatinina/L (urine)', 'urine-creatinine'],
    ['Urea/L (urine)', 'urine-urea'],
    ['U-Creatinina/L', 'urine-creatinine'],
    ['Densità Relativa (urine)', 'urine-specific-gravity'],
    ['U-Urea/L', 'urine-urea'],
    ['U-Proteine totali/L', 'urine-protein'],
    ['Emoglobina (urine)', 'urine-blood'],
    ['Eritrociti (urine)', 'urine-red-blood-cells'],
  ])('%s is %s', (name, key) => {
    expect(matchBiomarkerName(name)?.key).toBe(key);
  });

  it('does not take urea for blood urea nitrogen, a different measurement', () => {
    expect(findBiomarker('BUN')?.key).toBe('blood-urea-nitrogen');
    expect(findBiomarker('Urea')?.key).toBe('urea');
  });
});


describe('units each test lists', () => {
  it('lists each unit once, not again in another spelling', () => {
    const repeated = BIOMARKER_DEFINITIONS.flatMap((definition) => {
      const units = [definition.canonicalUnit, ...(definition.alternativeUnits ?? [])]
        .filter(Boolean)
        .map((unit) => normalizeUnit(unit).toLowerCase());
      return units.length === new Set(units).size ? [] : [definition.key];
    });
    expect(repeated).toEqual([]);
  });
});

describe('findBiomarker reads a name as printed', () => {
  it('whatever its inner spacing or accent encoding', () => {
    expect(findBiomarker('Globuli  rossi')?.key).toBe('red-blood-cell-count');
    expect(findBiomarker('Globuli\u00a0rossi')?.key).toBe('red-blood-cell-count');
    const esr = findBiomarker('Velocità di eritrosedimentazione'.normalize('NFC'));
    expect(esr).toBeDefined();
    expect(findBiomarker('Velocità di eritrosedimentazione'.normalize('NFD'))?.key).toBe(esr?.key);
  });
});

describe('names the AI writes for urine tests', () => {
  it.each([
    ['Urine Albumin', 'microalbumin'],
    ['Albumin (urine)', 'microalbumin'],
    ['Globuli rossi (urine)', 'urine-red-blood-cells'],
    ['Urine Erythrocytes', 'urine-red-blood-cells'],
    ['Globuli bianchi (urine)', 'urine-wbc'],
    ['Urine RBC (Esame morfologico - eritrociti per campo)', 'urine-red-blood-cells'],
  ])('%s is %s', (name, key) => {
    expect(matchBiomarkerName(name)?.key).toBe(key);
  });

  it.each([
    ['Protein (urine)', 'urine-protein'],
    ['Creatinine (urine)', 'urine-creatinine'],
    ['Glucose (urine)', 'urine-glucose'],
    ['Creatinine (urine, 24h)', '24-hour-urine-creatinine'],
    ['Urea (urine)', 'urine-urea'],
  ])('%s is %s, as the analyte in that urine specimen', (name, key) => {
    expect(matchBiomarkerName(name)?.key).toBe(key);
  });

  it('reads accented letters in either encoding, marks aside', () => {
    expect(matchBiomarkerName('Créatinine'.normalize('NFC'))?.key).toBe('creatinine');
    expect(matchBiomarkerName('Créatinine'.normalize('NFD'))?.key).toBe('creatinine');
  });
});

describe('matchBiomarkerName: specimen words and own names in a qualifier', () => {
  it.each([
    ['Trigliceridi (sierici)', 'triglycerides'],
    ['Colesterolo (sierici)', 'total-cholesterol'],
    ['Proteine totali (plasmatiche)', 'total-protein'],
    ['Rapporto proteine/creatinina (P.C.R.)', 'protein-creatinine-ratio'],
    ['Neutrofili %', 'neutrophils-percentage'],
    ['Linfociti%', 'lymphocytes-percentage'],
  ])('%s is %s', (name, key) => {
    expect(matchBiomarkerName(name)?.key).toBe(key);
  });
});

describe('matchBiomarkerName: a 24-hour name with a urine qualifier', () => {
  it('stays the 24-hour test or none, never the spot one', () => {
    for (const name of ['Creatininuria 24h (urine)', 'U-Creatinina 24h (urine)', 'Albuminuria 24h (urine)',
      '24h Albumin (urine)', 'Azoturia 24h (urine)']) {
      const test = matchBiomarkerName(name);
      expect(test === undefined || test.specimenType === 'urine-24h', `${name}: ${test?.key}`).toBe(true);
    }
  });
});

describe('cell count plurals', () => {
  it('reads "WBCs" and "RBCs" as the counts', () => {
    expect(findBiomarker('WBCs')?.key).toBe('white-blood-cell-count');
    expect(findBiomarker('RBCs')?.key).toBe('red-blood-cell-count');
  });
});

describe('namedSpecimen', () => {
  it.each([
    ['pH (sperma)', 'semen'],
    ['Volume eiaculato', 'semen'],
    ['Creatinina (s)', 'blood'],
    ['Creatinina (S)', 'blood'],
    ['Creatinina (s/p)', 'blood'],
    ['s-Creatinina', 'blood'],
    ['ERYTHROCYTE(S)', undefined],
    ['WBC(s)', undefined],
    ['RBC(S)', undefined],
    ['Leucociti (S)', 'blood'],
    ['Glucosio (a digiuno)', 'blood'],
    ['Erythrocyte (s)', undefined],
    ['White Blood Cells', undefined],
  ])('%s says %s', (name, specimen) => {
    expect(namedSpecimen(name)).toBe(specimen);
  });
});

describe('analyte groups', () => {
  it('have bare names that are each a test of a group', () => {
    for (const name of BARE_ANALYTE_NAMES) {
      const test = matchBiomarkerName(name);
      const grouped = test !== undefined && Object.values(ANALYTE_GROUPS).some((keys) => keys.includes(test.key));
      expect(grouped, name).toBe(true);
    }
  });

  it('name only tests the dictionary has', () => {
    for (const [analyte, keys] of Object.entries(ANALYTE_GROUPS)) {
      for (const key of keys) expect(getBiomarkerByKey(key), `${analyte}: ${key}`).toBeDefined();
    }
  });

  it('keep their other tables to tests and analytes the dictionary has', () => {
    for (const [key, analytes] of Object.entries(MEASURED_WITHIN)) {
      expect(getBiomarkerByKey(key), key).toBeDefined();
      for (const analyte of analytes) expect(ANALYTE_GROUPS[analyte], `${key}: ${analyte}`).toBeDefined();
    }
    for (const key of [...Object.keys(TEST_WORDS), ...Object.keys(OTHER_TEST_WORDS)]) {
      expect(getBiomarkerByKey(key), key).toBeDefined();
    }
  });
});
