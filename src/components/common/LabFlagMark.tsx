import { Text, VisuallyHidden } from '@mantine/core';
import { LAB_FLAG_TEXT } from '@/utils/formatTestValue';
import type { ReactElement } from 'react';
import type { LabFlag } from '@/types';

export interface LabFlagMarkProps {
  flag: LabFlag;
}

/**
 * The lab's mark beside a value as printed ("H"); in words on hover and to
 * screen readers, so the mark is never read as a bare letter. A mark it
 * does not know (an old or damaged record) shows nothing.
 */
export function LabFlagMark({ flag }: LabFlagMarkProps): ReactElement | null {
  const text = Object.hasOwn(LAB_FLAG_TEXT, flag) ? LAB_FLAG_TEXT[flag] : undefined;
  if (!text) return null;
  return (
    <span>
      <Text size="xs" fw={700} component="abbr" title={text.label} aria-hidden style={{ textDecoration: 'none' }}>
        {text.mark}
      </Text>
      <VisuallyHidden>{text.label}</VisuallyHidden>
    </span>
  );
}
