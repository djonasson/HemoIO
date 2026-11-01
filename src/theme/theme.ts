/**
 * The app's Mantine theme
 */
import { createTheme, type CSSVariablesResolver } from '@mantine/core';

export const theme = createTheme({});

/**
 * Dimmed text one shade stronger than Mantine's default (gray.6 is 3.3:1 on
 * white), so secondary text meets WCAG AA (4.5:1) in both schemes, also on
 * the light gray boxes. Likewise the text of light red alerts, such as a
 * save that failed (red.6 is 2.9:1 on its light red box), and of light blue
 * buttons such as "View trend" (blue.6 is 3.2:1 on its light blue fill),
 * and of links (blue.6 is 3.6:1 on white).
 */
export const cssVariablesResolver: CSSVariablesResolver = (t) => ({
  variables: {},
  light: {
    '--mantine-color-dimmed': t.colors.gray[7],
    '--mantine-color-red-light-color': t.colors.red[9],
    '--mantine-color-blue-light-color': t.colors.blue[9],
    '--mantine-color-anchor': t.colors.blue[9],
  },
  dark: { '--mantine-color-dimmed': t.colors.dark[1] },
});
