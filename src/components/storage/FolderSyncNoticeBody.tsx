/**
 * FolderSyncNoticeBody Component
 *
 * The folder sync notice's text, with what the user can do about a folder
 * copy that cannot be read: choose another folder, or replace the copy.
 */

import { Button, Group, Stack, Text } from '@mantine/core';
import { useChooseFolder } from '@hooks/useChooseFolder';
import { CHOOSE_FOLDER_FAILED } from './folderActionTexts';
import type { FolderProblemActions } from '@services/sync';

export interface FolderSyncNoticeBodyProps {
  /** Fixed text */
  message: string;
  actions: FolderProblemActions;
  /** Folder storage was switched off meanwhile, so there was no folder to choose */
  onFolderStorageOff: () => void;
  /** Ask to confirm replacing the folder copy */
  onReplace: () => void;
}

export function FolderSyncNoticeBody({
  message,
  actions,
  onFolderStorageOff,
  onReplace,
}: FolderSyncNoticeBodyProps): React.ReactNode {
  const chooser = useChooseFolder(onFolderStorageOff);

  return (
    <Stack gap="xs">
      <Text size="sm">{message}</Text>
      {chooser.failed && (
        <Text size="sm" c="red" role="alert">
          {CHOOSE_FOLDER_FAILED}
        </Text>
      )}
      <Group gap="xs">
        {actions.chooseFolder && (
          <Button size="xs" variant="light" onClick={chooser.choose}>
            Choose another folder
          </Button>
        )}
        {actions.replace !== false && (
          <Button size="xs" variant="subtle" color="red" onClick={onReplace}>
            Replace folder copy…
          </Button>
        )}
      </Group>
    </Stack>
  );
}
