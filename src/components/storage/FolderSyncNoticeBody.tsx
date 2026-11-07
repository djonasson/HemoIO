/**
 * FolderSyncNoticeBody Component
 *
 * The folder sync notice's text, with what the user can do about a folder
 * copy that cannot be read: choose another folder, or replace the copy.
 */

import { useState } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import type { FolderProblemActions } from './folderProblemActions';

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
  const [chooseFailed, setChooseFailed] = useState(false);

  const handleChooseFolder = (): void => {
    setChooseFailed(false);
    // Nothing awaited first: the picker needs the click's user activation
    onChooseFolder().catch(() => setChooseFailed(true));
  };

  return (
    <Stack gap="xs">
      <Text size="sm">{message}</Text>
      {chooseFailed && (
        <Text size="sm" c="red" role="alert">
          The folder could not be chosen. Nothing was changed; try again, or choose a folder in
          Settings, on the Data tab.
        </Text>
      )}
      <Group gap="xs">
        {actions.chooseFolder && (
          <Button size="xs" variant="light" onClick={handleChooseFolder}>
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
