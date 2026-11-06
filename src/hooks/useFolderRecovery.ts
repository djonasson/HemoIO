/**
 * Setting HemoIO up from a folder copy: the folder and the password that
 * made the lock saved in the copy are all it needs, on this browser after it
 * forgot HemoIO or on another computer that sees the same synced folder.
 *
 * Nothing is stored until a copy has opened with the password: a wrong
 * password, or a folder where nothing opens, leaves the browser as it was.
 * When the current copy is missing or damaged, the previous copy or a dated
 * backup that opens is restored instead, and the damaged copy is kept as a
 * dated backup, then replaced with what was restored, so syncing goes on
 * (services/sync/folderRecovery.ts). This hook keeps the chosen folder and
 * tells the user how it went.
 */

import { useCallback, useState } from 'react';
import { useAuth } from '@contexts';
import { showPersistentNotice } from '@components/common/showPersistentNotice';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';
import { STORAGE_PROVIDER_KEY } from '@data/storage/storageChoice';
import { recoverFromFolderCopy, type EarlierCopyRestored } from '@services/sync/folderRecovery';
import { formatDateTime } from '@/utils/formatDateTime';
import type { FolderUnlockProblem } from '@services/sync';

/** Which earlier file was restored, and when it was saved, in words */
function earlierCopyMessage({ from, savedAt, replaced }: EarlierCopyRestored): string {
  const which = from.file === 'previous' ? 'the previous copy' : 'the backup';
  const when = Number.isNaN(savedAt.getTime()) ? '' : ` saved on ${formatDateTime(savedAt)}`;
  return (
    `Your folder copy couldn't be opened, so HemoIO restored ${which}${when}.` +
    (replaced ? ' It is now your folder copy.' : '')
  );
}

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
      const outcome = await recoverFromFolderCopy({
        folder,
        password,
        saveLock: recoverFromFolder,
        // So folder sync uses this folder once HemoIO opens
        keepFolder: async () => {
          localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
          await folder.persistDirectory();
        },
      });
      if (outcome.status === 'refused') return outcome.problem;
      if (outcome.status === 'existing-locked') return 'existing-locked';

      const { restored, folderKept, earlier } = outcome;
      if (earlier) {
        showPersistentNotice({
          id: 'folder-recovery-earlier-copy',
          title: 'Restored from an earlier copy',
          message: earlierCopyMessage(earlier),
          color: 'yellow',
        });
      }
      if (!restored) {
        showPersistentNotice({
          id: 'folder-recovery-incomplete',
          title: 'Folder copy not restored',
          message:
            'HemoIO is unlocked with your password, but your folder copy could not be loaded into ' +
            "this browser. If HemoIO doesn't offer it again, choose your folder in Settings > Data.",
          color: 'yellow',
        });
      } else if (!folderKept) {
        showPersistentNotice({
          id: 'folder-recovery-folder-not-kept',
          title: 'Folder not remembered',
          message:
            'HemoIO is unlocked and your folder copy is loaded, but HemoIO could not remember ' +
            'your folder. Choose it again in Settings > Data so your data keeps syncing to it.',
          color: 'yellow',
        });
      }
      return null;
    },
    [folder, recoverFromFolder]
  );

  return { folderName, chooseFolder, recover };
}
