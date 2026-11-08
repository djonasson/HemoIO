import { describe, it, expect, beforeAll } from 'vitest';
import { loadCatalog, type Catalog } from '@data/loinc/catalog';
import { clusterMeasurements, groupUnit, isSettled, settleGroup, type ComparableValue } from './sameMeasurement';
import type { MatchedBiomarker } from './LabReportAnalyzer';

let catalog: Catalog;

beforeAll(async () => {
  catalog = await loadCatalog();
});

function value(name: string, amount: number, unit: string, loincCode?: string): MatchedBiomarker {
  return { name, value: amount, unit, confidence: 0.95, loincCode, candidates: [] };
}

/** A value as compared: with a number in the group's unit, or none when it cannot be converted */
function compared(biomarker: MatchedBiomarker, comparison?: number): ComparableValue {
  return { biomarker, comparison, converted: comparison, allowance: 0 };
}

describe('isSettled', () => {
  const settled = (values: ComparableValue[]): boolean => isSettled(values, clusterMeasurements(values));

  it('settles one measurement, and distinct ones under distinct printed names', () => {
    expect(settled([compared(value('Vit D', 30, 'ng/mL', 'A'), 30), compared(value('Vit D', 30, 'ng/mL', 'A'), 30)])).toBe(true);
    expect(settled([compared(value('Spot', 1, 'g/L', 'A'), 1), compared(value('Daily', 5, 'g/L', 'A'), 5)])).toBe(true);
  });

  it('keeps two estimates qualified apart in brackets, however close: "eGFR (Schwartz)" and "eGFR (EKFC)"', () => {
    const values = [
      compared(value('eGFR (Schwartz)', 81, 'mL/min/{1.73_m2}', '69405-9'), 81),
      compared(value('eGFR (EKFC)', 82, 'mL/min/{1.73_m2}', '69405-9'), 82),
    ];
    expect(clusterMeasurements(values)).toHaveLength(2);
    expect(settled(values)).toBe(true);
  });

  it('keeps two estimates however printed: "eGFR EKFC" and "eGFR - Schwartz"', () => {
    const values = [
      compared(value('eGFR EKFC', 81, 'mL/min/{1.73_m2}', '69405-9'), 81),
      compared(value('eGFR - Schwartz', 82, 'mL/min/{1.73_m2}', '69405-9'), 82),
    ];
    expect(clusterMeasurements(values)).toHaveLength(2);
    expect(settled(values)).toBe(true);
  });

  it('still merges one value printed twice under bracket wordings that say the same: "Emoglobina (HGB)", "Emoglobina (Hb)"', () => {
    const values = [
      compared(value('Emoglobina (HGB)', 14.2, 'g/dL', '718-7'), 14.2),
      compared(value('Emoglobina (Hb)', 14.2, 'g/dL', '718-7'), 14.2),
    ];
    expect(clusterMeasurements(values)).toHaveLength(1);
  });

  it('calls two measurements of one printed name a conflict', () => {
    expect(settled([compared(value('Vit D', 30, 'ng/mL', 'A'), 30), compared(value('Vit D', 45, 'ng/mL', 'A'), 45)])).toBe(false);
  });

  it('keeps a value that cannot be compared beside others when its code is its own', () => {
    expect(settled([compared(value('Vit D', 30, 'ng/mL', 'A'), 30), compared(value('Vit D', 80, 'nmol/L', 'B'))])).toBe(true);
  });

  it('still calls a conflict between comparable values of one code when another code cannot be compared', () => {
    expect(
      settled([
        compared(value('Vit D', 32.6, 'ng/mL', 'A'), 32.6),
        compared(value('Vit D', 45, 'ng/mL', 'A'), 45),
        compared(value('Vit D', 81.5, 'nmol/L', 'B')),
      ])
    ).toBe(false);
  });

  it('calls a conflict when a value that cannot be compared shares its code with another', () => {
    expect(settled([compared(value('Vit D', 30, 'ng/mL', 'A'), 30), compared(value('Vit D', 80, 'odd', 'A'))])).toBe(false);
  });
});

describe('settleGroup', () => {
  it('flags two vitamin D3 values of one code even beside a value in another unit', () => {
    const group = [
      value('Vitamina D3', 32.6, 'ng/mL', '1989-3'),
      value('Vitamina D3', 45.0, 'ng/mL', '1989-3'),
      value('Vitamina D3', 81.5, 'nmol/L', '14635-7'),
    ];
    expect(settleGroup(group, catalog).settled).toBe(false);
  });

  it('compares two values in a unit that cannot reach the standard one in their own unit', () => {
    // ESR: HemoIO's unit is mm/h; "per campo" reaches nothing
    const same = settleGroup([value('VES', 12, 'per campo', '30341-2'), value('VES', 12, 'per campo', '30341-2')], catalog);
    expect(same).toMatchObject({ settled: true, kept: [expect.objectContaining({ value: 12 })] });
    expect(groupUnit([value('VES', 12, 'per campo', '30341-2')], catalog).unit).toBe('per campo');
  });

  it('settles a rate or a volume given twice in a unit only the test itself converts', () => {
    const esr = settleGroup([value('ESR', 12, 'mm/hr', '30341-2'), value('ESR', 12, 'mm/hr', '30341-2')], catalog);
    expect(esr.settled).toBe(true);
    const mcv = settleGroup([value('MCV', 88, 'µm³', '787-2'), value('MCV', 88, 'fL', '787-2')], catalog);
    expect(mcv).toMatchObject({ settled: true, kept: [expect.objectContaining({ unit: 'fL' })] });
  });

  it('keeps the value in the standard unit and sets the other aside for it', () => {
    const mgdl = value('Glucose', 90, 'mg/dL', '2345-7');
    const mmol = value('Glucose', 5.0, 'mmol/L', '2345-7');
    const result = settleGroup([mmol, mgdl], catalog);
    expect(result).toEqual({ settled: true, kept: [mgdl], setAside: new Map([[mmol, mgdl]]), merged: new Map() });
  });

  it("keeps a twin's comparator when the kept value has none", () => {
    const mgdl = value('Creatinina', 0.5, 'mg/dL', '2160-0');
    const umol: MatchedBiomarker = { ...value('Creatinina', 44, 'µmol/L', '14682-9'), censored: '<' };
    const result = settleGroup([umol, mgdl], catalog);
    expect(result).toMatchObject({ settled: true, kept: [{ value: 0.5, unit: 'mg/dL', censored: '<' }] });
    if (!result.settled) return;
    expect(result.setAside.get(umol)).toBe(result.kept[0]);
    expect(result.merged.get(mgdl)).toBe(result.kept[0]);
  });

  it("keeps a twin's lab mark when the kept value has none", () => {
    const mgdl = value('Glucose', 130, 'mg/dL', '2345-7');
    const mmol: MatchedBiomarker = { ...value('Glucose', 7.2, 'mmol/L', '14749-6'), labFlag: 'high' };
    const result = settleGroup([mmol, mgdl], catalog);
    expect(result).toMatchObject({ settled: true, kept: [{ value: 130, unit: 'mg/dL', labFlag: 'high' }] });
  });

  it('never calls a censored value and a measured one in the same unit one measurement', () => {
    const bound: MatchedBiomarker = { ...value('PCR', 10, 'mg/L', '1988-5'), censored: '<' };
    const measured = value('PCR', 10, 'mg/L', '1988-5');
    expect(settleGroup([bound, measured], catalog).settled).toBe(false);
  });

  it('never calls bounds on opposite sides one measurement: "> 0.50 mg/dL" is not "< 44 µmol/L"', () => {
    const above: MatchedBiomarker = { ...value('Creatinina', 0.5, 'mg/dL', '2160-0'), censored: '>' };
    const below: MatchedBiomarker = { ...value('Creatinina', 44, 'µmol/L', '14682-9'), censored: '<' };
    expect(settleGroup([above, below], catalog).settled).toBe(false);
  });
});
