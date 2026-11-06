/**
 * FolderBackups Component
 *
 * Lists the dated backups kept in the folder and restores one after a
 * confirmation. The current folder copy is kept as a dated backup first, so
 * that a restore can itself be undone.
 */

import { useEffect, useRef, useState } from 'react';
import { Alert, List, Button, Modal, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { folderCopyProblemMessage } from '@components/storage/folderCopyProblemMessage';
import { useFolderBackups, type FolderBackupEntry, type FolderBackupReading } from '@hooks/useFolderBackups';
import { useFocusOnShow } from '@hooks/useFocusOnShow';
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

const KEPT_NOTE = 'Your current folder copy is kept as a dated backup first.';
const LEFT_AS_IS_NOTE = "Your current folder copy can't be opened, so HemoIO leaves it as it is.";
const UNREADABLE_MESSAGE = "This backup is damaged or was made with a different key, and can't be opened.";
const NEWER_VERSION_MESSAGE =
  'This backup was saved by a newer version of HemoIO. Update HemoIO on this device to restore it.';

/**
 * Why a backup can't be restored. A backup is sealed with the session key
 * and has no lock, so one that does not open is damaged or another key's;
 * one that opens may still be from a newer HemoIO (a normal case while only
 * one of two computers is updated) or from before LOINC.
 */
function unreadableMessage(reason: Extract<FolderBackupReading, { status: 'unreadable' }>['reason']): string {
  if (reason === 'newer-version') return NEWER_VERSION_MESSAGE;
  if (reason === 'before-loinc') return folderCopyProblemMessage(reason, 'this backup');
  return UNREADABLE_MESSAGE;
}
const KEEP_FAILED_MESSAGE = 'Nothing was changed: the current folder copy could not be kept as a backup.';

const HEADING_ID = 'folder-backups-heading';

/** The backup a restore confirmation shows */
interface PendingRestore {
  name: string;
  data: ParsedBackupData;
  /** Whether the current folder copy can be kept first */
  keepsCurrent: boolean;
  /** Whether it has been kept for this confirmation: a retry must not keep again */
  kept: boolean;
}

export function FolderBackups({ onRestore, setAsideCount = 0 }: FolderBackupsProps): React.ReactNode {
  const { backups, read, canKeepCurrentCopy, keepCurrentCopy, protectShown } = useFolderBackups();
  const [pending, setPending] = useState<PendingRestore | null>(null);
  // While the confirmation shows a backup, no backup kept meanwhile prunes it
  const shownName = pending?.name ?? null;
  useEffect(() => (shownName === null ? undefined : protectShown(shownName)), [shownName, protectShown]);
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Mantine returns focus to the opener of a modal; the read happens before it
  // opens, so name the opener for it
  const opener = useRef<HTMLElement | null>(null);
  // A screen reader user is at the buttons: take them to what went wrong
  const failureAlert = useFocusOnShow<HTMLDivElement>(failure);

  const open = async (entry: FolderBackupEntry, button: HTMLElement): Promise<void> => {
    opener.current = button;
    setProblem(null);
    setFailure(null);
    setOpening(entry.name);
    try {
      const reading = await read(entry.name);
      if (reading.status === 'unreadable') {
        setProblem(unreadableMessage(reading.reason));
        return;
      }
      let keepsCurrent: boolean;
      try {
        keepsCurrent = await canKeepCurrentCopy();
      } catch {
        // Fixed message: the reason could name stored data
        console.error('Could not look at the current folder copy');
        setProblem(KEEP_FAILED_MESSAGE);
        return;
      }
      setPending({ name: entry.name, data: reading.data, keepsCurrent, kept: false });
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
      if (pending.keepsCurrent && !pending.kept) {
        try {
          // The backup being restored is not pruned to make room
          await keepCurrentCopy([pending.name]);
          setPending({ ...pending, kept: true });
        } catch {
          // Fixed message: the reason could name stored data
          console.error('Could not keep the current folder copy as a backup');
          setFailure(KEEP_FAILED_MESSAGE);
          return;
        }
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
              notes={[pending.keepsCurrent ? KEPT_NOTE : LEFT_AS_IS_NOTE]}
              onConfirm={() => void confirm()}
              onCancel={close}
              isRestoring={isRestoring}
            />
            {failure && (
              <Alert
                ref={failureAlert}
                tabIndex={-1}
                role="alert"
                color="red"
                variant="light"
                icon={<IconAlertTriangle size={16} />}
              >
                {failure}
              </Alert>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
