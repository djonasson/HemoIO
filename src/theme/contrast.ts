/**
 * WCAG colour contrast helpers, on Mantine's colour parsing and luminance
 */

import { luminance, toRgba } from '@mantine/core';

/** Red, green and blue channels, 0–255 */
export type Rgb = [number, number, number];

const NUMBER = String.raw`\d+(?:\.\d+)?|\.\d+`;
const ALPHA = String.raw`(?:\s*,\s*(${NUMBER}))?`;
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
// Comma syntax only: toRgba strips everything but digits, commas, dots and
// slashes, so `rgb(24 100 171)` would read as one huge channel
const RGB = new RegExp(String.raw`^rgba?\(\s*(?:${NUMBER})\s*,\s*(?:${NUMBER})\s*,\s*(?:${NUMBER})${ALPHA}\s*\)$`);
// Whole-number hue, saturation and lightness, as toRgba's own pattern; it
// reads hues over 360 wrong, so those are out too
const HSL = new RegExp(String.raw`^hsla?\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%${ALPHA}\s*\)$`);

/**
 * `color` normalised into what toRgba reads correctly, and its opacity, or
 * undefined. toRgba reads anything it can't match (var(), named colours,
 * oklch(), space-separated rgb() and hsl(), upper case `RGB(`, 4-digit hex)
 * as black, which would pass for a readable colour, and 5-digit hex as a
 * wrong colour, so only these are let through.
 */
function normalise(color: string): [string, number] | undefined {
  const value = color.trim().toLowerCase();
  if (HEX.test(value)) {
    const digits = value.slice(1);
    // #rgb(a) to #rrggbb(aa), as toRgba reads 3, 6 and 8 digits only
    const long = digits.length <= 4 ? [...digits].map((d) => d + d).join('') : digits;
    const alpha = long.length === 8 ? parseInt(long.slice(6), 16) / 255 : 1;
    return [`#${long}`, alpha];
  }
  const rgb = RGB.exec(value);
  if (rgb) return [value, rgb[1] === undefined ? 1 : Number(rgb[1])];
  const hsl = HSL.exec(value);
  if (hsl && Number(hsl[1]) <= 360 && Number(hsl[2]) <= 100 && Number(hsl[3]) <= 100) {
    return [value, hsl[4] === undefined ? 1 : Number(hsl[4])];
  }
  return undefined;
}

/**
 * Channels of an opaque hex (3, 4, 6 or 8 digits), rgb()/rgba() or
 * hsl()/hsla() colour (comma syntax), in any letter case. Anything else
 * throws. So do translucent colours: their contrast depends on what is under
 * them, and blending over white would be wrong for dark mode, so callers
 * blend explicitly instead.
 */
export function hexToRgb(color: string): Rgb {
  const normalised = normalise(color);
  if (!normalised) throw new Error(`Cannot read colour "${color}"`);
  const [value, alpha] = normalised;
  if (alpha < 1) throw new Error(`Colour "${color}" is translucent; blend it onto its background first`);
  const { r, g, b } = toRgba(value);
  const channels: Rgb = [r, g, b];
  if (!channels.every((c) => Number.isFinite(c) && c >= 0 && c <= 255)) {
    throw new Error(`Cannot read colour "${color}"`);
  }
  return channels;
}

/** Hex colour of channels, rounded */
export function rgbToHex(color: Rgb): string {
  return `#${color.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** `over` with `alpha` opacity on `under` */
export function blend(over: Rgb, alpha: number, under: Rgb): Rgb {
  return over.map((c, i) => c * alpha + under[i] * (1 - alpha)) as Rgb;
}

/** WCAG contrast ratio, 1–21 */
export function contrast(a: Rgb, b: Rgb): number {
  const lum = (c: Rgb) => luminance(`rgb(${c.join(', ')})`);
  const [light, dark] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
