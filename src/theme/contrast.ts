/**
 * WCAG colour contrast helpers for hex colours (#rgb or #rrggbb)
 */

/** Red, green and blue channels, 0–255 */
export type Rgb = [number, number, number];

/** Channels of a hex colour */
export function hexToRgb(hex: string): Rgb {
  const short = hex.replace('#', '');
  const value = short.length === 3 ? [...short].map((c) => c + c).join('') : short;
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
}

/** Hex colour of channels, rounded */
export function rgbToHex(color: Rgb): string {
  return `#${color.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** `over` with `alpha` opacity on `under` */
export function blend(over: Rgb, alpha: number, under: Rgb): Rgb {
  return over.map((c, i) => c * alpha + under[i] * (1 - alpha)) as Rgb;
}

/** WCAG relative luminance */
export function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1–21 */
export function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
