import { describe, it, expect } from 'vitest';
import { blend, contrast, hexToRgb, rgbToHex } from './contrast';

describe('contrast', () => {
  it('matches WCAG reference ratios', () => {
    const white = hexToRgb('#ffffff');
    expect(contrast(hexToRgb('#000000'), white)).toBeCloseTo(21, 5);
    expect(contrast(hexToRgb('#777777'), white)).toBeCloseTo(4.48, 2);
    expect(contrast(hexToRgb('#767676'), white)).toBeCloseTo(4.54, 2);
    expect(contrast(white, white)).toBe(1);
  });

  it('is the same either way round', () => {
    const [a, b] = [hexToRgb('#1864ab'), hexToRgb('#e7f5ff')];
    expect(contrast(a, b)).toBe(contrast(b, a));
  });
});

describe('hexToRgb', () => {
  it('reads hex and rgb() colours', () => {
    expect(hexToRgb('#1864ab')).toEqual([24, 100, 171]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('rgb(24, 100, 171)')).toEqual([24, 100, 171]);
  });

  it.each(['var(--mantine-color-teal-6)', 'red', 'oklch(0.6 0.1 200)', 'hsl(200 50% 50%)', '#zzz', 'rgb(var(--x))'])(
    'throws on %s, which Mantine would read as black',
    (color) => {
      expect(() => hexToRgb(color)).toThrow(/Cannot read colour/);
    }
  );
});

describe('blend and rgbToHex', () => {
  it('mixes channels by opacity and rounds to hex', () => {
    expect(rgbToHex(blend([0, 0, 0], 0.5, [255, 255, 255]))).toBe('#808080');
    expect(rgbToHex(blend([24, 100, 171], 1, [255, 255, 255]))).toBe('#1864ab');
  });
});
