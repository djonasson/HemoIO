/**
 * The app's Mantine theme
 */
import { createTheme, type CSSVariablesResolver } from '@mantine/core';

export const theme = createTheme({});

/**
 * Dimmed text one shade stronger than Mantine's default (gray.6 is 3.3:1 on
 * white), so secondary text meets WCAG AA (4.5:1) in both schemes, also on
 * the light gray boxes
 */
export const cssVariablesResolver: CSSVariablesResolver = (t) => ({
  variables: {},
  light: { '--mantine-color-dimmed': t.colors.gray[7] },
  dark: { '--mantine-color-dimmed': t.colors.dark[1] },
});
