/**
 * FolderAccessNoticeBody Component
 *
 * The folder access notice's text, with what the user can do: grant access
 * again, or, where the browser blocks it, choose another folder.
 */

import { useCallback, useState } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import { grantFolderAccess } from '@data/storage/grantFolderAccess';
import { useChooseFolder } from '@hooks/useChooseFolder';
import { CHOOSE_FOLDER_FAILED } from './folderActionTexts';

export const ACCESS_NEEDED_TEXT =
  'Your browser asks for your permission again before HemoIO may use your folder. ' +
  'Until then your data stay in this browser, and are not saved to the folder.';
export const ACCESS_BLOCKED_TEXT =
  "Your browser blocks HemoIO from your folder. Allow it in the browser's site settings, or choose another folder.";
export const ACCESS_NOT_GIVEN_TEXT = 'The browser did not give access to the folder. Try again.';

export interface FolderAccessNoticeBodyProps {
  /** The browser no longer asks: access can only be allowed in its settings */
  blocked: boolean;
  /** Access was given: the folder can be used at once */
  onGranted: () => void;
  /** Folder storage was switched off meanwhile, so there was no folder to choose */
  onFolderStorageOff: () => void;
}

export function FolderAccessNoticeBody({
  blocked,
  onGranted,
  onFolderStorageOff,
}: FolderAccessNoticeBodyProps): React.ReactNode {
  const chooser = useChooseFolder(onFolderStorageOff);
  const [notGiven, setNotGiven] = useState(false);
  const [asking, setAsking] = useState(false);

  // Asked straight from the click: the browser asks only then
  const grant = useCallback(async () => {
    setNotGiven(false);
    setAsking(true);
    try {
      if ((await grantFolderAccess()) === 'granted') onGranted();
      else setNotGiven(true);
    } catch {
      setNotGiven(true);
    } finally {
      setAsking(false);
    }
  }, [onGranted]);

  return (
    <Stack gap="xs">
      <Text size="sm">{blocked ? ACCESS_BLOCKED_TEXT : ACCESS_NEEDED_TEXT}</Text>
      {notGiven && (
        <Text size="sm" c="red" role="alert">
          {ACCESS_NOT_GIVEN_TEXT}
        </Text>
      )}
      {chooser.failed && (
        <Text size="sm" c="red" role="alert">
          {CHOOSE_FOLDER_FAILED}
        </Text>
      )}
      <Group gap="xs">
        {blocked ? (
          <Button size="xs" variant="light" onClick={chooser.choose}>
            Choose another folder
          </Button>
        ) : (
          <Button size="xs" variant="light" onClick={grant} loading={asking}>
            Grant access
          </Button>
        )}
      </Group>
    </Stack>
  );
}
