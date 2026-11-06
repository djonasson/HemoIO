/**
 * FolderBackups Component
 *
 * Lists the dated backups kept in the folder and restores one after a
 * confirmation. The current folder copy is kept as a dated backup first, so
 * that a restore can itself be undone.
 */

import { useRef, useState } from 'react';
import { Alert, List, Button, Modal, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useFolderBackups, type FolderBackupEntry } from '@hooks/useFolderBackups';
import { folderCopyProblemMessage } from '@components/storage/folderCopyProblemMessage';
import { formatDateTime } from '@/utils/formatDateTime';
import type { ParsedBackupData } from '@services/import';
import { RestoreConfirmation } from './RestoreConfirmation';
import type { RestoreOptions } from './BackupRestore';

export interface FolderBackupsProps {
  onRestore: (data: ParsedBackupData, options: RestoreOptions) => Promise<void>;
  /** Records HemoIO cannot open: a restore keeps them aside */
  setAsideCount?: number;
}

const KIND_LABEL: Record<FolderBackupEntry['kind'], string> = {
  conflict: 'kept from a choice',
  'before-load': 'kept before loading from the folder',
};

const HEADING_ID = 'folder-backups-heading';

export function FolderBackups({ onRestore, setAsideCount = 0 }: FolderBackupsProps): React.ReactNode {
  const { backups, read, keepCurrentCopy } = useFolderBackups();
  const [pending, setPending] = useState<{ data: ParsedBackupData } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Mantine returns focus to the opener of a modal; the read happens before it
  // opens, so name the opener for it
  const opener = useRef<HTMLElement | null>(null);

  const open = async (entry: FolderBackupEntry, button: HTMLElement): Promise<void> => {
    opener.current = button;
    setProblem(null);
    setFailure(null);
    setOpening(entry.name);
    try {
      const reading = await read(entry.name);
      if (reading.status === 'unreadable') {
        setProblem(folderCopyProblemMessage(reading.reason, 'your folder'));
        return;
      }
      setPending({ data: reading.data });
    } finally {
      setOpening(null);
    }
  };

  const close = (): void => {
    if (isRestoring) return;
    setPending(null);
    setFailure(null);
    opener.current?.focus();
  };

  const confirm = async (): Promise<void> => {
    if (!pending) return;
    setIsRestoring(true);
    setFailure(null);
    try {
      try {
        await keepCurrentCopy();
      } catch {
        // Fixed message: the reason could name stored data
        console.error('Could not keep the current folder copy as a backup');
        setFailure('Nothing was changed: the current folder copy could not be kept as a backup.');
        return;
      }
      try {
        await onRestore(pending.data, { restoreAISettings: false });
      } catch {
        setFailure('The restore did not complete. Your data is as it was; try again.');
        return;
      }
      setPending(null);
      opener.current?.focus();
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Stack component="section" gap="sm" aria-labelledby={HEADING_ID}>
      <Title order={3} size="h5" id={HEADING_ID}>
        Folder backups
      </Title>
      <Text size="sm" c="dimmed">
        Kept when your folder copy and this computer disagreed, and before a newer copy was loaded.
        The 10 newest of each kind are kept.
      </Text>

      {problem && (
        <Alert role="alert" color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
          {problem}
        </Alert>
      )}

      {backups.length === 0 ? (
        <Text size="sm">No folder backups yet.</Text>
      ) : (
        <List listStyleType="none" spacing="xs" size="sm">
          {backups.map((entry) => {
            const saved = formatDateTime(entry.savedAt);
            return (
              <List.Item key={entry.name} styles={{ itemWrapper: { width: '100%' }, itemLabel: { width: '100%' } }}>
                <Stack gap={4} align="flex-start">
                  <Text size="sm">
                    Saved {saved}, {KIND_LABEL[entry.kind]}
                  </Text>
                  <Button
                    size="xs"
                    variant="default"
                    aria-label={`Restore the backup saved ${saved}, ${KIND_LABEL[entry.kind]}`}
                    loading={opening === entry.name}
                    disabled={opening !== null}
                    onClick={(event) => void open(entry, event.currentTarget)}
                  >
                    Restore…
                  </Button>
                </Stack>
              </List.Item>
            );
          })}
        </List>
      )}

      <Modal opened={pending !== null} onClose={close} title="Restore folder backup" centered>
        {pending && (
          <Stack gap="md">
            <RestoreConfirmation
              preview={{
                exportedAt: pending.data.exportedAt,
                labResultCount: pending.data.labResults.length,
                testValueCount: pending.data.testValues.length,
                noteCount: pending.data.userNotes.length,
              }}
              setAsideCount={setAsideCount}
              notes={['Your current folder copy is kept as a dated backup first.']}
              onConfirm={() => void confirm()}
              onCancel={close}
              isRestoring={isRestoring}
            />
            {failure && (
              <Alert role="alert" color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
                {failure}
              </Alert>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
