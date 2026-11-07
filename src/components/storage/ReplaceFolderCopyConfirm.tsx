/**
 * ReplaceFolderCopyConfirm Component
 *
 * The confirmation before "Replace folder copy": what happens to the copy
 * in the folder, the buttons, and the replace while it runs. Shared by the
 * restore question and the sync notice's dialog, which mount it only while
 * it is open: closed or opened again, it starts afresh, and a replace still
 * running from before settles unseen.
 */

import { useEffect, useRef } from 'react';
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useReplaceConfirm } from '@hooks/useReplaceConfirm';
import { MAX_FOLDER_BACKUPS } from '@services/sync';

export interface ReplaceFolderCopyConfirmProps<T> {
  /** The folder as the user knows it: “Name”, or "your folder" */
  folder: string;
  /** The copy may be someone else's: say that their data stops syncing from the folder */
  warnOtherSetup: boolean;
  onBack: () => void;
  /** Keep the copy as a backup and choose to replace it; rejects, choosing nothing, when the backup fails */
  onReplace: () => Promise<T>;
  /** The replace is done, and this confirmation still open: with its result */
  onReplaced: (result: T) => void;
  /** Whether the replace runs: the dialog holding it is not closed meanwhile */
  onReplacingChange: (replacing: boolean) => void;
}

export function ReplaceFolderCopyConfirm<T>({
  folder,
  warnOtherSetup,
  onBack,
  onReplace,
  onReplaced,
  onReplacingChange,
}: ReplaceFolderCopyConfirmProps<T>): React.ReactNode {
  const { isReplacing, failed, run } = useReplaceConfirm();
  useEffect(() => {
    onReplacingChange(isReplacing);
  }, [isReplacing, onReplacingChange]);
  // Closed while it runs: the dialog may close again
  useEffect(() => () => onReplacingChange(false), [onReplacingChange]);

  const confirm = async (): Promise<void> => {
    const done = await run(onReplace);
    if (done) onReplaced(done.value);
  };

  // Shown in place of the question in an open dialog, where the button that
  // led here is gone: the focus moves to Back, as data-autofocus does on opening
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.focus();
  }, []);

  return (
    <Stack gap="md">
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
        <Button color="red" onClick={() => void confirm()} loading={isReplacing}>
          Replace folder copy
        </Button>
      </Group>
    </Stack>
  );
}
