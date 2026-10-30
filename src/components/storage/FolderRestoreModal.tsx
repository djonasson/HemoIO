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
import type { FolderRestoreDecision, FolderRestorePrompt } from '@hooks';
import type { ParsedBackupData } from '@services/import';
import type { FolderCopyProblem } from '@services/sync';

export interface FolderRestoreModalProps {
  prompt: FolderRestorePrompt | null;
  /** Restore the copy into this browser; rejects when the restore failed */
  onRestore: (data: ParsedBackupData) => Promise<void>;
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
    case 'not-a-copy':
      return `The file in ${folder} isn't a folder copy HemoIO can read, or it is damaged.`;
    case 'newer-version':
      return (
        `The copy in ${folder} was saved by a newer version of HemoIO. ` +
        'Update HemoIO on this device to restore it.'
      );
    case 'read-failed':
      return `HemoIO couldn't read the file in ${folder}. Check that the folder is available.`;
  }
}

export function FolderRestoreModal({
  prompt,
  onRestore,
  onDecide,
}: FolderRestoreModalProps): React.ReactNode {
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);

  const decide = (decision: FolderRestoreDecision): void => {
    setConfirmingReplace(false);
    setRestoreFailed(false);
    onDecide(decision);
  };

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

  const folder = prompt?.folderName ? `“${prompt.folderName}”` : 'your folder';
  const title = confirmingReplace
    ? REPLACE_TITLE
    : prompt?.kind === 'offer'
      ? OFFER_TITLE
      : UNREADABLE_TITLE;

  const body = (): React.ReactNode => {
    if (!prompt) return null;

    if (confirmingReplace) {
      return (
        <>
          <Text size="sm">
            From now on HemoIO saves this browser&apos;s data to {folder}, and the copy there
            will be replaced. If you might need it, first copy the file hemoio-data.encrypted
            from the folder somewhere safe.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmingReplace(false)} data-autofocus>
              Back
            </Button>
            <Button color="red" onClick={() => decide('sync')}>
              Replace folder copy
            </Button>
          </Group>
        </>
      );
    }

    const actions = (
      <Group justify="flex-end">
        <Button variant="subtle" color="red" onClick={() => setConfirmingReplace(true)} disabled={isRestoring}>
          Replace folder copy…
        </Button>
        <Button
          variant="default"
          onClick={() => decide('hold')}
          disabled={isRestoring}
          data-autofocus={prompt.kind === 'unreadable' || undefined}
        >
          Not now
        </Button>
        {prompt.kind === 'offer' && (
          <Button onClick={() => handleRestore(prompt.data)} loading={isRestoring} data-autofocus>
            Restore
          </Button>
        )}
      </Group>
    );
    const until = 'Nothing is written to the folder until you choose.';

    if (prompt.kind === 'unreadable') {
      return (
        <>
          <Text size="sm">{problemMessage(prompt.reason, folder)}</Text>
          <Text size="sm">
            The file has not been changed. {until} To keep it and sync somewhere else, choose
            another folder in Settings, on the Data tab.
          </Text>
          {actions}
        </>
      );
    }

    const { labResults, testValues, userNotes, exportedAt } = prompt.data;
    return (
      <>
        <Text size="sm">This browser has no lab data, but {folder} has a copy:</Text>
        <List size="sm">
          <List.Item>{count(labResults.length, 'lab result')}</List.Item>
          <List.Item>{count(testValues.length, 'test value')}</List.Item>
          <List.Item>{count(userNotes.length, 'note')}</List.Item>
        </List>
        <Text size="sm">
          Saved {exportedAt.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}
        </Text>
        <Text size="sm">{until}</Text>
        {restoreFailed && (
          <Alert role="alert" color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            The restore did not complete. This browser and the folder copy are as they were;
            try again, or choose &quot;Not now&quot;.
          </Alert>
        )}
        {actions}
      </>
    );
  };

  return (
    <Modal
      opened={prompt !== null}
      // Escape is "Not now"; never during a restore
      onClose={() => !isRestoring && decide('hold')}
      title={title}
      withCloseButton={false}
      closeOnClickOutside={false}
      centered
    >
      <Stack gap="md">{body()}</Stack>
    </Modal>
  );
}
