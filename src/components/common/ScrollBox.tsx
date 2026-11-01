/**
 * A box whose content scrolls sideways within it
 */

import { Box } from '@mantine/core';
import { useOverflowsX } from '@hooks/useOverflowsX';
import type { ReactNode } from 'react';

export interface ScrollBoxProps {
  /** What the box holds, named for screen readers while it scrolls */
  label: string;
  children: ReactNode;
}

/**
 * Holds wide content, such as a table, so that a narrow screen scrolls only
 * the content instead of widening the page. While there is anything to
 * scroll, the box is a named region that takes focus, so the keyboard can
 * scroll it too.
 */
export function ScrollBox({ label, children }: ScrollBoxProps): React.JSX.Element {
  const [ref, overflows] = useOverflowsX<HTMLDivElement>();
  return (
    <Box
      ref={ref}
      role={overflows ? 'region' : undefined}
      aria-label={overflows ? `${label}, scrollable` : undefined}
      tabIndex={overflows ? 0 : undefined}
      data-scroll-box
      style={{ overflowX: 'auto' }}
    >
      {children}
    </Box>
  );
}
