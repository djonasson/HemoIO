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
import { pluralize } from '@/utils/pluralize';
import type { FolderRestoreDecision, FolderRestorePrompt } from '@hooks';
import type { ParsedBackupData } from '@services/import';
import { folderCopyProblemMessage } from './folderCopyProblemMessage';

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
          <Text size="sm">{folderCopyProblemMessage(shown.reason, folder)}</Text>
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
          <List.Item>{pluralize(labResults.length, 'lab result')}</List.Item>
          <List.Item>{pluralize(testValues.length, 'test value')}</List.Item>
          <List.Item>{pluralize(userNotes.length, 'note')}</List.Item>
        </List>
        <Text size="sm">
          {Number.isNaN(exportedAt.getTime()) ? 'Save date unknown' : `Saved ${formatDateTime(exportedAt)}`}
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
