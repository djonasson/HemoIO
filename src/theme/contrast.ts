/**
 * WCAG colour contrast helpers, on Mantine's colour parsing and luminance
 */

import { luminance, toRgba } from '@mantine/core';

/** Red, green and blue channels, 0–255 */
export type Rgb = [number, number, number];

/** Channels of a colour in any CSS form Mantine reads (hex, rgb(), hsl()) */
export function hexToRgb(color: string): Rgb {
  const { r, g, b } = toRgba(color);
  return [r, g, b];
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
