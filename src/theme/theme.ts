/**
 * The app's Mantine theme
 */
import {
  Anchor,
  createTheme,
  getPrimaryShade,
  isVirtualColor,
  Progress,
  type CSSVariablesResolver,
  type MantineTheme,
} from '@mantine/core';
import { blend, contrast, hexToRgb, rgbToHex, type Rgb } from './contrast';

/** Names of the theme colours that have shades of their own (not virtual colours) */
function shadedColours(t: MantineTheme): string[] {
  return Object.keys(t.colors).filter((name) => !isVirtualColor(t.colors[name]));
}

export const theme = createTheme({
  components: {
    // In dark mode no link colour meets AA on the page and also stands 3:1
    // apart from the body text, so links are underlined, not marked by colour alone
    Anchor: Anchor.extend({ defaultProps: { underline: 'always' } }),
    // Progress bars carry no text, so they use the indicator colours, which
    // stand out from the track, instead of the dark filled colours white text needs
    Progress: Progress.extend({
      vars: (t) => ({
        root: Object.fromEntries(
          shadedColours(t).map((name) => [
            `--mantine-color-${name}-filled`,
            `var(--mantine-color-${name}-indicator)`,
          ])
        ),
      }),
    }),
  },
});

/** WCAG AA contrast for normal-size text */
const AA = 4.5;
/** WCAG 1.4.11 contrast for graphics, such as progress bars, on what is next to them */
const NON_TEXT = 3;
/** The active NavLink shows its description at this opacity, in its light variant colour */
const DESCRIPTION_OPACITY = 0.9;
/** Mantine's light variant fill opacity, at rest and on hover */
const LIGHT_FILL = { light: [0.1, 0.12], dark: [0.15, 0.2] } as const;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/**
 * The given shades, then the last one mixed in tenths toward `toward`. The
 * last candidate is `toward` itself, so a passing one always exists, even
 * for colours like yellow whose darkest shade is 3:1 on white.
 */
function candidates(shades: readonly string[], order: number[], toward: Rgb): Rgb[] {
  const list = order.map((i) => hexToRgb(shades[i]));
  const last = list[list.length - 1];
  for (let k = 1; k <= 10; k++) list.push(blend(toward, k / 10, last));
  return list;
}

/**
 * The candidates of `order` mixing toward `toward`, and the index of the
 * first one with `ratio` contrast on every background, when shown at `opacity`
 */
function firstPassing(
  shades: readonly string[],
  order: number[],
  toward: Rgb,
  backgrounds: Rgb[],
  ratio = AA,
  opacity = 1
): [Rgb[], number] {
  const list = candidates(shades, order, toward);
  const index = list.findIndex((c) =>
    backgrounds.every((b) => contrast(blend(c, opacity, b), b) >= ratio)
  );
  return [list, index === -1 ? list.length - 1 : index];
}

/** The first of `order` (shade numbers) mixing toward `toward` that passes on `backgrounds` */
function passing(...args: Parameters<typeof firstPassing>): string {
  const [list, index] = firstPassing(...args);
  return rgbToHex(list[index]);
}

/** A filled background that white text is AA on, and a darker one for hover */
function filled(shades: readonly string[], order: number[]): [string, string] {
  const [list, index] = firstPassing(shades, order, BLACK, [WHITE]);
  return [rgbToHex(list[index]), rgbToHex(list[Math.min(index + 1, list.length - 1)])];
}

/** Shade numbers from `first` to the darkest */
function shadesFrom(first: number): number[] {
  return Array.from({ length: 10 - first }, (_, i) => first + i);
}

/** Shade numbers from `first` to the lightest */
function shadesDownFrom(first: number): number[] {
  return Array.from({ length: first + 1 }, (_, i) => first - i);
}

type Variables = Record<string, string>;

/**
 * The shaded colour the primary colour stands for in `scheme`: itself, or
 * for a virtual primary colour its light or dark source. Undefined when there
 * is none (a source missing, or itself virtual), so checks on the primary
 * colour's fills are skipped instead of reading `var()` shades.
 */
function primarySource(t: MantineTheme, scheme: 'light' | 'dark'): string | undefined {
  const colour = t.colors[t.primaryColor];
  const name = isVirtualColor(colour) ? colour[scheme] : t.primaryColor;
  const source = t.colors[name];
  return source && !isVirtualColor(source) ? name : undefined;
}

/**
 * A virtual colour's variables in `scheme`, pointing at its source colour's
 * checked ones. Mantine's own point at the source's raw shades (its text at
 * the filled shade), which this resolver does not check.
 */
function virtualColourVariables(
  t: MantineTheme,
  scheme: 'light' | 'dark',
  checked: Record<string, string>
): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [name, colour] of Object.entries(t.colors)) {
    if (!isVirtualColor(colour)) continue;
    const prefix = `--mantine-color-${colour[scheme]}-`;
    for (const key of Object.keys(checked)) {
      const part = key.startsWith(prefix) ? key.slice(prefix.length) : '';
      if (part && !/^\d+$/.test(part)) variables[`--mantine-color-${name}-${part}`] = `var(${key})`;
    }
  }
  return variables;
}

/**
 * Text, light-variant, outline, filled and indicator colours of every theme
 * colour, moved along its shades only as far as WCAG needs. Mantine uses
 * shade 6 in light mode, which is under 4.5:1 on white for every colour but
 * dark (blue.6 3.6:1, green.6 2.4:1, yellow.6 1.9:1); for yellow, lime,
 * green, teal and orange even shade 9 fails, so those go darker still.
 *
 * Coloured text is checked on the page, gray boxes and cards, on its own
 * light fill, and on the primary colour's light fill (the active NavLink, a
 * selected card) with its own fill on top (a light badge in that card). The
 * primary colour's light variant colour is also checked at the NavLink
 * description's opacity; its text colour, which links use, is not, so links
 * keep as much contrast as they can against the surrounding body text.
 */
function colourVariables(t: MantineTheme): { light: Variables; dark: Variables } {
  const light: Variables = {};
  const dark: Variables = {};
  const lightShade = getPrimaryShade(t, 'light');
  const darkShade = getPrimaryShade(t, 'dark');
  const body = hexToRgb(t.colors.dark[7]);
  const lightOrder = shadesFrom(lightShade);
  const darkFilledOrder = shadesFrom(darkShade);
  const primary = { light: primarySource(t, 'light'), dark: primarySource(t, 'dark') };
  // Text also sits on light gray boxes, and on the darker gray of cards in dark mode
  const grayBox = blend(hexToRgb(t.colors.gray[lightShade]), 0.12, WHITE);
  const darkCard = hexToRgb(t.colors.dark[6]);
  // Progress tracks, which indicators must stand out from
  const lightTrack = hexToRgb(t.colors.gray[2]);
  const darkTrack = hexToRgb(t.colors.dark[4]);

  /** Mantine's light variant fills of `shades` on `under`, at rest and on hover */
  const lightFills = (shades: readonly string[], scheme: 'light' | 'dark', under: Rgb): Rgb[] => {
    const shade = scheme === 'light' ? lightShade : Math.max(0, darkShade - 2);
    return LIGHT_FILL[scheme].map((alpha) => blend(hexToRgb(shades[shade]), alpha, under));
  };
  const primaryFills = (scheme: 'light' | 'dark', under: Rgb): Rgb[] => {
    const name = primary[scheme];
    return name ? lightFills(t.colors[name], scheme, under) : [];
  };
  const primaryLight = primaryFills('light', WHITE);
  const primaryDark = primaryFills('dark', body);
  /** Fills a colour's own light badge makes inside a primary light fill (a selected card) */
  const nestedFills = (shades: readonly string[], scheme: 'light' | 'dark', fills: Rgb[]): Rgb[] =>
    fills.length > 0 ? lightFills(shades, scheme, fills[0]) : [];

  for (const name of shadedColours(t)) {
    const shades = t.colors[name];
    const v = `--mantine-color-${name}`;

    const lightBackgrounds = [
      WHITE,
      grayBox,
      ...lightFills(shades, 'light', WHITE),
      ...primaryLight,
      ...nestedFills(shades, 'light', primaryLight),
    ];
    const lightText = passing(shades, lightOrder, BLACK, lightBackgrounds);
    const lightColor =
      name === primary.light
        ? passing(shades, lightOrder, BLACK, lightBackgrounds, AA, DESCRIPTION_OPACITY)
        : lightText;
    const [lightFilled, lightFilledHover] = filled(shades, lightOrder);
    Object.assign(light, {
      [`${v}-text`]: lightText,
      [`${v}-light-color`]: lightColor,
      [`${v}-outline`]: lightText,
      [`${v}-filled`]: lightFilled,
      [`${v}-filled-hover`]: lightFilledHover,
      [`${v}-indicator`]: passing(shades, lightOrder, BLACK, [WHITE, lightTrack], NON_TEXT),
    });

    const darkBackgrounds = [
      body,
      darkCard,
      ...lightFills(shades, 'dark', body),
      ...primaryDark,
      ...nestedFills(shades, 'dark', primaryDark),
    ];
    // Mantine's own choices (shade 4 for text, 3 for light variants) come first
    const darkText = passing(shades, [4, 3, 2, 1, 0], WHITE, darkBackgrounds);
    const descriptionOpacity = name === primary.dark ? DESCRIPTION_OPACITY : 1;
    const [darkFilled, darkFilledHover] = filled(shades, darkFilledOrder);
    Object.assign(dark, {
      [`${v}-text`]: darkText,
      [`${v}-light-color`]: passing(shades, [3, 2, 1, 0], WHITE, darkBackgrounds, AA, descriptionOpacity),
      [`${v}-outline`]: darkText,
      [`${v}-filled`]: darkFilled,
      [`${v}-filled-hover`]: darkFilledHover,
      [`${v}-indicator`]: passing(
        shades,
        shadesDownFrom(darkShade),
        WHITE,
        [body, darkCard, darkTrack],
        NON_TEXT
      ),
    });
  }
  return { light, dark };
}

/** Resolved variables per theme: the theme object is stable, but the resolver runs on every render */
const resolvedByTheme = new WeakMap<MantineTheme, ReturnType<CSSVariablesResolver>>();

/**
 * Text colours that meet WCAG AA (4.5:1) in both schemes: theme colours
 * (`c="red"`, light, subtle, outline and filled variants), links, which
 * follow the primary colour, error messages, and dimmed text one shade
 * stronger than Mantine's (gray.6 is 3.3:1 on white). Progress bars get
 * indicator colours with 3:1 on their track instead.
 */
export const cssVariablesResolver: CSSVariablesResolver = (t) => {
  const cached = resolvedByTheme.get(t);
  if (cached) return cached;
  const colours = colourVariables(t);
  const links = {
    '--mantine-color-anchor': `var(--mantine-color-${t.primaryColor}-text)`,
    '--mantine-color-error': 'var(--mantine-color-red-text)',
  };
  const resolved = {
    variables: {},
    light: {
      ...colours.light,
      ...virtualColourVariables(t, 'light', colours.light),
      ...links,
      '--mantine-color-dimmed': t.colors.gray[7],
    },
    dark: {
      ...colours.dark,
      ...virtualColourVariables(t, 'dark', colours.dark),
      ...links,
      '--mantine-color-dimmed': t.colors.dark[1],
    },
  };
  resolvedByTheme.set(t, resolved);
  return resolved;
};
