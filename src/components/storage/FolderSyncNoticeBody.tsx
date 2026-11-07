/**
 * FolderSyncNoticeBody Component
 *
 * The folder sync notice's text, with what the user can do about a folder
 * copy that cannot be read: choose another folder, or replace the copy.
 */

import { Button, Group, Stack, Text } from '@mantine/core';
import { useChooseFolder } from '@hooks/useChooseFolder';
import { CHOOSE_FOLDER_FAILED, type FolderProblemActions } from './folderProblemActions';

export interface FolderSyncNoticeBodyProps {
  /** Fixed text */
  message: string;
  actions: FolderProblemActions;
  /**
   * Show the folder picker: called straight from the click, which the
   * picker needs. Resolves false when cancelled; rejects when it failed.
   */
  onChooseFolder: () => Promise<boolean>;
  /** Ask to confirm replacing the folder copy */
  onReplace: () => void;
}

export function FolderSyncNoticeBody({
  message,
  actions,
  onChooseFolder,
  onReplace,
}: FolderSyncNoticeBodyProps): React.ReactNode {
  const chooser = useChooseFolder(onChooseFolder);

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
