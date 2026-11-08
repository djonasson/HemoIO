import { Text } from '@mantine/core';
import { LAB_FLAG_TEXT } from '@/utils/formatTestValue';
import type { LabFlag } from '@/types';

export interface LabFlagMarkProps {
  flag: LabFlag;
}

/**
 * The lab's mark beside a value as printed ("H"); in words on hover and to
 * screen readers, so the mark is never read as a bare letter
 */
export function LabFlagMark({ flag }: LabFlagMarkProps) {
  const { mark, label } = LAB_FLAG_TEXT[flag];
  return (
    <Text size="xs" fw={700} component="abbr" title={label} aria-label={label} style={{ textDecoration: 'none' }}>
      {mark}
    </Text>
  );
}
