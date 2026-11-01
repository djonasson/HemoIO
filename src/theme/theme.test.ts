import { describe, it, expect } from 'vitest';
import { DEFAULT_THEME, mergeMantineTheme } from '@mantine/core';
import { cssVariablesResolver, theme } from './theme';

/** WCAG relative luminance of an sRGB colour */
function luminance([r, g, b]: number[]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function rgb(hex: string): number[] {
  const short = hex.replace('#', '');
  const value = short.length === 3 ? [...short].map((c) => c + c).join('') : short;
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
}

/** `over` with `alpha` opacity on `under` */
function blend(over: number[], alpha: number, under: number[]): number[] {
  return over.map((c, i) => c * alpha + under[i] * (1 - alpha));
}

function contrast(a: number[], b: number[]): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const merged = mergeMantineTheme(DEFAULT_THEME, theme);
const resolved = cssVariablesResolver(merged);
const gray = rgb(merged.colors.gray[6]);

describe('theme', () => {
  it('gives dimmed text AA contrast on the page and on light gray boxes, in light mode', () => {
    const dimmed = rgb(resolved.light['--mantine-color-dimmed']);
    const white = rgb(merged.white);
    expect(contrast(dimmed, white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dimmed, blend(gray, 0.1, white))).toBeGreaterThanOrEqual(4.5);
  });

  it('gives dimmed text AA contrast on the page and on light gray boxes, in dark mode', () => {
    const dimmed = rgb(resolved.dark['--mantine-color-dimmed']);
    const body = rgb(merged.colors.dark[7]);
    expect(contrast(dimmed, body)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dimmed, blend(gray, 0.15, body))).toBeGreaterThanOrEqual(4.5);
  });

  it('gives red alert text AA contrast on its light red box, in light mode', () => {
    const text = rgb(resolved.light['--mantine-color-red-light-color']);
    const white = rgb(merged.white);
    const box = blend(rgb(merged.colors.red[6]), 0.1, white);
    expect(contrast(text, box)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, white)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives red alert text AA contrast on its red box, in dark mode', () => {
    const text = rgb(resolved.dark['--mantine-color-red-light-color'] ?? merged.colors.red[3]);
    const body = rgb(merged.colors.dark[7]);
    const box = blend(rgb(merged.colors.red[8]), 0.15, body);
    expect(contrast(text, box)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives light blue button text AA contrast, also on hover, in light mode', () => {
    const text = rgb(resolved.light['--mantine-color-blue-light-color']);
    const white = rgb(merged.white);
    const blue = rgb(merged.colors.blue[6]);
    expect(contrast(text, blend(blue, 0.1, white))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, blend(blue, 0.12, white))).toBeGreaterThanOrEqual(4.5);
  });

  it('gives links AA contrast on the page and on light blue boxes, in light mode', () => {
    const link = rgb(resolved.light['--mantine-color-anchor']);
    const white = rgb(merged.white);
    expect(contrast(link, white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(link, blend(rgb(merged.colors.blue[6]), 0.1, white))).toBeGreaterThanOrEqual(4.5);
  });

  it('gives links AA contrast on the page, in dark mode', () => {
    // Mantine's dark-mode link colour is blue.4
    const link = rgb(resolved.dark['--mantine-color-anchor'] ?? merged.colors.blue[4]);
    expect(contrast(link, rgb(merged.colors.dark[7]))).toBeGreaterThanOrEqual(4.5);
  });
});
