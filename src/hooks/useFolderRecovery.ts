/**
 * Setting HemoIO up from a folder copy: the folder and the password that
 * made the lock saved in the copy are all it needs, on this browser after it
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
  // The one provider that chose the folder. It keeps the handle to itself
  // until the copy has opened, then stores it where Settings does, so folder
  // sync uses this folder once HemoIO opens; a failed attempt changes nothing.
  const [folder] = useState(() => new FileSystemStorageProvider());
  const [folderName, setFolderName] = useState<string | null>(null);

  const chooseFolder = useCallback(async (): Promise<void> => {
    const handle = await folder.selectDirectory({ persist: false });
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
      let folderKept = true;
      // Kept as soon as the lock is saved, before the sweep and the restore:
      // a reload then still finds folder storage on, and the first sync
      // offers the copy. Not before: another tab may have set up meanwhile.
      const keepFolder = async (): Promise<void> => {
        try {
          localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
          await folder.persistDirectory();
        } catch {
          folderKept = false;
          // Fixed text: the error could name the folder's path
          console.error('Could not keep the folder choice');
        }
      };
      // Sees only rows this key opens: the sweep has run
      const restoreCopy = async (sessionKey: CryptoKey): Promise<void> => {
        try {
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
      };
      const outcome = await recoverFromFolder(lock, key, restoreCopy, keepFolder);
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
      } else if (!folderKept) {
        notifications.show({
          id: 'folder-recovery-folder-not-kept',
          title: 'Folder not remembered',
          message:
            'HemoIO is unlocked and your folder copy is loaded, but HemoIO could not remember ' +
            'your folder. Choose it again in Settings > Data so your data keeps syncing to it.',
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
