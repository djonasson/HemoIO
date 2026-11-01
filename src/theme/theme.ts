/**
 * The app's Mantine theme
 */
import {
  createTheme,
  getPrimaryShade,
  type CSSVariablesResolver,
  type MantineTheme,
} from '@mantine/core';
import { blend, contrast, hexToRgb, rgbToHex, type Rgb } from './contrast';

export const theme = createTheme({});

/** WCAG AA contrast for normal-size text */
const AA = 4.5;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/**
 * The given shades, then the last one mixed in tenths toward `toward`. The
 * last candidate is `toward` itself, so a readable one always exists, even
 * for colours like yellow whose darkest shade is 3:1 on white.
 */
function candidates(shades: readonly string[], order: number[], toward: Rgb): Rgb[] {
  const list = order.map((i) => hexToRgb(shades[i]));
  const last = list[list.length - 1];
  for (let k = 1; k <= 10; k++) list.push(blend(toward, k / 10, last));
  return list;
}

/** Index of the first candidate with AA contrast on every background */
function firstReadable(list: Rgb[], backgrounds: Rgb[]): number {
  const index = list.findIndex((c) => backgrounds.every((b) => contrast(c, b) >= AA));
  return index === -1 ? list.length - 1 : index;
}

/** The lightest of `order` (shade numbers) mixing toward `toward` that is AA on `backgrounds` */
function readable(shades: readonly string[], order: number[], toward: Rgb, backgrounds: Rgb[]): string {
  const list = candidates(shades, order, toward);
  return rgbToHex(list[firstReadable(list, backgrounds)]);
}

/** A filled background that white text is AA on, and a darker one for hover */
function filled(shades: readonly string[], order: number[]): [string, string] {
  const list = candidates(shades, order, BLACK);
  const index = firstReadable(list, [WHITE]);
  return [rgbToHex(list[index]), rgbToHex(list[Math.min(index + 1, list.length - 1)])];
}

type Variables = Record<string, string>;

/**
 * Text, light-variant, outline and filled colours of every theme colour,
 * moved along its shades only as far as WCAG AA (4.5:1) needs. Mantine uses
 * shade 6 in light mode, which is under 4.5:1 on white for every colour but
 * dark (blue.6 3.6:1, green.6 2.4:1, yellow.6 1.9:1); for yellow, lime,
 * green, teal and orange even shade 9 fails, so those go darker still.
 */
function colourVariables(t: MantineTheme): { light: Variables; dark: Variables } {
  const light: Variables = {};
  const dark: Variables = {};
  const lightShade = getPrimaryShade(t, 'light');
  const darkShade = getPrimaryShade(t, 'dark');
  const body = hexToRgb(t.colors.dark[7]);
  const lightOrder = Array.from({ length: 10 - lightShade }, (_, i) => lightShade + i);
  const darkFilledOrder = Array.from({ length: 10 - darkShade }, (_, i) => darkShade + i);
  // Text also sits on light gray boxes, and on the darker gray of cards in dark mode
  const grayBox = blend(hexToRgb(t.colors.gray[lightShade]), 0.12, WHITE);
  const darkCard = hexToRgb(t.colors.dark[6]);

  for (const [name, shades] of Object.entries(t.colors)) {
    // Virtual colours have no shades of their own
    if (!Array.isArray(shades)) continue;
    const v = `--mantine-color-${name}`;

    // The light variant's hover fill is its darkest background
    const lightBox = blend(hexToRgb(shades[lightShade]), 0.12, WHITE);
    const lightText = readable(shades, lightOrder, BLACK, [WHITE, lightBox, grayBox]);
    const [lightFilled, lightFilledHover] = filled(shades, lightOrder);
    Object.assign(light, {
      [`${v}-text`]: lightText,
      [`${v}-light-color`]: lightText,
      [`${v}-outline`]: lightText,
      [`${v}-filled`]: lightFilled,
      [`${v}-filled-hover`]: lightFilledHover,
    });

    const darkBox = blend(hexToRgb(shades[Math.max(0, darkShade - 2)]), 0.2, body);
    const darkBackgrounds = [body, darkCard, darkBox];
    // Mantine's own choices (shade 4 for text, 3 for light variants) come first
    const darkText = readable(shades, [4, 3, 2, 1, 0], WHITE, darkBackgrounds);
    const [darkFilled, darkFilledHover] = filled(shades, darkFilledOrder);
    Object.assign(dark, {
      [`${v}-text`]: darkText,
      [`${v}-light-color`]: readable(shades, [3, 2, 1, 0], WHITE, darkBackgrounds),
      [`${v}-outline`]: darkText,
      [`${v}-filled`]: darkFilled,
      [`${v}-filled-hover`]: darkFilledHover,
    });
  }
  return { light, dark };
}

/**
 * Text colours that meet WCAG AA (4.5:1) in both schemes: theme colours
 * (`c="red"`, light, subtle, outline and filled variants), links, which
 * follow the primary colour, error messages, and dimmed text one shade
 * stronger than Mantine's (gray.6 is 3.3:1 on white).
 */
export const cssVariablesResolver: CSSVariablesResolver = (t) => {
  const colours = colourVariables(t);
  const links = {
    '--mantine-color-anchor': `var(--mantine-color-${t.primaryColor}-text)`,
    '--mantine-color-error': 'var(--mantine-color-red-text)',
  };
  return {
    variables: {},
    light: { ...colours.light, ...links, '--mantine-color-dimmed': t.colors.gray[7] },
    dark: { ...colours.dark, ...links, '--mantine-color-dimmed': t.colors.dark[1] },
  };
};
