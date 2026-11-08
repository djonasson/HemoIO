import { describe, expect, it } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { loadCatalog } from '@data/loinc/catalog';
import { testKey } from '@data/loinc/display';
import { unknownBiomarkerKey } from '@data/loinc/keys';
import { buildTrendLines, type TrendableResult } from './trendLines';

const catalog = fixtureCatalog();

let nextId = 1;
function value(biomarkerKey: string, value: number, unit: string, rawText?: string) {
  return {
    id: nextId++,
    labResultId: 1,
    biomarkerKey,
    rawText,
    value,
    unit,
    status: 'unknown' as const,
  };
}

function result(day: string, testValues: TrendableResult['testValues']): TrendableResult {
  return { date: new Date(`${day}T12:00:00Z`), labName: `Lab ${day}`, testValues };
}

const pointsOf = (line: { dataPoints: Array<{ value: number; unit: string }> } | undefined) =>
  line?.dataPoints.map((point) => `${point.value} ${point.unit}`);

describe('buildTrendLines', () => {
  const glucose = [
    result('2024-01-15', [value('2345-7', 90, 'mg/dL', 'Glucose')]),
    result('2024-02-20', [value('14749-6', 7, 'mmol/L', 'Glicemia')]),
  ];

  it('one line for glucose in mg/dL and mmol/L, in the preferred unit', () => {
    const standard = buildTrendLines(catalog, glucose, {});
    expect([...standard.keys()]).toEqual(['2345-7']);
    const line = standard.get('2345-7')!;
    expect(line.name).toBe('Glucose');
    expect(line.unitOptions).toEqual(['mg/dL', 'mmol/L']);
    expect(pointsOf(line)).toEqual(['90 mg/dL', '126 mg/dL']);

    // The preference is the test's, kept under its LOINC group
    const preferred = buildTrendLines(catalog, glucose, { [testKey(catalog, '2345-7')]: 'mmol/L' }).get('2345-7');
    expect(pointsOf(preferred)).toEqual(['5 mmol/L', '7 mmol/L']);
    expect(preferred?.testKey).toBe(catalog.trendGroup('14749-6'));
  });

  it('puts values whose units differ only in spelling or case on one line of their own', () => {
    const lines = buildTrendLines(
      catalog,
      [
        ...glucose,
        result('2024-03-10', [value('2345-7', 3, 'mg/g')]),
        result('2024-04-10', [value('2345-7', 4, 'MG/G')]),
      ],
      {}
    );
    const own = [...lines.values()].filter((line) => line.key !== '2345-7');
    expect(own).toHaveLength(1);
    expect(pointsOf(own[0])).toEqual(['3 mg/g', '4 MG/G']);
    expect(lines.get('2345-7')!.elsewhere).toEqual({ count: 2, units: ['mg/g'] });
  });

  it("converts an interval's ends as its midpoint", () => {
    const interval = { numericValueType: 'interval' as const, intervalLow: 90, intervalHigh: 110 };
    const results = [result('2024-01-15', [{ ...value('2345-7', 100, 'mg/dL', 'Glucose'), ...interval }])];

    const own = buildTrendLines(catalog, results, {}).get('2345-7')!;
    expect(own.dataPoints[0]).toMatchObject({ value: 100, interval: { low: 90, high: 110 } });

    const converted = buildTrendLines(catalog, results, { [testKey(catalog, '2345-7')]: 'mmol/L' }).get('2345-7')!;
    expect(converted.dataPoints[0].unit).toBe('mmol/L');
    expect(converted.dataPoints[0].interval?.low).toBeCloseTo(5, 1);
    expect(converted.dataPoints[0].interval?.high).toBeCloseTo(6.1, 1);
  });

  it('keeps the ends of a count per field relabelled to the line\'s spelling: "5-10 per campo" reads "5-10 RBC/HPF"', async () => {
    const real = await loadCatalog();
    const interval = { numericValueType: 'interval' as const, intervalLow: 5, intervalHigh: 10 };
    const results = [result('2024-01-15', [{ ...value('13945-1', 7.5, 'per campo', 'Eritrociti'), ...interval }])];
    const [line] = buildTrendLines(real, results, {}).values();
    expect(line.dataPoints[0]).toMatchObject({ value: 7.5, interval: { low: 5, high: 10 } });
  });

  it("keeps a censored value's comparator on its point", () => {
    const results = [result('2024-01-15', [{ ...value('2345-7', 10, 'mg/dL', 'Glucose'), censored: '<' as const }])];
    expect(buildTrendLines(catalog, results, {}).get('2345-7')!.dataPoints[0]).toMatchObject({ value: 10, censored: '<' });
  });

  it('names a line of values with no unit as such', () => {
    const lines = buildTrendLines(
      catalog,
      [...glucose, result('2024-03-10', [value('2345-7', 3, '')])],
      {}
    );
    const own = [...lines.values()].find((line) => line.key !== '2345-7')!;
    expect(own.name).toBe('Glucose with no unit');
    expect(own.key).not.toMatch(/ in $/);
  });

  it('gives a value that cannot be converted a line of its own', () => {
    const lines = buildTrendLines(
      catalog,
      [...glucose, result('2024-03-10', [value('2345-7', 3, 'mg/g', 'Glucose')])],
      {}
    );
    const main = lines.get('2345-7')!;
    expect(pointsOf(main)).toEqual(['90 mg/dL', '126 mg/dL']);
    expect(main.elsewhere).toEqual({ count: 1, units: ['mg/g'] });

    const own = [...lines.values()].find((line) => line.key !== '2345-7')!;
    expect(own).toMatchObject({
      trendCode: '2345-7',
      name: 'Glucose in mg/g',
      testName: 'Glucose',
      unit: 'mg/g',
      unitOptions: [],
    });
    expect(pointsOf(own)).toEqual(['3 mg/g']);
  });

  it('charts a test in its own unit when no value converts to the standard one', () => {
    const lines = buildTrendLines(catalog, [result('2024-01-15', [value('2345-7', 3, 'mg/g')])], {});
    expect([...lines.keys()]).toEqual(['2345-7']);
    expect(pointsOf(lines.get('2345-7'))).toEqual(['3 mg/g']);
  });

  it('trends a value that is not a LOINC test by its printed name and unit', () => {
    const key = unknownBiomarkerKey('Zorblatina');
    const lines = buildTrendLines(
      catalog,
      [
        result('2024-01-15', [value(key, 4, 'mg/L', 'Zorblatina')]),
        result('2024-02-20', [value(key, 5, 'mg/L', 'Zorblatina'), value(key, 9, 'µmol/L', 'Zorblatina')]),
      ],
      {}
    );
    expect(lines.get(key)).toMatchObject({ name: 'Zorblatina', unit: 'mg/L', isLoincTest: false });
    expect(lines.get(key)!.classLabel).toBe('Other');
    expect(pointsOf(lines.get(key))).toEqual(['4 mg/L', '5 mg/L']);
    const own = [...lines.values()].find((line) => line.key !== key)!;
    expect(own.name).toBe('Zorblatina in µmol/L');
  });

  it("gives each line its test's LOINC class", () => {
    const lines = buildTrendLines(catalog, [result('2024-01-15', [value('718-7', 14, 'g/dL')])], {});
    expect(lines.get('718-7')).toMatchObject({ name: 'Hemoglobin', classLabel: 'Hematology', isLoincTest: true });
  });
});
