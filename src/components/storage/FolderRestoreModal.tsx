/**
 * FolderRestoreModal Component
 *
 * Asks what happens to the copy in the folder when this browser has no lab
 * data: restore it, decide later, or let sync replace it. Shown before folder
 * sync writes anything, so the copy is safe whatever the user picks. A copy
 * that cannot be read comes with what can be done about it: choose another
 * folder, replace it, or read the folder again (folderCopyProblemActions).
 */

import { useState } from 'react';
import { Alert, Button, Group, List, Modal, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { formatDateTime } from '@/utils/formatDateTime';
import { pluralize } from '@/utils/pluralize';
import type { FolderRestoreDecision, FolderRestorePrompt } from '@hooks';
import type { ParsedBackupData } from '@services/import';
import type { FolderCopyProblem } from '@services/sync';
import { folderCopyProblemMessage } from './folderCopyProblemMessage';
import { folderCopyProblemActions, type FolderProblemActions } from './folderProblemActions';
import { ReplaceFolderCopyConfirm } from './ReplaceFolderCopyConfirm';

export interface FolderRestoreModalProps {
  prompt: FolderRestorePrompt | null;
  /**
   * Restore the copy into this browser; rejects when the restore failed.
   * False when the data changed while the user decided: nothing was
   * restored, and the question is asked again.
   */
  onRestore: (data: ParsedBackupData) => Promise<boolean>;
  /**
   * Keep the folder copy as a dated backup, so that the sync may write over
   * it; rejects, choosing nothing, when the backup cannot be saved. For a
   * copy offered and for one that cannot be read alike.
   */
  onReplace: () => Promise<void>;
  onDecide: (decision: FolderRestoreDecision) => void;
  /**
   * Show the folder picker; called straight from the click, which the
   * picker needs. Resolves false when cancelled (the question stays), and
   * rejects when the folder could not be chosen.
   */
  onChooseFolder: () => Promise<boolean>;
  /** Look at the folder again: "Try again" when the file could not be read */
  onRecheck: () => void;
}

const OFFER_TITLE = 'Restore your data from the folder?';
const UNREADABLE_TITLE = "The folder copy can't be read";
const REPLACE_TITLE = 'Replace the folder copy?';

/** What follows the problem: the file is untouched, and the ways on */
function unreadableHint(reason: FolderCopyProblem, actions: FolderProblemActions): string {
  if (actions.replace !== false) {
    return "The file has not been changed. To keep syncing, choose another folder, or replace the folder copy with this computer's data.";
  }
  if (actions.tryAgain) return 'The file has not been changed. Try again, or choose another folder.';
  // The explanation of another setup's copy says already that it is not written over
  if (reason === 'another-setup') return 'The file has not been changed. To keep syncing, choose another folder.';
  return 'The file has not been changed, and HemoIO will not write over it.';
}

export function FolderRestoreModal({
  prompt,
  onRestore,
  onReplace,
  onDecide,
  onChooseFolder,
  onRecheck,
}: FolderRestoreModalProps): React.ReactNode {
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [replaceFailed, setReplaceFailed] = useState(false);
  const [chooseFailed, setChooseFailed] = useState(false);
  // The last prompt stays on screen while the dialog closes; a new one starts afresh
  const [shown, setShown] = useState(prompt);
  if (prompt !== null && prompt !== shown) {
    setShown(prompt);
    setConfirmingReplace(false);
    setRestoreFailed(false);
    setReplaceFailed(false);
    setChooseFailed(false);
  }
  const decide = onDecide;

  const handleChooseFolder = (): void => {
    setChooseFailed(false);
    // Nothing awaited first: the picker needs the click's user activation.
    // A folder chosen is looked at afresh, which closes this question.
    onChooseFolder().catch(() => setChooseFailed(true));
  };

  const handleRestore = async (data: ParsedBackupData): Promise<void> => {
    setIsRestoring(true);
    setRestoreFailed(false);
    let restored: boolean;
    try {
      restored = await onRestore(data);
    } catch {
      setRestoreFailed(true);
      return;
    } finally {
      setIsRestoring(false);
    }
    // Only now: the first write to the folder then holds the restored data
    if (restored) decide('sync');
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
        <ReplaceFolderCopyConfirm
          folder={folder}
          warnOtherSetup={shown.kind === 'unreadable' && folderCopyProblemActions(shown.reason).replace === 'warn'}
          isReplacing={isReplacing}
          failed={replaceFailed}
          onBack={() => setConfirmingReplace(false)}
          onConfirm={() => void handleReplace()}
        />
      );
    }

    if (shown.kind === 'unreadable') {
      const actions = folderCopyProblemActions(shown.reason);
      return (
        <>
          <Text size="sm">{folderCopyProblemMessage(shown.reason, folder)}</Text>
          <Text size="sm">{unreadableHint(shown.reason, actions)}</Text>
          {chooseFailed && (
            <Alert role="alert" color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
              The folder could not be chosen. Nothing was changed; try again, or choose a folder in
              Settings, on the Data tab.
            </Alert>
          )}
          <Group justify="flex-end">
            {actions.replace !== false && (
              <Button variant="subtle" color="red" onClick={() => setConfirmingReplace(true)}>
                Replace folder copy…
              </Button>
            )}
            {actions.chooseFolder && (
              <Button variant="default" onClick={handleChooseFolder}>
                Choose another folder
              </Button>
            )}
            {actions.tryAgain && (
              <Button variant="default" onClick={onRecheck}>
                Try again
              </Button>
            )}
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
