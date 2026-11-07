import { describe, it, expect } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { describeTestOptions } from './testOptions';
import type { MatchedBiomarker } from './LabReportAnalyzer';

const catalog = fixtureCatalog();

const glucosio: MatchedBiomarker = {
  name: 'Glucosio',
  value: 5,
  unit: 'mmol/L',
  confidence: 0.9,
  candidates: [
    { code: '15074-8', name: 'Glucose [Moles/volume] in Blood', score: 0.9 },
    { code: '14749-6', name: 'Glucose [Moles/volume] in Serum or Plasma', score: 1 },
    { code: '2345-7', name: 'Glucose [Mass/volume] in Serum or Plasma', score: 0.5 },
    { code: '2339-0', name: 'Glucose [Mass/volume] in Blood', score: 0 },
  ],
  aiPick: '15074-8',
};

describe('describeTestOptions', () => {
  it("splits each test's LOINC name into what is measured, its kind, sample and method", () => {
    const [blood] = describeTestOptions(catalog, glucosio, ['15074-8'], { suggested: false });

    expect(blood).toMatchObject({
      code: '15074-8',
      name: 'Glucose [Moles/volume] in Blood',
      component: 'Glucose',
      kind: 'Moles/volume',
      sample: 'Whole Blood',
      method: '',
    });
  });

  it("says whether the value's unit fits each test", () => {
    // Glucose is offered in mmol/L and mg/dL alike; an enzyme's U/L is surely no glucose unit
    const fit = (unit: string) =>
      describeTestOptions(catalog, { ...glucosio, unit }, ['2345-7'], { suggested: false })[0].unitFit;

    expect([fit('mmol/L'), fit('mg/dL'), fit('U/L'), fit('pieces')]).toEqual(['fits', 'fits', 'misfits', 'unknown']);
  });

  it('marks the commonly ordered tests', () => {
    const options = describeTestOptions(catalog, glucosio, ['2345-7', '15074-8'], { suggested: false });

    expect(options.map((option) => option.common)).toEqual([true, false]);
  });

  it('says why each suggested test is offered', () => {
    const options = describeTestOptions(catalog, glucosio, ['15074-8', '14749-6', '2345-7', '2339-0'], {
      suggested: true,
    });

    expect(options.map((option) => option.reason)).toEqual([
      "The AI's best guess",
      'Name matches',
      'Name is similar',
      'A usual test in this unit',
    ]);
  });

  it('gives search results no reason, and leaves out codes the catalog lacks', () => {
    const options = describeTestOptions(catalog, glucosio, ['14749-6', '0000-0'], { suggested: false });

    expect(options).toHaveLength(1);
    expect(options[0].reason).toBeUndefined();
  });

  it("carries HemoIO's description of a test it knows", () => {
    const [serum] = describeTestOptions(catalog, glucosio, ['2345-7'], { suggested: false });

    expect(serum.description).toMatch(/Blood sugar level/);
  });
});
