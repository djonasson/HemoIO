/**
 * Hook listing the dated backups in the folder, and reading them back
 *
 * A backup is sealed with the session key and carries no lock, so it opens
 * with the key this session already holds. Nothing here logs: the content is
 * health data.
 *
 * Keeping the current copy and the restore run outside the folder-sync lock:
 * a sync meanwhile writes the copy atomically, and the restored data, which
 * carries no stamp, then goes to the folder through a normal sync.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@contexts';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';
import { onFolderAccessChanged, onFolderBackupsChanged } from '@data/storage/folderAccessEvents';
import {
  backupDate,
  backupKind,
  canKeepFolderCopy,
  keepCurrentFolderCopy,
  protectFolderBackup,
  readFolderCopy,
  type FolderBackupKind,
  type FolderCopyReading,
} from '@services/sync';

export interface FolderBackupEntry {
  name: string;
  savedAt: Date;
  kind: FolderBackupKind;
}

/** A backup read: as a folder copy is, or a file that could not be loaded at all */
export type FolderBackupReading = FolderCopyReading | { status: 'unreadable'; reason: 'read-failed' };

export interface UseFolderBackupsResult {
  /** Newest first; refreshed when backups change and when folder access changes */
  backups: FolderBackupEntry[];
  /** Never rejects: a backup that cannot be read says why */
  read: (name: string) => Promise<FolderBackupReading>;
  /**
   * Whether the folder holds a copy that can be kept as a backup; false when
   * there is none or the session key can't open it. Rejects when the folder
   * cannot be read.
   */
  canKeepCurrentCopy: () => Promise<boolean>;
  /**
   * Keeps the current folder copy as a dated backup, without deleting the
   * `protect`ed backups; rejects when it cannot
   */
  keepCurrentCopy: (protect?: string[]) => Promise<void>;
  /**
   * Keep a backup from being pruned while it is shown for restoring, by any
   * backup kept meanwhile (a sync's included). Returns the release.
   */
  protectShown: (name: string) => () => void;
}

/**
 * A provider for the folder chosen now. Made for each call, as the sync's
 * is: a provider keeps the folder it first read, and "Change folder" in
 * Settings leaves this list mounted.
 */
function chosenFolder(): FileSystemStorageProvider {
  return new FileSystemStorageProvider();
}

export function useFolderBackups(): UseFolderBackupsResult {
  const { encryptionKey } = useAuth();
  const [backups, setBackups] = useState<FolderBackupEntry[]>([]);

  const refresh = useCallback(async (): Promise<FolderBackupEntry[]> => {
    let names: string[];
    try {
      names = await chosenFolder().listBackups();
    } catch {
      // No folder or no access yet: nothing to list
      return [];
    }
    const entries: FolderBackupEntry[] = [];
    for (const name of names) {
      const savedAt = backupDate(name);
      const kind = backupKind(name);
      if (savedAt && kind) entries.push({ name, savedAt, kind });
    }
    return entries.sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Answers can arrive out of order: only the latest request is shown
    let latest = 0;
    const load = (): void => {
      const request = ++latest;
      void refresh().then((entries) => {
        if (!cancelled && request === latest) setBackups(entries);
      });
    };
    load();
    const stopBackups = onFolderBackupsChanged(load);
    const stopAccess = onFolderAccessChanged(load);
    return () => {
      cancelled = true;
      stopBackups();
      stopAccess();
    };
  }, [refresh]);

  const read = useCallback(
    async (name: string): Promise<FolderBackupReading> => {
      if (!encryptionKey) return { status: 'unreadable', reason: 'read-failed' };
      let bytes: ArrayBuffer;
      try {
        bytes = await chosenFolder().loadBackup(name);
      } catch {
        return { status: 'unreadable', reason: 'read-failed' };
      }
      return readFolderCopy(bytes, encryptionKey);
    },
    [encryptionKey]
  );

  const canKeepCurrentCopy = useCallback(async (): Promise<boolean> => {
    if (!encryptionKey) return false;
    return canKeepFolderCopy({ key: encryptionKey, folder: chosenFolder() });
  }, [encryptionKey]);

  const keepCurrentCopy = useCallback(
    async (protect?: string[]): Promise<void> => {
      if (!encryptionKey) throw new Error('No key');
      const folder = chosenFolder();
      await keepCurrentFolderCopy({ key: encryptionKey, backups: folder, folder, protect });
    },
    [encryptionKey]
  );

  return { backups, read, canKeepCurrentCopy, keepCurrentCopy, protectShown: protectFolderBackup };
}
