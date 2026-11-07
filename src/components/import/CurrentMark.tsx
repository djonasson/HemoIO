import { Box } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';

interface CurrentMarkProps {
  current: boolean;
}

/** Marks the current choice, beside its name; a space for the others, so names line up */
export function CurrentMark({ current }: CurrentMarkProps): React.ReactElement {
  return (
    <Box component="span" w={14} display="inline-flex" style={{ flexShrink: 0 }}>
      {current && <IconCheck size={14} aria-hidden="true" />}
    </Box>
  );
}

