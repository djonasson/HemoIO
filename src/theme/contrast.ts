/**
 * WCAG colour contrast helpers, on Mantine's colour parsing and luminance
 */

import { luminance, toRgba } from '@mantine/core';

/** Red, green and blue channels, 0–255 */
export type Rgb = [number, number, number];

const HEX = /^#([0-9a-f]{3}){1,2}([0-9a-f]{2})?$/i;
const RGB = /^rgba?\(/i;

/**
 * Channels of a hex or rgb() colour. Mantine's toRgba reads anything else
 * (var(), named, hsl() it can't match, oklch()) as black, which would pass
 * for a readable colour, so those throw instead.
 */
export function hexToRgb(color: string): Rgb {
  const value = color.trim();
  if (!HEX.test(value) && !RGB.test(value)) throw new Error(`Cannot read colour "${color}"`);
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
