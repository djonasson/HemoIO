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
  it.each([
    ['#1864ab', [24, 100, 171]],
    ['#1864AB', [24, 100, 171]],
    ['#1864abff', [24, 100, 171]],
    ['#fff', [255, 255, 255]],
    ['#fffF', [255, 255, 255]],
    ['  #000  ', [0, 0, 0]],
    ['rgb(24, 100, 171)', [24, 100, 171]],
    ['RGB(24, 100, 171)', [24, 100, 171]],
    ['rgba(24,100,171,1)', [24, 100, 171]],
    ['hsl(200, 50%, 50%)', [64, 149, 191]],
    ['HSLA(200, 50%, 50%, 1)', [64, 149, 191]],
    ['hsl(360, 100%, 50%)', [255, 0, 0]],
  ])('reads %s', (color, channels) => {
    expect(hexToRgb(color)).toEqual(channels);
  });

  it.each([
    'var(--mantine-color-teal-6)',
    'red',
    'oklch(0.6 0.1 200)',
    'hsl(200 50% 50%)',
    'hsl(420, 100%, 50%)',
    'hsl(200, 50.5%, 50%)',
    'rgb(24 100 171)',
    'rgb(10%, 20%, 30%)',
    'rgb(300, 0, 0)',
    'rgb(var(--x))',
    '#zzz',
    '#12345',
    '#1234567',
  ])('throws on %s, which Mantine would read as black or as the wrong colour', (color) => {
    expect(() => hexToRgb(color)).toThrow(/Cannot read colour/);
  });

  it.each(['#fff8', '#00000080', 'rgba(0, 0, 0, 0.5)', 'rgba(0, 0, 0, 0)', 'hsla(1, 2%, 3%, 0)'])(
    'throws on translucent %s, whose contrast depends on what is under it',
    (color) => {
      expect(() => hexToRgb(color)).toThrow(/translucent/);
    }
  );
});

describe('blend and rgbToHex', () => {
  it('mixes channels by opacity and rounds to hex', () => {
    expect(rgbToHex(blend([0, 0, 0], 0.5, [255, 255, 255]))).toBe('#808080');
    expect(rgbToHex(blend([24, 100, 171], 1, [255, 255, 255]))).toBe('#1864ab');
  });
});
