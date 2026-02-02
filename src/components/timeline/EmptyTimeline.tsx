/**
 * Empty Timeline Component
 *
 * Displays an empty state when no lab results exist, with a CTA to import.
 */

import { Stack, Text, Button, ThemeIcon, Paper } from '@mantine/core';
import { IconFileUpload, IconTimeline } from '@tabler/icons-react';

export interface EmptyTimelineProps {
  /** Callback when import button is clicked */
  onImportClick: () => void;
}

/**
 * Empty state display for the timeline view
 */
export function EmptyTimeline({ onImportClick }: EmptyTimelineProps): React.ReactNode {
  return (
    <Paper p="xl" withBorder radius="md">
      <Stack align="center" gap="lg" py="xl">
        <ThemeIcon size={80} variant="light" radius="xl" color="blue">
          <IconTimeline size={40} />
        </ThemeIcon>

        <Stack align="center" gap="xs">
          <Text size="xl" fw={600}>
            No Lab Results Yet
          </Text>
          <Text c="dimmed" ta="center" maw={400}>
            Import your lab reports to start tracking your health data over time.
            We support PDF files and images of lab results.
          </Text>
        </Stack>

        <Button
          size="lg"
          leftSection={<IconFileUpload size={20} />}
          onClick={onImportClick}
          aria-label="Import lab results"
        >
          Import Lab Results
        </Button>
      </Stack>
    </Paper>
  );
}
