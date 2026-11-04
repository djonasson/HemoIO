/**
 * A box whose content scrolls sideways within it
 */

import { useState } from 'react';
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
 * scroll it too. It stays one while focused, so a screen that turns or
 * widens under the keyboard does not drop its focus.
 */
export function ScrollBox({ label, children }: ScrollBoxProps): React.JSX.Element {
  const [ref, overflows] = useOverflowsX<HTMLDivElement>();
  const [focused, setFocused] = useState(false);
  const scrollable = overflows || focused;
  return (
    <Box
      ref={ref}
      role={scrollable ? 'region' : undefined}
      aria-label={scrollable ? `${label}, scrollable` : undefined}
      tabIndex={scrollable ? 0 : undefined}
      onFocus={(event) => setFocused(event.target === event.currentTarget)}
      // Leaving the window blurs the box too; it keeps focus to come back to
      onBlur={() => {
        if (document.hasFocus()) setFocused(false);
      }}
      data-scroll-box
      style={{ overflowX: 'auto' }}
    >
      {children}
    </Box>
  );
}
