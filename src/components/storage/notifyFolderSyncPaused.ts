/**
 * Told when the user holds folder sync: after "Not now" on the restore
 * question, or "Decide later" on a conflict. Shown by the hold itself, so
 * every way of holding says the same.
 */

import { notifications } from '@mantine/notifications';

export function notifyFolderSyncPaused(): void {
  notifications.show({
    title: 'Folder Sync Paused',
    message:
      'Nothing is saved to your folder for now, and the copy there is unchanged. HemoIO asks again when you next unlock, or when you grant folder access or choose a folder in Settings.',
    color: 'yellow',
  });
}
