/**
 * Setting HemoIO up from a folder copy: the folder and the password that
 * made the lock saved in the copy are all it needs, on this browser after it
 * forgot HemoIO or on another computer that sees the same synced folder.
 *
 * Nothing is stored until a copy has opened with the password: a wrong
 * password, or a folder where nothing opens, leaves the browser as it was.
 * When the current copy is missing or damaged, the previous copy or a dated
 * backup that opens is restored instead (unlockFolderCopy), and the damaged
 * copy is replaced with what was restored, so syncing goes on.
 */

import { useCallback, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@contexts';
import { createEncryptedDb } from '@data/db';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';
import { STORAGE_PROVIDER_KEY } from '@data/storage/storageChoice';
import { restoreBackup } from '@services/import';
import {
  markFolderCopySeen,
  sealFolderCopy,
  unlockFolderCopy,
  type FolderCopyOrigin,
  type FolderUnlockProblem,
} from '@services/sync';
import { keepLockFile } from '@services/sync/folderLockFile';
import { FOLDER_SYNC_LOCK, withWebLock } from '@/utils/withWebLock';
import { formatDateTime } from '@/utils/formatDateTime';
import type { EncryptedDb } from '@data/db';
import type { StoredCredentialsV2 } from '@data/encryption/keyWrapping';

/** Which earlier file was restored, and when it was saved, in words */
function earlierCopyMessage(
  from: Exclude<FolderCopyOrigin, { file: 'current' }>,
  savedAt: Date,
  replaced: boolean
): string {
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
      // Never logs: a failure to read the folder could name its path
      const opened = await unlockFolderCopy(folder, password);
      if (!opened.ok) return opened.problem;

      const { lock, key, copy, revision, from } = opened;
      let restored = true;
      // Restored from the previous copy or a backup; and whether it replaced the copy
      let restoredEarlier = false;
      let replacedCopy = false;
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
            // Under the folder-sync lock (nested in setup's, the one order
            // allowed): the lock file and a replaced copy are folder writes
            await withWebLock(FOLDER_SYNC_LOCK, async () => {
              let seen = revision;
              if (from.file !== 'current') {
                restoredEarlier = true;
                seen = await replaceDamagedCopy(db, sessionKey, lock, revision);
                replacedCopy = seen !== revision;
              } else {
                await keepLockFile(folder, lock).catch(() => {
                  // The first sync writes it; fixed text, the error could name the folder
                  console.error('Could not write the lock file');
                });
              }
              await markFolderCopySeen(db, sessionKey, seen);
            });
          }
        } catch {
          restored = false;
          // Fixed text: the error could name the records being restored
          console.error('Could not restore the folder copy');
        }
      };
      /**
       * The current copy is missing or damaged, and no key opens it: write
       * the data just restored as the copy, carrying the lock, built on the
       * one restored, so syncing goes on. The previous copy and the backups
       * stay. The revision this browser has now seen: the new copy's, or the
       * one restored when the write failed (the first sync tells why).
       */
      const replaceDamagedCopy = async (
        db: EncryptedDb,
        sessionKey: CryptoKey,
        copyLock: StoredCredentialsV2,
        restoredRevision: string | null
      ): Promise<string | null> => {
        try {
          const ancestors = restoredRevision === null ? [] : [restoredRevision];
          const sealed = await sealFolderCopy(await db.exportAllData(), sessionKey, copyLock, ancestors);
          await keepLockFile(folder, copyLock);
          await folder.save(sealed.bytes);
          return sealed.revision;
        } catch {
          // Fixed text: the error could name the folder or the records
          console.error('Could not replace the damaged folder copy');
          return restoredRevision;
        }
      };
      const outcome = await recoverFromFolder(lock, key, restoreCopy, keepFolder);
      if (outcome === 'existing-locked') return 'existing-locked';
      if (restored && restoredEarlier && from.file !== 'current') {
        notifications.show({
          id: 'folder-recovery-earlier-copy',
          title: 'Restored from an earlier copy',
          message: earlierCopyMessage(from, copy.exportedAt, replacedCopy),
          color: 'yellow',
          autoClose: false,
        });
      }
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
