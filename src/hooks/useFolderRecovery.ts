/**
 * Setting HemoIO up from a folder copy: the folder and the password that
 * made the lock beside the copy are all it needs, on this browser after it
 * forgot HemoIO or on another computer that sees the same synced folder.
 *
 * Nothing is stored until the copy has opened with the password: a wrong
 * password, or a copy that cannot be opened, leaves the browser as it was.
 */

import { useCallback, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@contexts';
import { createEncryptedDb } from '@data/db';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';
import { STORAGE_PROVIDER_KEY } from '@data/storage/storageChoice';
import { restoreBackup } from '@services/import';
import { markFolderCopySeen, unlockFolderCopy, type FolderUnlockProblem } from '@services/sync';

export interface UseFolderRecoveryResult {
  /** The chosen folder's name; null until one is chosen */
  folderName: string | null;
  /** Shows the folder picker; a cancelled picker changes nothing. Throws when the folder cannot be opened. */
  chooseFolder: () => Promise<void>;
  /**
   * null: recovered and unlocked; 'existing-locked': another tab set up
   * meanwhile, so the unlock screen shows. Throws only when the lock could not be saved.
   */
  recover: (password: string) => Promise<FolderUnlockProblem | 'existing-locked' | null>;
}

export function useFolderRecovery(): UseFolderRecoveryResult {
  const { recoverFromFolder } = useAuth();
  // The one provider that chose the folder: it persists the handle, as
  // Settings does, so folder sync uses this folder once HemoIO opens
  const [folder] = useState(() => new FileSystemStorageProvider());
  const [folderName, setFolderName] = useState<string | null>(null);

  const chooseFolder = useCallback(async (): Promise<void> => {
    const handle = await folder.selectDirectory();
    if (handle) setFolderName(handle.name);
  }, [folder]);

  const recover = useCallback(
    async (password: string): Promise<FolderUnlockProblem | 'existing-locked' | null> => {
      let bytes: ArrayBuffer | null;
      try {
        bytes = await folder.loadCurrent();
      } catch {
        // Not logged: the error could name the folder's path
        return 'read-failed';
      }
      const opened = await unlockFolderCopy(bytes, password);
      if (!opened.ok) return opened.problem;

      const { lock, key, copy, revision } = opened;
      let restored = true;
      const outcome = await recoverFromFolder(lock, key, async (sessionKey) => {
        try {
          localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
          const db = createEncryptedDb(sessionKey);
          // Data still in this browser is left for the first sync, which asks
          // when it differs from the copy: neither side is replaced unasked
          if (!(await db.hasLabData())) {
            await restoreBackup(db, copy);
            await markFolderCopySeen(db, sessionKey, revision);
          }
        } catch {
          restored = false;
          // Fixed text: the error could name the records being restored
          console.error('Could not restore the folder copy');
        }
      });
      if (outcome === 'existing-locked') return 'existing-locked';
      if (!restored) {
        notifications.show({
          id: 'folder-recovery-incomplete',
          title: 'Folder copy not restored',
          message:
            'HemoIO is unlocked with your password, but your folder copy could not be loaded into ' +
            "this browser. If HemoIO doesn't offer it again, choose your folder in Settings > Data.",
          color: 'yellow',
          autoClose: false,
        });
      }
      return null;
    },
    [folder, recoverFromFolder]
  );

  return { folderName, chooseFolder, recover };
}
