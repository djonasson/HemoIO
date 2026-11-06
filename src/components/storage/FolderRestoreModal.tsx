/**
 * FolderRestoreModal Component
 *
 * Asks what happens to the copy in the folder when this browser has no lab
 * data: restore it, decide later, or let sync replace it. Shown before folder
 * sync writes anything, so the copy is safe whatever the user picks.
 */

import { useState } from 'react';
import { Alert, Button, Group, List, Modal, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { formatDateTime } from '@/utils/formatDateTime';
import type { FolderRestoreDecision, FolderRestorePrompt } from '@hooks';
import { PRE_LOINC_BACKUP_MESSAGE, type ParsedBackupData } from '@services/import';
import type { FolderCopyProblem } from '@services/sync';

export interface FolderRestoreModalProps {
  prompt: FolderRestorePrompt | null;
  /** Restore the copy into this browser; rejects when the restore failed */
  onRestore: (data: ParsedBackupData) => Promise<void>;
  /**
   * Keep the folder copy as a dated backup, so that the sync may write over
   * it; rejects, choosing nothing, when the backup cannot be saved
   */
  onReplace: () => Promise<void>;
  onDecide: (decision: FolderRestoreDecision) => void;
}

const OFFER_TITLE = 'Restore your data from the folder?';
const UNREADABLE_TITLE = "The folder copy can't be read";
const REPLACE_TITLE = 'Replace the folder copy?';

function count(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? '' : 's'}`;
}

function problemMessage(reason: FolderCopyProblem, folder: string): string {
  switch (reason) {
    case 'cannot-decrypt':
      return (
        `The copy in ${folder} can't be opened with your password. It was saved with a ` +
        'different password or by an earlier setup of HemoIO, or the file is damaged.'
      );
    case 'another-setup':
      // Task 9b adds where that setup is made
      return (
        `The copy in ${folder} belongs to another HemoIO setup, made with a different key. ` +
        "HemoIO won't write over it. To use that folder on this computer, HemoIO must be " +
        "set up again from that folder's copy."
      );
    case 'not-a-copy':
      return `The file in ${folder} isn't a folder copy HemoIO can read, or it is damaged.`;
    case 'newer-version':
      return (
        `The copy in ${folder} was saved by a newer version of HemoIO. ` +
        'Update HemoIO on this device to restore it.'
      );
    case 'before-loinc':
      return PRE_LOINC_BACKUP_MESSAGE;
    case 'read-failed':
      return `HemoIO couldn't read the file in ${folder}. Check that the folder is available.`;
  }
}

export function FolderRestoreModal({
  prompt,
  onRestore,
  onReplace,
  onDecide,
}: FolderRestoreModalProps): React.ReactNode {
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [replaceFailed, setReplaceFailed] = useState(false);
  // The last prompt stays on screen while the dialog closes; a new one starts afresh
  const [shown, setShown] = useState(prompt);
  if (prompt !== null && prompt !== shown) {
    setShown(prompt);
    setConfirmingReplace(false);
    setRestoreFailed(false);
    setReplaceFailed(false);
  }
  const decide = onDecide;

  const handleRestore = async (data: ParsedBackupData): Promise<void> => {
    setIsRestoring(true);
    setRestoreFailed(false);
    try {
      await onRestore(data);
    } catch {
      setRestoreFailed(true);
      return;
    } finally {
      setIsRestoring(false);
    }
    // Only now: the first write to the folder then holds the restored data
    decide('sync');
  };

  const handleReplace = async (): Promise<void> => {
    setIsReplacing(true);
    setReplaceFailed(false);
    try {
      await onReplace();
    } catch {
      // Not shown: the reason could name stored data, and nothing was chosen
      setReplaceFailed(true);
      return;
    } finally {
      setIsReplacing(false);
    }
    decide('sync');
  };

  const folder = shown?.folderName ? `“${shown.folderName}”` : 'your folder';
  const title = confirmingReplace
    ? REPLACE_TITLE
    : shown?.kind === 'offer'
      ? OFFER_TITLE
      : UNREADABLE_TITLE;

  const body = (): React.ReactNode => {
    if (!shown) return null;

    if (confirmingReplace) {
      return (
        <>
          <Text size="sm">
            From now on HemoIO saves this browser&apos;s data to {folder}, and the copy there
            will be replaced. It is kept as a dated backup in the folder first.
          </Text>
          {replaceFailed && (
            <Alert role="alert" color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
              Nothing was changed: the folder copy could not be kept as a backup.
            </Alert>
          )}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setConfirmingReplace(false)}
              disabled={isReplacing}
              data-autofocus
            >
              Back
            </Button>
            <Button color="red" onClick={() => void handleReplace()} loading={isReplacing}>
              Replace folder copy
            </Button>
          </Group>
        </>
      );
    }

    if (shown.kind === 'unreadable') {
      return (
        <>
          <Text size="sm">{problemMessage(shown.reason, folder)}</Text>
          <Text size="sm">
            {/* The explanation of another setup's copy says already that it is not written over */}
            {shown.reason === 'another-setup'
              ? 'The file has not been changed.'
              : 'The file has not been changed, and HemoIO will not write over it.'}{' '}
            To keep syncing, choose another folder in Settings, on the Data tab.
          </Text>
          {/* The sync never writes over a copy it cannot read: there is no replacing it */}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => decide('hold')} data-autofocus>
              Not now
            </Button>
          </Group>
        </>
      );
    }

    const { labResults, testValues, userNotes, exportedAt } = shown.data;
    return (
      <>
        <Text size="sm">
          {shown.replacesBrowserData
            ? `This browser had no lab data when you unlocked HemoIO, and ${folder} has a copy:`
            : `This browser has no lab data, but ${folder} has a copy:`}
        </Text>
        <List size="sm">
          <List.Item>{count(labResults.length, 'lab result')}</List.Item>
          <List.Item>{count(testValues.length, 'test value')}</List.Item>
          <List.Item>{count(userNotes.length, 'note')}</List.Item>
        </List>
        <Text size="sm">
          Saved {formatDateTime(exportedAt)}
        </Text>
        {shown.replacesBrowserData && (
          <Text size="sm" fw={500}>
            Restoring replaces the lab data added to this browser since you unlocked HemoIO.
          </Text>
        )}
        <Text size="sm">Nothing is written to the folder until you choose.</Text>
        {restoreFailed && (
          <Alert role="alert" color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            The restore did not complete. This browser and the folder copy are as they were;
            try again, or choose &quot;Not now&quot;.
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" color="red" onClick={() => setConfirmingReplace(true)} disabled={isRestoring}>
            Replace folder copy…
          </Button>
          <Button variant="default" onClick={() => decide('hold')} disabled={isRestoring}>
            Not now
          </Button>
          <Button onClick={() => handleRestore(shown.data)} loading={isRestoring} data-autofocus>
            Restore
          </Button>
        </Group>
      </>
    );
  };

  return (
    <Modal
      opened={prompt !== null}
      // Escape is "Back" on the confirmation, else "Not now"; never during a restore
      onClose={() => {
        if (isRestoring || isReplacing) return;
        if (confirmingReplace) setConfirmingReplace(false);
        else decide('hold');
      }}
      title={title}
      withCloseButton={false}
      closeOnClickOutside={false}
      centered
    >
      <Stack gap="md">{body()}</Stack>
    </Modal>
  );
}
