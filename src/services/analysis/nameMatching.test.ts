import { describe, it, expect } from 'vitest';
import { getBiomarkerByKey } from '@data/biomarkers/dictionary';
import { UNIT_PAIRS, nameSuggestion, testOfName } from './nameMatching';

describe('testOfName', () => {
  it('reads a name with its unit: a count in % is its percentage', () => {
    expect(testOfName('Neutrophils', '%')?.key).toBe('neutrophils-percentage');
    expect(testOfName('Glucose', 'mmol/L')?.key).toBe('glucose');
  });

  it('never takes a name qualified as another test for its base test', () => {
    expect(testOfName('Cholesterol (HDL)', 'mg/dL')).toBeUndefined();
    expect(testOfName('Calcio (ionizzato)', 'mmol/L')).toBeUndefined();
  });

  it('gives no test for a unit none of its tests fits', () => {
    expect(testOfName('Glucose', 'mmol/24h')).toBeUndefined();
  });
});

describe('nameSuggestion', () => {
  const noFit = { fitting: false };

  it('suggests the test a name is exactly, of the same specimen, in a unit it is not measured in', () => {
    const hematocrit = getBiomarkerByKey('hematocrit')!;
    expect(nameSuggestion({ name: 'Emoglobina', value: 43, unit: '%', confidence: 1 }, hematocrit, undefined, noFit)?.key)
      .toBe('hemoglobin');
  });

  it('suggests the test a name is exactly across specimens: glucose is not HbA1c', () => {
    const hba1c = getBiomarkerByKey('hemoglobin-a1c')!;
    const value = { name: 'Glicemia', value: 6.1, unit: '%', confidence: 1 };
    expect(nameSuggestion(value, hba1c, undefined, noFit)?.key).toBe('glucose');
  });

  it("does not question a urine test the AI keyed by the bare analyte's name", () => {
    const perDay = getBiomarkerByKey('24-hour-urine-creatinine')!;
    const value = { name: 'Creatinina', value: 1.2, unit: 'g/24h', confidence: 1 };
    expect(nameSuggestion(value, perDay, undefined, noFit)).toBeUndefined();
  });

  it('does not question urine tests reports print by the bare analyte, or by one of their own names', () => {
    const cases: [string, string, string][] = [
      ['Urea', 'g/24h', '24-hour-urine-urea'],
      ['Creatinina', 'g/24h', '24-hour-urine-creatinine'],
      ['PCR', 'mg/g', 'protein-creatinine-ratio'],
    ];
    for (const [name, unit, key] of cases) {
      const value = { name, value: 1, unit, confidence: 1 };
      expect(nameSuggestion(value, getBiomarkerByKey(key)!, undefined, noFit), name).toBeUndefined();
    }
  });

  it('does not question English urinalysis names keyed as the urine test', () => {
    const cases: [string, string, string][] = [
      ['WBC', 'WBC/HPF', 'urine-wbc'],
      ['RBC', 'RBC/HPF', 'urine-red-blood-cells'],
      ['Creatinine', 'mg/24h', '24-hour-urine-creatinine'],
      ['Albumin', 'mg/L', 'microalbumin'],
      ['Protein', 'g/dL', 'total-protein'],
      ['Globuli rossi', 'per campo', 'urine-red-blood-cells'],
      ['U-Albumina (albuminuria)', 'mg/24h', '24-hour-urine-albumin'],
    ];
    for (const [name, unit, key] of cases) {
      const value = { name, value: 1, unit, confidence: 1 };
      expect(nameSuggestion(value, getBiomarkerByKey(key)!, undefined, noFit), name).toBeUndefined();
    }
  });

  it('questions an AI test in another specimen that measures something else', () => {
    const cases: [string, string, string, string][] = [
      ['Sodio', 'mmol/24h', '24-hour-urine-urea', 'sodium'],
      ['Calcio', 'mg/24h', '24-hour-urine-albumin', 'calcium'],
      // What the name is in the test's specimen, when its unit fits that test
      ['Creatinina', 'g/24h', '24-hour-urine-urea', '24-hour-urine-creatinine'],
      ['Urea', 'g/24h', '24-hour-urine-creatinine', '24-hour-urine-urea'],
      ['Urea', 'g/L', 'urine-creatinine', 'urine-urea'],
    ];
    for (const [name, unit, key, suggested] of cases) {
      const value = { name, value: 1, unit, confidence: 1 };
      expect(nameSuggestion(value, getBiomarkerByKey(key)!, undefined, noFit)?.key, name).toBe(suggested);
    }
  });

  it('does not question a correctly keyed urine dipstick value by a blood count of its name', () => {
    const cases: [string, string, string][] = [
      ['Leucociti', '', 'urine-leukocyte-esterase'],
      ['Leukocytes', '', 'urine-leukocyte-esterase'],
      ['WBC', '', 'urine-leukocyte-esterase'],
      ['Eritrociti', 'Ery/µL', 'urine-blood'],
      ['Erythrocytes', 'Ery/µL', 'urine-blood'],
      ['Globuli bianchi', '', 'urine-leukocyte-esterase'],
    ];
    for (const [name, unit, key] of cases) {
      const value = { name, value: 1, unit, confidence: 1 };
      expect(nameSuggestion(value, getBiomarkerByKey(key)!, undefined, noFit), name).toBeUndefined();
    }
  });

  it('questions an AI test in another specimen than the one the printed name says', () => {
    const cases: [string, string, string][] = [
      ['Emoglobina (urine)', 'g/dL', 'hemoglobin'],
      ['Proteine (urine)', 'g/dL', 'total-protein'],
      ['Proteinuria', 'g/dL', 'total-protein'],
      ['Albumina (24 ore)', 'g/dL', 'albumin'],
      ['Creatinina (venoso)', 'g/24h', '24-hour-urine-creatinine'],
      ['Creatinine (whole blood)', 'g/24h', '24-hour-urine-creatinine'],
      ['S-Creatinina', 'g/24h', '24-hour-urine-creatinine'],
      ['Creatinina (S)', 'g/24h', '24-hour-urine-creatinine'],
    ];
    for (const [name, unit, key] of cases) {
      const value = { name, value: 1, unit, confidence: 1 };
      expect(nameSuggestion(value, getBiomarkerByKey(key)!, undefined, noFit), name).toBeDefined();
    }
  });

  it('questions a qualified name that is another test, as the bare name', () => {
    const hba1c = getBiomarkerByKey('hemoglobin-a1c')!;
    for (const name of ['Glicemia (a digiuno)', 'Glucosio (siero)']) {
      const value = { name, value: 6.1, unit: '%', confidence: 1 };
      expect(nameSuggestion(value, hba1c, undefined, noFit)?.key, name).toBe('glucose');
    }
  });

  it('suggests a learned test only in a unit it fits', () => {
    const learned = () => getBiomarkerByKey('urine-protein');
    const total = getBiomarkerByKey('total-protein')!;
    const value = { name: 'Proteine', value: 7.1, unit: 'g/dL', confidence: 1 };
    expect(nameSuggestion(value, total, learned, noFit)).toBeUndefined();
  });
});

describe('nameSuggestion across specimens, by what the tests measure', () => {
  const noFit = { fitting: false };
  const suggested = (name: string, unit: string, key: string) =>
    nameSuggestion({ name, value: 1, unit, confidence: 1 }, getBiomarkerByKey(key)!, undefined, noFit)?.key;

  it('questions an AI test that measures something else than the printed name, also in one specimen family', () => {
    const cases: [string, string, string, string][] = [
      ['Proteine (urine)', 'mg/24h', '24-hour-urine-albumin', 'urine-protein'],
      ['Glucosio (urine)', 'g/24h', '24-hour-urine-creatinine', 'urine-glucose'],
      ['Leucociti', 'per campo', 'urine-red-blood-cells', 'urine-wbc'],
      ['Urea', 'mg/24h', '24-hour-urine-creatinine', '24-hour-urine-urea'],
      ['Protein', 'g/dL', 'albumin', 'total-protein'],
      ['Albumina 24h', 'g/L', 'albumin', '24-hour-urine-albumin'],
    ];
    for (const [name, unit, key, expected] of cases) expect(suggested(name, unit, key), name).toBe(expected);
    expect(suggested('Leucociti', '', 'urine-nitrites')).toBeDefined();
    expect(suggested('Eritrociti', '', 'urine-leukocyte-esterase')).toBeDefined();
    expect(suggested('Microalbumin', 'mg/dL', 'creatinine')).toBeDefined();
  });

  it('does not question an AI test that measures what the printed name does, however it is spelled', () => {
    const cases: [string, string, string][] = [
      ['Microalbumina', 'mg/24h', '24-hour-urine-albumin'],
      ['MAU', 'mg/24h', '24-hour-urine-albumin'],
      ['Creatinina (metodo enzimatico)', 'g/24h', '24-hour-urine-creatinine'],
      ['Urea (totale)', 'g/24h', '24-hour-urine-urea'],
      ['Hb', 'Ery/µL', 'urine-blood'],
      ['Total Protein', 'mg/dL', 'urine-protein'],
      ['Creatinina *', 'g/24h', '24-hour-urine-creatinine'],
      ['Eritrociti *', '/HPF', 'urine-red-blood-cells'],
      ['Albumina 24h', 'mg/L', 'microalbumin'],
      ['Erythrocyte(s)', '/HPF', 'urine-red-blood-cells'],
      ['Leukocyte(s)', 'WBC/HPF', 'urine-wbc'],
      ['Globuli bianchi (urine)', '', 'urine-leukocyte-esterase'],
      ['Globuli rossi (urine)', 'Ery/µL', 'urine-blood'],
      ['Urine Erythrocytes', 'Ery/µL', 'urine-blood'],
      ['Urine Albumin', 'mg/g', 'albumin-creatinine-ratio'],
    ];
    for (const [name, unit, key] of cases) expect(suggested(name, unit, key), name).toBeUndefined();
  });

  it("does not question one of the test's own names, marks aside", () => {
    for (const name of ['PCR', 'PCR *', 'PCR.', 'P.C.R.', 'pcr:']) {
      expect(suggested(name, 'mg/g', 'protein-creatinine-ratio'), name).toBeUndefined();
    }
  });
});

describe('nameSuggestion: what a printed name says', () => {
  const noFit = { fitting: false };
  const suggested = (name: string, unit: string, key: string) =>
    nameSuggestion({ name, value: 1, unit, confidence: 1 }, getBiomarkerByKey(key)!, undefined, noFit)?.key;

  it('reads a blood specimen anywhere in the name', () => {
    expect(suggested('Urea plasmatica', 'g/L', 'urine-urea')).toBe('urea');
    for (const name of ['Serum Creatinine', 'S - Creatinina', 'Creatinina (siero) (metodo enzimatico)',
      'Creatinina (S/P)', 'Creatinina(S)']) {
      expect(suggested(name, 'g/24h', '24-hour-urine-creatinine'), name).toBe('creatinine');
    }
    expect(suggested('Urea sierica', 'g/24h', '24-hour-urine-urea')).toBe('urea');
    expect(suggested('Serum Albumin', 'mg/L', 'microalbumin')).toBe('albumin');
  });

  it('takes neither a plural nor a cell name for a blood specimen', () => {
    expect(suggested('Erythrocyte (s)', '/HPF', 'urine-red-blood-cells')).toBeUndefined();
    expect(suggested('White Blood Cells', 'WBC/HPF', 'urine-wbc')).toBeUndefined();
  });

  it("keeps a percentage's name apart from its count's", () => {
    expect(suggested('Neutrofili (%)', '10^9/L', 'neutrophils')).toBe('neutrophils-percentage');
  });

  it('questions a dipstick pad printed for a microscopy count', () => {
    expect(suggested('Esterasi leucocitaria', '/µL', 'urine-wbc')).toBe('urine-leukocyte-esterase');
    expect(suggested('Emoglobina (urine)', '/HPF', 'urine-red-blood-cells')).toBe('urine-blood');
  });

  it('suggests the test the name says, in the specimen it says', () => {
    expect(suggested('Emoglobina (urine)', '%', 'hematocrit')).toBe('urine-blood');
    expect(suggested('Proteine (urine)', 'g/dL', 'albumin')).toBe('urine-protein');
    expect(suggested('Globuli bianchi (urine)', 'cells/µL', 'white-blood-cell-count')).toBe('urine-wbc');
  });

  it('does not question the urine or semen test of a bare name that fits both', () => {
    expect(suggested('Glucose', 'mg/dL', 'urine-glucose')).toBeUndefined();
    expect(suggested('pH', '', 'semen-ph')).toBeUndefined();
    expect(suggested('Volume', 'L', 'urine-volume')).toBeUndefined();
  });

  it('does not question urine names the dictionary knows, keyed as what they measure', () => {
    const cases: [string, string, string][] = [
      ['Microalbumina', 'mg/g', 'albumin-creatinine-ratio'],
      ['U-Albumina', 'mg/g', 'albumin-creatinine-ratio'],
      ['MAU', 'mg/g', 'albumin-creatinine-ratio'],
      ['Leucociti (urine)', '', 'urine-leukocyte-esterase'],
      ['Eritrociti (urine)', 'Ery/µL', 'urine-blood'],
      ['Urine RBC', 'Ery/µL', 'urine-blood'],
    ];
    for (const [name, unit, key] of cases) expect(suggested(name, unit, key), name).toBeUndefined();
  });
});

describe('nameSuggestion: round 10', () => {
  const ask = (name: string, unit: string, key: string, fitting = false) =>
    nameSuggestion({ name, value: 1, unit, confidence: 1 }, getBiomarkerByKey(key)!, undefined, { fitting })?.key;

  it("says the test a fitting unit gives the name, also when the name is what the AI's test measures", () => {
    expect(ask('Leucociti', '10^9/L', 'urine-wbc', true)).toBe('white-blood-cell-count');
    expect(ask('Emoglobina', 'g/dL', 'urine-blood', true)).toBe('hemoglobin');
    expect(ask('ACR', 'mg/g', 'microalbumin', true)).toBe('albumin-creatinine-ratio');
    expect(ask('Total Protein', 'g/dL', 'urine-protein', true)).toBe('total-protein');
  });

  it('questions a blood name keyed as the urine test of its analyte', () => {
    const cases: [string, string, string, string][] = [
      ['Glicemia', 'mg/dL', 'urine-glucose', 'glucose'],
      ['Glicemia a digiuno', 'mg/dL', 'urine-glucose', 'glucose'],
      ['Blood Glucose', 'mg/dL', 'urine-glucose', 'glucose'],
      ['Blood Sugar', 'mg/dL', 'urine-glucose', 'glucose'],
      ['FBG', 'mg/dL', 'urine-glucose', 'glucose'],
      ['Creatininemia', 'mg/dL', 'urine-creatinine', 'creatinine'],
      ['Protidemia', 'g/L', 'urine-protein', 'total-protein'],
    ];
    for (const [name, unit, key, expected] of cases) expect(ask(name, unit, key), name).toBe(expected);
  });

  it('questions a semen name keyed as the urine test', () => {
    for (const name of ['pH seminale', 'pH sperma', 'Semen pH']) expect(ask(name, '', 'urine-ph'), name).toBe('semen-ph');
    for (const name of ['Semen Volume', 'Volume eiaculato', 'Ejaculate Volume']) {
      expect(ask(name, 'mL', 'urine-volume'), name).toBe('semen-volume');
    }
  });

  it("questions a ratio's name keyed as a concentration, not the other way round", () => {
    expect(ask('ACR', 'mg/L', 'microalbumin')).toBe('albumin-creatinine-ratio');
    expect(ask('UACR', 'mg/L', 'microalbumin')).toBe('albumin-creatinine-ratio');
    expect(ask('Rapporto proteine/creatinina', 'mg/dL', 'urine-protein')).toBe('protein-creatinine-ratio');
    expect(ask('Microalbumina', 'mg/g', 'albumin-creatinine-ratio')).toBeUndefined();
  });

  it('reads a lone S or P as a specimen whatever its case, and a plural only after a cell name', () => {
    expect(ask('ERYTHROCYTE(S)', 'RBC/HPF', 'urine-red-blood-cells')).toBeUndefined();
    expect(ask('LEUKOCYTE(S)', 'WBC/HPF', 'urine-wbc')).toBeUndefined();
    expect(ask('WBC(S)', 'WBC/HPF', 'urine-wbc')).toBeUndefined();
    expect(ask('Creatinina (s)', 'g/24h', '24-hour-urine-creatinine')).toBe('creatinine');
    expect(ask('Creatinina (p)', 'g/24h', '24-hour-urine-creatinine')).toBe('creatinine');
    expect(ask('s-creatinina', 'g/24h', '24-hour-urine-creatinine')).toBe('creatinine');
  });

  it("suggests the dipstick pad of a bare name when the unit fits the pad", () => {
    expect(ask('Emoglobina', 'mg/dL', 'urine-ketones')).toBe('urine-blood');
    expect(ask('Leucociti', '', 'urine-nitrites')).toBe('urine-leukocyte-esterase');
  });

  it("suggests what a urine name is in the AI test's urine collection", () => {
    for (const name of ['U-Albumina', 'Microalbuminuria', 'Albumina urinaria', 'Urine Albumin']) {
      expect(ask(name, 'mg/24h', '24-hour-urine-creatinine'), name).toBe('24-hour-urine-albumin');
    }
  });

  it("keeps a percentage's name apart from its count's however it prints the %", () => {
    for (const name of ['Neutrofili %', 'Neutrofili%', 'Neutrofili (%)']) {
      expect(ask(name, '10^9/L', 'neutrophils'), name).toBe('neutrophils-percentage');
    }
    expect(ask('Linfociti %', '10^9/L', 'lymphocytes')).toBe('lymphocytes-percentage');
  });

  it("sets a footnote's # aside", () => {
    expect(ask('PCR #', 'mg/mmol', 'protein-creatinine-ratio')).toBeUndefined();
    expect(ask('PCR (#)', 'mg/mmol', 'protein-creatinine-ratio')).toBeUndefined();
  });
});

describe('nameSuggestion: final review', () => {
  const ask = (name: string, unit: string, key: string, fitting = false) =>
    nameSuggestion({ name, value: 1, unit, confidence: 1 }, getBiomarkerByKey(key)!, undefined, { fitting })?.key;

  it("suggests a 24-hour name's own test, not the spot one", () => {
    expect(ask('Creatinina 24h', '', 'urine-ph')).toBe('24-hour-urine-creatinine');
    expect(ask('Albumina 24h', '', 'urine-ph')).toBe('24-hour-urine-albumin');
    expect(ask('Urea 24h', '', 'urine-ph')).toBe('24-hour-urine-urea');
  });

  it("suggests the analyte in the AI test's specimen when the unit fits it there", () => {
    expect(ask('Leukocytes', 'cells/µL', 'urine-leukocyte-esterase', true)).toBe('urine-wbc');
    expect(ask('WBC', 'cells/µL', 'urine-leukocyte-esterase', true)).toBe('urine-wbc');
  });

  it('reads an Italian plural followed by (S) as serum', () => {
    expect(ask('Leucociti (S)', '/µL', 'urine-wbc')).toBe('white-blood-cell-count');
    expect(ask('Eritrociti (S)', '/HPF', 'urine-red-blood-cells')).toBeDefined();
  });

  it('questions a fasting name keyed as the urine test', () => {
    expect(ask('Glucosio (a digiuno)', 'mg/dL', 'urine-glucose')).toBe('glucose');
    expect(ask('Glucose (fasting)', 'mg/dL', 'urine-glucose')).toBe('glucose');
  });
});

describe('tests reported alike', () => {
  it('pair only tests the dictionary has', () => {
    for (const [key, alike] of Object.entries(UNIT_PAIRS)) {
      expect(getBiomarkerByKey(key), key).toBeDefined();
      expect(getBiomarkerByKey(alike), alike).toBeDefined();
    }
  });
});
