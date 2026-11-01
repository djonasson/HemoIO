import { describe, it, expect } from 'vitest';
import { DEFAULT_THEME, mergeMantineTheme } from '@mantine/core';
import { blend, contrast, hexToRgb, type Rgb } from './contrast';
import { cssVariablesResolver, theme } from './theme';

const merged = mergeMantineTheme(DEFAULT_THEME, theme);
const resolved = cssVariablesResolver(merged);
const white = hexToRgb(merged.white);
const body = hexToRgb(merged.colors.dark[7]);
const card = hexToRgb(merged.colors.dark[6]);
const gray = hexToRgb(merged.colors.gray[6]);
const colourNames = Object.keys(merged.colors).filter((name) => Array.isArray(merged.colors[name]));

/** A resolved variable's colour in a scheme, following `var(--x)` references */
function colour(name: `--${string}`, scheme: 'light' | 'dark'): Rgb {
  const value = resolved[scheme][name] ?? resolved.variables[name];
  if (value === undefined) throw new Error(`${name} is not set in ${scheme} mode`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference ? colour(reference[1] as `--${string}`, scheme) : hexToRgb(value);
}

/** Mantine's light variant fill (and hover fill) of a colour */
function lightBox(name: string, scheme: 'light' | 'dark', hover = false): Rgb {
  const shades = merged.colors[name];
  return scheme === 'light'
    ? blend(hexToRgb(shades[6]), hover ? 0.12 : 0.1, white)
    : blend(hexToRgb(shades[6]), hover ? 0.2 : 0.15, body);
}

describe('theme', () => {
  it('gives dimmed text AA contrast on the page and on light gray boxes, in light mode', () => {
    const dimmed = colour('--mantine-color-dimmed', 'light');
    expect(contrast(dimmed, white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dimmed, blend(gray, 0.1, white))).toBeGreaterThanOrEqual(4.5);
  });

  it('gives dimmed text AA contrast on the page and on light gray boxes, in dark mode', () => {
    const dimmed = colour('--mantine-color-dimmed', 'dark');
    expect(contrast(dimmed, body)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dimmed, blend(gray, 0.15, body))).toBeGreaterThanOrEqual(4.5);
  });

  describe.each(colourNames)('%s', (name) => {
    const v = `--mantine-color-${name}` as const;

    it('gives light, subtle and outline variant text AA contrast on its fills, in light mode', () => {
      for (const variable of [`${v}-light-color`, `${v}-outline`] as const) {
        const text = colour(variable, 'light');
        for (const background of [white, lightBox(name, 'light'), lightBox(name, 'light', true)]) {
          expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it('gives light, subtle and outline variant text AA contrast on its fills, in dark mode', () => {
      for (const variable of [`${v}-light-color`, `${v}-outline`] as const) {
        const text = colour(variable, 'dark');
        for (const background of [body, lightBox(name, 'dark'), lightBox(name, 'dark', true)]) {
          expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it('gives coloured text AA contrast on the page, on gray boxes and on cards', () => {
      const light = colour(`${v}-text`, 'light');
      expect(contrast(light, white)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light, blend(gray, 0.12, white))).toBeGreaterThanOrEqual(4.5);
      const dark = colour(`${v}-text`, 'dark');
      expect(contrast(dark, body)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark, card)).toBeGreaterThanOrEqual(4.5);
    });

    it('gives white text on filled backgrounds AA contrast, also on hover, in both modes', () => {
      for (const scheme of ['light', 'dark'] as const) {
        expect(contrast(white, colour(`${v}-filled`, scheme))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(white, colour(`${v}-filled-hover`, scheme))).toBeGreaterThanOrEqual(4.5);
      }
    });
  });

  it('keeps colours that already meet AA at their Mantine shade', () => {
    expect(resolved.light['--mantine-color-dark-text']).toBe(merged.colors.dark[6]);
    expect(resolved.light['--mantine-color-blue-text']).toBe(merged.colors.blue[9]);
    expect(resolved.dark['--mantine-color-blue-text']).toBe(merged.colors.blue[4]);
    expect(resolved.dark['--mantine-color-blue-light-color']).toBe(merged.colors.blue[3]);
  });

  it('makes links follow the primary colour', () => {
    const teal = cssVariablesResolver(mergeMantineTheme(DEFAULT_THEME, { primaryColor: 'teal' }));
    expect(teal.light['--mantine-color-anchor']).toBe('var(--mantine-color-teal-text)');
    expect(teal.dark['--mantine-color-anchor']).toBe('var(--mantine-color-teal-text)');
  });

  it('gives links AA contrast on the page, on light blue boxes and in red alerts, in both modes', () => {
    const light = colour('--mantine-color-anchor', 'light');
    for (const background of [white, lightBox('blue', 'light', true), lightBox('red', 'light', true)]) {
      expect(contrast(light, background)).toBeGreaterThanOrEqual(4.5);
    }
    const dark = colour('--mantine-color-anchor', 'dark');
    for (const background of [body, card, lightBox('red', 'dark', true)]) {
      expect(contrast(dark, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives error messages AA contrast on the page, in both modes', () => {
    expect(contrast(colour('--mantine-color-error', 'light'), white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colour('--mantine-color-error', 'dark'), body)).toBeGreaterThanOrEqual(4.5);
  });
});
