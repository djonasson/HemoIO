/**
 * ReplaceFolderCopyConfirm Component
 *
 * The confirmation before "Replace folder copy": what happens to the copy
 * in the folder, and the buttons. Shared by the restore question and the
 * sync notice's dialog, which hold the state.
 */

import { useEffect, useRef } from 'react';
import { Alert, Button, Group, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { MAX_FOLDER_BACKUPS } from '@services/sync';

export interface ReplaceFolderCopyConfirmProps {
  /** The folder as the user knows it: “Name”, or "your folder" */
  folder: string;
  /** The copy may be someone else's: say that their data stops syncing from the folder */
  warnOtherSetup: boolean;
  isReplacing: boolean;
  /** The backup could not be saved, so nothing was changed */
  failed: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

export function ReplaceFolderCopyConfirm({
  folder,
  warnOtherSetup,
  isReplacing,
  failed,
  onBack,
  onConfirm,
}: ReplaceFolderCopyConfirmProps): React.ReactNode {
  // Shown in place of the question in an open dialog, where the button that
  // led here is gone: the focus moves to Back, as data-autofocus does on opening
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.focus();
  }, []);

  return (
    <>
      <Text size="sm">
        From now on HemoIO saves this computer&apos;s data to {folder}, and the copy there will be
        replaced. What the folder holds now is kept as a dated backup first, in its hemoio-backups
        folder; HemoIO keeps the {MAX_FOLDER_BACKUPS} newest backups.
      </Text>
      {warnOtherSetup && (
        <Text size="sm" fw={500}>
          If the copy was made with another password or by someone else&apos;s HemoIO setup, it will
          no longer sync from this folder. It is kept in hemoio-backups as it was, and can still be
          restored there with that password.
        </Text>
      )}
      {failed && (
        <Alert role="alert" color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
          Nothing was changed: the folder copy could not be kept as a backup.
        </Alert>
      )}
      <Group justify="flex-end">
        <Button ref={backRef} variant="default" onClick={onBack} disabled={isReplacing} data-autofocus>
          Back
        </Button>
        <Button color="red" onClick={onConfirm} loading={isReplacing}>
          Replace folder copy
        </Button>
      </Group>
    </>
  );
}
