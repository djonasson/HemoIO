/**
 * RestoreConfirmation Component
 *
 * What a restore replaces and what it keeps, asked before the restore: the
 * body of a restore confirmation dialog, for each place a restore starts.
 */

import { Alert, Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconAlertCircle, IconKey, IconLock } from '@tabler/icons-react';
import { setAsideKeptLine } from '@components/storage/setAsideCopy';
import { formatDateTime } from '@/utils/formatDateTime';

export interface RestoreConfirmationProps {
  preview: {
    exportedAt: Date;
    labResultCount: number;
    testValueCount: number;
    noteCount: number;
    wasEncrypted?: boolean;
    hasApiKey?: boolean;
  };
  /** Records HemoIO cannot open: a restore keeps them aside */
  setAsideCount: number;
  /** Extra lines above the buttons, such as Task 8's folder-backup note */
  notes?: string[];
  onConfirm: () => void;
  onCancel: () => void;
  isRestoring: boolean;
  /** Choices about the restore, such as BackupRestore's AI checkbox */
  children?: React.ReactNode;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function RestoreConfirmation({
  preview,
  setAsideCount,
  notes = [],
  onConfirm,
  onCancel,
  isRestoring,
  children,
}: RestoreConfirmationProps): React.ReactNode {
  const lines = setAsideCount > 0 ? [setAsideKeptLine(setAsideCount), ...notes] : notes;

  return (
    <Stack gap="md">
      <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
        This will replace all your current data with the data from the backup. This action cannot
        be undone.
      </Alert>

      <Paper p="sm" withBorder>
        <Stack gap="xs">
          <Group gap="xs">
            <Text size="sm" fw={500}>
              Backup Contents
            </Text>
            {preview.wasEncrypted === true && (
              <Badge size="xs" color="green" leftSection={<IconLock size={10} />}>
                Encrypted
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            Created: {formatDateTime(preview.exportedAt)}
          </Text>
          <Text size="sm" c="dimmed">
            {plural(preview.labResultCount, 'lab result')},{' '}
            {plural(preview.testValueCount, 'test value')}, {plural(preview.noteCount, 'note')}
          </Text>
          {preview.hasApiKey === true && (
            <Group gap="xs">
              <IconKey size={14} />
              <Text size="sm" c="green">
                Includes API key
              </Text>
            </Group>
          )}
        </Stack>
      </Paper>

      {children}

      {lines.map((line) => (
        <Text key={line} size="sm">
          {line}
        </Text>
      ))}

      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" onClick={onCancel}>
          Cancel
        </Button>
        <Button color="red" onClick={onConfirm} loading={isRestoring}>
          Restore
        </Button>
      </Group>
    </Stack>
  );
}
