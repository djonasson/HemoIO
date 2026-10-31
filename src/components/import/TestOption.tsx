import { Box, Group, Text, UnstyledButton } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';

interface TestOptionProps {
  current: boolean;
  onClick: () => void;
  children: string;
}

/** One test to choose; the current one marked with a check, not by color alone */
export function TestOption({ current, onClick, children }: TestOptionProps) {
  return (
    // Spans only: a button holds phrasing content
    <UnstyledButton onClick={onClick} aria-current={current ? 'true' : undefined}>
      <Group component="span" gap={6} wrap="nowrap">
        <Box component="span" w={14} display="inline-flex">
          {current && <IconCheck size={14} aria-hidden="true" />}
        </Box>
        <Text span size="sm" fw={current ? 600 : undefined}>
          {children}
        </Text>
      </Group>
    </UnstyledButton>
  );
}
