import { describe, expect, it, vi } from 'vitest';
import { convertUcum, isMassAndMolar, toUcum, ucumProperties } from './ucum';

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
  ])('writes %s as %s', (printed, ucum) => {
    expect(toUcum(printed)).toBe(ucum);
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
    ['mmol/L', ['SCnc']],
    ['meq/L', ['SCnc']],
    ['10*9/L', ['NCnc']],
    ['10*3/uL', ['NCnc']],
    ['U/L', ['CCnc', 'ACnc']],
    ['kU/L', ['CCnc', 'ACnc']],
    ['mmol/min/L', ['CCnc']],
    ['g/(24.h)', ['MRat']],
    ['mmol/(24.h)', ['SRat']],
    ['[IU]/L', ['ACnc', 'Ratio', 'Titr']],
    ['{index}', ['ACnc', 'Ratio', 'Titr']],
    ['1', ['SpGrav', 'Ratio', 'pH']],
    ['/[HPF]', ['Naric', 'NCnc']],
    ['{cells}/[HPF]', ['Naric', 'NCnc']],
    ['mg/g', ['MRto', 'Ratio']],
    ['mg/mmol', ['Ratio']],
    ['mL', ['Vol', 'EntMeanVol', 'EntVol']],
    ['fL', ['Vol', 'EntMeanVol', 'EntVol']],
    ['pg', ['Mass', 'EntMass']],
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

  it('does not convert mass to moles', () => {
    expect(convertUcum(1, 'mg/dL', 'mmol/L')).toBeNull();
  });

  it('is null for a unit it cannot read', () => {
    expect(convertUcum(1, 'nonsense', 'g/L')).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity])('is null for %s', (value) => {
    expect(convertUcum(value, 'mg/dL', 'g/L')).toBeNull();
  });
});

describe('isMassAndMolar', () => {
  it('is true for a mass and an amount concentration, either way round', () => {
    expect(isMassAndMolar('mg/dL', 'mmol/L')).toBe(true);
    expect(isMassAndMolar('umol/L', 'g/L')).toBe(true);
  });

  it('is false for two of a kind or for other units', () => {
    expect(isMassAndMolar('mg/dL', 'g/L')).toBe(false);
    expect(isMassAndMolar('mmol/L', 'umol/L')).toBe(false);
    expect(isMassAndMolar('mg/dL', '10*9/L')).toBe(false);
    expect(isMassAndMolar('mg/dL', 'nonsense')).toBe(false);
  });

  it('is false for rates, which are not concentrations', () => {
    expect(isMassAndMolar('mg/dL/h', 'mmol/L')).toBe(false);
    expect(isMassAndMolar('mg/dL', 'mmol/L/h')).toBe(false);
    expect(isMassAndMolar('mg/dL/h', 'mmol/L/h')).toBe(false);
  });
});
