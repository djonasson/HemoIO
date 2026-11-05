import { describe, expect, it, vi } from 'vitest';
import { convertUcum, toUcum, ucumConversion, ucumProperties } from './ucum';

describe('toUcum', () => {
  it.each([
    ['mg/dl', 'mg/dL'],
    ['mmol/l', 'mmol/L'],
    ['10^9/L', '10*9/L'],
    ['x10³/µL', '10*3/uL'],
    ['µg/L', 'ug/L'],
    ['mcg/L', 'ug/L'],
    ['mg/gcr', 'mg/g'],
    ['per campo', '/[HPF]'],
    ['/100WBC', '/100{WBCs}'],
    ['U/L', 'U/L'],
    ['%', '%'],
    ['K/µL', '10*3/uL'],
    ['M/µL', '10*6/uL'],
    ['cells/µL', '{cells}/uL'],
    ['mIU/L', 'm[IU]/L'],
    ['µIU/mL', 'u[IU]/mL'],
    ['mUI/mL', 'm[IU]/mL'],
    ['UI/L', '[IU]/L'],
    ['mEq/L', 'meq/L'],
    ['mL/min/1.73m²', 'mL/min/(1.73.m2)'],
    ['g/24h', 'g/(24.h)'],
    ['/HPF', '/[HPF]'],
    // The litre as UCUM writes it, and units printed in capitals
    ['fl', 'fL'],
    ['FL', 'fL'],
    ['ml/min', 'mL/min'],
    ['MG/DL', 'mg/dL'],
    // Times: per hour, per 24 hours, per day, and a duration
    ['mm/1h', 'mm/h'],
    ['mm/hr', 'mm/h'],
    ['mg/24 ore', 'mg/(24.h)'],
    ['mg/day', 'mg/d'],
    ['minuti', 'min'],
    ['giorni', 'd'],
    ['ml/min/1,73m2', 'mL/min/(1.73.m2)'],
    ['mL/min/1.73 m^2', 'mL/min/(1.73.m2)'],
    // Powers and counts
    ['/mm³', '/mm3'],
    ['µm³', 'um3'],
    ['million/µL', '10*6/uL'],
    ['mil/mL', '10*6/mL'],
    ['million', '10*6'],
    ['10^6', '10*6'],
    // What is counted, named before what it is counted per
    ['RBC/HPF', '{RBC}/[HPF]'],
    ['WBC/HPF', '{WBC}/[HPF]'],
    ['Ery/µL', '{Ery}/uL'],
    ['eritrociti per campo', '{eritrociti}/[HPF]'],
    // International units with any prefix, per mille, a plain ratio
    ['kIU/L', 'k[IU]/L'],
    ['‰', '[ppth]'],
    ['ratio', '1'],
  ])('writes %s as %s', (printed, ucum) => {
    expect(toUcum(printed)).toBe(ucum);
  });

  it('never reads a unit word in capitals as a thing counted', () => {
    expect(toUcum('MMOL/L')).toBe('mmol/L');
  });

  it.each(['/campo', '', '   ', 'not a unit'])('is null for %j', (printed) => {
    expect(toUcum(printed)).toBeNull();
  });

  it('writes nothing to the console for a unit it rejects', () => {
    const log = vi.spyOn(console, 'log');
    try {
      expect(toUcum('/campo')).toBeNull();
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});

describe('ucumProperties', () => {
  it.each([
    ['mg/dL', ['MCnc']],
    ['ng/mL', ['MCnc']],
    ['g/dL', ['MCnc', 'EntMCnc']],
    ['g/L', ['MCnc', 'EntMCnc']],
    ['mmol/L', ['SCnc']],
    ['meq/L', ['SCnc']],
    ['10*9/L', ['NCnc']],
    ['10*3/uL', ['NCnc']],
    ['U/L', ['CCnc', 'ACnc']],
    ['kU/L', ['CCnc', 'ACnc']],
    ['mmol/min/L', ['CCnc']],
    ['g/(24.h)', ['MRat']],
    ['mmol/(24.h)', ['SRat']],
    // Enzyme activity is printed in IU/L too: catalytic as well as arbitrary
    ['[IU]/L', ['ACnc', 'CCnc', 'Ratio', 'Titr']],
    ['m[IU]/mL', ['ACnc', 'CCnc', 'Ratio', 'Titr']],
    ['[IU]/g', ['ACnc', 'Ratio', 'Titr']],
    ['[ppth]', ['NFr', 'MFr', 'VFr', 'SFr', 'Ratio', 'DistWidth']],
    ['min', ['Time']],
    ['{index}', ['ACnc', 'Ratio', 'Titr']],
    ['1', ['SpGrav', 'Ratio', 'pH']],
    ['/[HPF]', ['Naric', 'NCnc']],
    ['{cells}/[HPF]', ['Naric', 'NCnc']],
    ['mg/g', ['MRto', 'Ratio']],
    ['mg/mmol', ['Ratio']],
    ['mL', ['Vol']],
    ['fL', ['Vol', 'EntMeanVol', 'EntVol']],
    ['pg', ['Mass', 'EntMass']],
    ['mg', ['Mass']],
    ['mmol/mol', ['SFr', 'SRto', 'Ratio']],
    ['mL/min/(1.73.m2)', ['ArVRat']],
    ['mm/h', ['Vel', 'Sedimentation Rate']],
    ['nonsense', []],
  ])('reads %s as %j', (ucum, properties) => {
    expect(ucumProperties(ucum)).toEqual(properties);
  });

  it('reads a percentage and a count per 100 as a fraction or a ratio', () => {
    expect(ucumProperties('%')).toEqual(['NFr', 'MFr', 'VFr', 'SFr', 'Ratio', 'DistWidth']);
    expect(ucumProperties('/100{WBCs}')).toContain('NFr');
  });
});

describe('convertUcum', () => {
  it('converts units of one dimension', () => {
    expect(convertUcum(100, 'mg/dL', 'g/L')).toBe(1);
    expect(convertUcum(5, '10*3/uL', '10*9/L')).toBe(5);
  });

  it('does not convert mass to moles without a molar mass', () => {
    expect(convertUcum(1, 'mg/dL', 'mmol/L')).toBeNull();
  });

  it('converts mass to moles with a molar mass, and moles to equivalents with a charge', () => {
    expect(convertUcum(100, 'mg/dL', 'mmol/L', { molarMass: 180.16 })).toBeCloseTo(5.551, 3);
    expect(convertUcum(1, 'mmol/L', 'meq/L', { charge: 2 })).toBe(2);
  });

  it('is null for a unit it cannot read', () => {
    expect(convertUcum(1, 'nonsense', 'g/L')).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity])('is null for %s', (value) => {
    expect(convertUcum(value, 'mg/dL', 'g/L')).toBeNull();
  });

  it('is null for a result too large to be a number', () => {
    expect(convertUcum(1e308, 'kg/L', 'ug/L')).toBeNull();
  });
});

describe('rejected units', () => {
  it('write nothing to the console, whichever function reads them', () => {
    const log = vi.spyOn(console, 'log');
    try {
      expect(ucumProperties('/campo')).toEqual([]);
      expect(convertUcum(1, '/campo', 'g/L')).toBeNull();
      expect(convertUcum(1, 'g/L', 'nonsense')).toBeNull();
      expect(ucumConversion('/campo', 'mmol/L')).toBeUndefined();
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});

describe('ucumConversion', () => {
  it('converts printed units of one dimension', () => {
    expect(ucumConversion('mg/dL', 'g/L')).toEqual({ factor: 0.01, offset: 0 });
    expect(ucumConversion('x10³/µL', '10^9/L')).toEqual({ factor: 1, offset: 0 });
    expect(ucumConversion('µmol/L', 'mmol/L')).toEqual({ factor: 0.001, offset: 0 });
  });

  it('converts cells per microlitre to a power of ten per litre', () => {
    expect(ucumConversion('cells/µL', '10^9/L')).toEqual({ factor: 0.001, offset: 0 });
  });

  it('takes two spellings of one unit as the same unit', () => {
    expect(ucumConversion('mIU/mL', 'mUI/mL')).toEqual({ factor: 1, offset: 0 });
    expect(ucumConversion('10^6', 'million')).toEqual({ factor: 1, offset: 0 });
    expect(ucumConversion('%', '%')).toEqual({ factor: 1, offset: 0 });
    expect(ucumConversion('RBC/HPF', 'per campo')).toEqual({ factor: 1, offset: 0 });
    expect(ucumConversion('RBC/HPF', 'eritrociti per campo')).toEqual({ factor: 1, offset: 0 });
  });

  it('never takes one share for a share of something else', () => {
    expect(ucumConversion('/100WBC', '/100')).toBeUndefined();
  });

  it('rescales one arbitrary unit with another prefix or per another volume', () => {
    expect(ucumConversion('mIU/mL', 'IU/L')).toEqual({ factor: 1, offset: 0 });
    expect(ucumConversion('IU/mL', 'kIU/L')).toEqual({ factor: 1, offset: 0 });
    expect(ucumConversion('µIU/mL', 'IU/L')).toEqual({ factor: 0.001, offset: 0 });
  });

  it('converts a mass to an amount with a molar mass, and an amount to equivalents with a charge', () => {
    expect(ucumConversion('mg/dL', 'mmol/L', { molarMass: 180.16 })?.factor).toBeCloseTo(0.0555, 4);
    expect(ucumConversion('mEq/L', 'mmol/L', { charge: 1 })).toEqual({ factor: 1, offset: 0 });
    expect(ucumConversion('mg/dL', 'mEq/L', { molarMass: 24.305, charge: 2 })?.factor).toBeCloseTo(0.8229, 4);
  });

  it('gives none for a mass to an amount, moles to a count, shares, arbitrary or unread units', () => {
    expect(ucumConversion('mg/dL', 'mmol/L')).toBeUndefined();
    expect(ucumConversion('mmol/L', '10^9/L')).toBeUndefined();
    expect(ucumConversion('mmol/L', '10^9/L', { molarMass: 180.16 })).toBeUndefined();
    expect(ucumConversion('%', '1')).toBeUndefined();
    expect(ucumConversion('%', 'mmol/mol')).toBeUndefined();
    expect(ucumConversion('IU/L', 'U/L')).toBeUndefined();
    expect(ucumConversion('mg/dL', 'nonsense')).toBeUndefined();
  });
});
