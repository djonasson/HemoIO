/**
 * FolderRestoreModal Component
 *
 * Asks what happens to the copy in the folder when this browser has no lab
 * data: restore it, decide later, or let sync replace it. Shown before folder
 * sync writes anything, so the copy is safe whatever the user picks. A copy
 * that cannot be read comes with what can be done about it: choose another
 * folder, replace it, or read the folder again (folderCopyProblemActions).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Group, List, Modal, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useChooseFolder } from '@hooks/useChooseFolder';
import { useReplaceConfirm } from '@hooks/useReplaceConfirm';
import { formatDateTime } from '@/utils/formatDateTime';
import { pluralize } from '@/utils/pluralize';
import { folderCopyProblemMessage } from './folderCopyProblemMessage';
import {
  CHOOSE_FOLDER_FAILED,
  folderCopyProblemActions,
  type FolderProblemActions,
} from './folderProblemActions';
import { ReplaceFolderCopyConfirm } from './ReplaceFolderCopyConfirm';
import type { FolderReplaceResult, FolderRestoreDecision, FolderRestorePrompt } from '@hooks';
import type { ParsedBackupData } from '@services/import';
import type { FolderCopyProblem } from '@services/sync';

export interface FolderRestoreModalProps {
  prompt: FolderRestorePrompt | null;
  /**
   * Restore the copy into this browser; rejects when the restore failed.
   * False when the data changed while the user decided: nothing was
   * restored, and the question is asked again.
   */
  onRestore: (data: ParsedBackupData) => Promise<boolean>;
  /**
   * Keep the folder copy the prompt shown is about as a dated backup, so
   * that the sync may write over it; rejects, choosing nothing, when the
   * backup cannot be saved. 'changed' when the folder or the file is no
   * longer the one shown: nothing was kept, and the question is asked again.
   */
  onReplace: (prompt: FolderRestorePrompt) => Promise<FolderReplaceResult>;
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
  const replacing = useReplaceConfirm();
  const chooser = useChooseFolder(onChooseFolder);
  // The last prompt stays on screen while the dialog closes; a new one starts afresh
  const [shown, setShown] = useState(prompt);
  if (prompt !== null && prompt !== shown) {
    setShown(prompt);
    setConfirmingReplace(false);
    setRestoreFailed(false);
    chooser.reset();
  }
  const decide = onDecide;
  // The question asked now: a replace answers only the one it was confirmed on
  const promptRef = useRef(prompt);
  useLayoutEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);
  // Back from the confirmation puts the focus on the button that led there
  const replaceButtonRef = useRef<HTMLButtonElement>(null);
  const focusReplaceRef = useRef(false);
  useEffect(() => {
    if (confirmingReplace || !focusReplaceRef.current) return;
    focusReplaceRef.current = false;
    replaceButtonRef.current?.focus();
  }, [confirmingReplace]);

  const openConfirmation = (): void => {
    replacing.reset();
    setConfirmingReplace(true);
  };

  const backFromConfirmation = (): void => {
    replacing.reset();
    focusReplaceRef.current = true;
    setConfirmingReplace(false);
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

  const handleReplace = async (answered: FolderRestorePrompt): Promise<void> => {
    const done = await replacing.run(() => onReplace(answered));
    // Failed (shown), or the confirmation was left meanwhile
    if (!done) return;
    // Another question was asked meanwhile (another folder): this one no longer decides
    if (promptRef.current !== answered) return;
    if (done.value === 'changed') onRecheck();
    else decide('sync');
  };

  const folder = shown?.folderName ? `“${shown.folderName}”` : 'your folder';
  const title = confirmingReplace
    ? REPLACE_TITLE
    : shown?.kind === 'offer'
      ? OFFER_TITLE
      : UNREADABLE_TITLE;

  const body = (): React.ReactNode => {
    if (!shown) return null;

    // What a replace is about: the copy offered, or one that cannot be read
    const unreadable = shown.kind === 'unreadable' ? shown : (shown.damagedCurrent ?? null);
    const replaceAction = unreadable ? folderCopyProblemActions(unreadable.reason).replace : 'replace';
    const canReplace = unreadable === null || (replaceAction !== false && unreadable.replaceable && unreadable.target !== null);

    if (confirmingReplace) {
      return (
        <ReplaceFolderCopyConfirm
          folder={folder}
          warnOtherSetup={replaceAction === 'warn'}
          isReplacing={replacing.isReplacing}
          failed={replacing.failed}
          onBack={backFromConfirmation}
          onConfirm={() => void handleReplace(shown)}
        />
      );
    }

    const replaceButton = canReplace && (
      <Button ref={replaceButtonRef} variant="subtle" color="red" onClick={openConfirmation} disabled={isRestoring}>
        Replace folder copy…
      </Button>
    );

    if (shown.kind === 'unreadable') {
      const actions = folderCopyProblemActions(shown.reason);
      return (
        <>
          <Text size="sm">{folderCopyProblemMessage(shown.reason, folder)}</Text>
          <Text size="sm">{unreadableHint(shown.reason, { ...actions, replace: canReplace && actions.replace })}</Text>
          {chooser.failed && (
            <Alert role="alert" color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
              {CHOOSE_FOLDER_FAILED}
            </Alert>
          )}
          <Group justify="flex-end">
            {replaceButton}
            {actions.chooseFolder && (
              <Button variant="default" onClick={chooser.choose}>
                Choose another folder
              </Button>
            )}
            {/* The focus is on "Try again" where it is offered: a second Enter tries again, not "Not now" */}
            {actions.tryAgain && (
              <Button variant="default" onClick={onRecheck} data-autofocus>
                Try again
              </Button>
            )}
            <Button variant="default" onClick={() => decide('hold')} data-autofocus={!actions.tryAgain || undefined}>
              Not now
            </Button>
          </Group>
        </>
      );
    }

    const { labResults, testValues, userNotes, exportedAt } = shown.data;
    return (
      <>
        {shown.damagedCurrent && (
          <Text size="sm" fw={500}>
            The latest copy in {folder} is damaged, so the previous copy is offered instead.
          </Text>
        )}
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
          {replaceButton}
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
        if (isRestoring || replacing.isReplacing) return;
        if (confirmingReplace) backFromConfirmation();
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
