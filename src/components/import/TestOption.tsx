import { Box, Group, Text, UnstyledButton } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';

interface TestOptionProps {
  current: boolean;
  onClick: () => void;
  /** The LOINC long name, or "Not a LOINC test" */
  children: string;
  /** The LOINC code, shown after the name */
  code?: string;
}

/** One test to choose; the current one marked with a check, not by color alone */
export function TestOption({ current, onClick, children, code }: TestOptionProps) {
  return (
    // Spans only: a button holds phrasing content
    // The name and code read as one, as they are shown
    <UnstyledButton
      onClick={onClick}
      aria-current={current ? 'true' : undefined}
      aria-label={code ? `${children} · ${code}` : undefined}
    >
      <Group component="span" gap={6} wrap="nowrap" align="flex-start">
        <Box component="span" w={14} display="inline-flex" style={{ flexShrink: 0 }}>
          {current && <IconCheck size={14} aria-hidden="true" />}
        </Box>
        <Text span size="sm" fw={current ? 600 : undefined}>
          {children}
          {code && (
            <Text span size="xs" c="dimmed">
              {' · '}
              {code}
            </Text>
          )}
        </Text>
      </Group>
    </UnstyledButton>
  );
}
