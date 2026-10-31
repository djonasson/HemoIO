/**
 * Hook deciding whether folder sync may write, and offering the folder copy
 *
 * A browser that has lost its data would sync its empty state over the copy
 * in the folder, the one place the data is left. So with folder storage on,
 * sync is held until the folder has been looked at: if this browser has no
 * lab data and the folder copy has some, or cannot be read, the user decides
 * first. Folder access granted again or another folder chosen starts over.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@contexts';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';
import { onFolderAccessChanged } from '@data/storage/folderAccessEvents';
import { isFolderStorageOn } from '@data/storage/storageChoice';
import { assessFolderCopy, type FolderCopyAssessment, type FolderCopyProblem } from '@services/sync';
import { useEncryptedDb } from './useEncryptedDb';
import type { ParsedBackupData } from '@services/import';

export type FolderRestorePrompt =
  | {
      kind: 'offer';
      data: ParsedBackupData;
      folderName: string | null;
      /** The browser gained data since unlock, which a restore replaces */
      replacesBrowserData: boolean;
    }
  | { kind: 'unreadable'; reason: FolderCopyProblem; folderName: string | null };

/**
 * The user's answer: 'sync' when the copy was restored or may be replaced,
 * 'hold' to decide later (nothing is written this session)
 */
export type FolderRestoreDecision = 'sync' | 'hold';

export interface UseFolderRestoreResult {
  /** Whether folder sync may write */
  syncAllowed: boolean;
  /** What to ask the user, while sync waits for an answer */
  prompt: FolderRestorePrompt | null;
  /** Folder storage is on but nothing reaches the folder: no access yet, or "Not now" */
  syncHeld: boolean;
  decide: (decision: FolderRestoreDecision) => void;
}

/** Checking, sync allowed, held after "Not now", or asking the user */
type Status = 'checking' | 'sync' | 'held' | FolderRestorePrompt;

export function useFolderRestore(): UseFolderRestoreResult {
  const { db, isReady } = useEncryptedDb();
  const { encryptionKey } = useAuth();
  const [status, setStatus] = useState<Status>('checking');
  // Bumped when folder access changes, to check the folder again
  const [generation, setGeneration] = useState(0);
  // Whether this session's database was empty when first checked
  const emptyAtUnlock = useRef<{ db: unknown; empty: boolean }>({ db: null, empty: false });

  useEffect(
    () =>
      onFolderAccessChanged(() => {
        setStatus('checking');
        setGeneration((g) => g + 1);
      }),
    []
  );

  useEffect(() => {
    if (!isFolderStorageOn() || !db || !isReady || !encryptionKey) return;
    let cancelled = false;

    async function check(database: NonNullable<typeof db>, key: CryptoKey): Promise<void> {
      let browserHasData: boolean;
      try {
        browserHasData = await database.hasLabData();
      } catch {
        // Not logged with the error, which could name stored data. Sync stays held.
        console.error('Could not check this browser for lab data before syncing to the folder');
        return;
      }
      // Data added while folder access waited (an import, say) is not what the
      // folder copy was meant to back up: the browser counts as empty until
      // the user has decided
      if (emptyAtUnlock.current.db !== database) {
        emptyAtUnlock.current = { db: database, empty: !browserHasData };
      }
      if (!emptyAtUnlock.current.empty && browserHasData) {
        if (!cancelled) setStatus('sync');
        return;
      }

      const folder = new FileSystemStorageProvider();
      let assessment: FolderCopyAssessment;
      let folderName: string | null = null;
      try {
        // Without access nothing can be written either: wait to be told it was granted
        if ((await folder.getPermissionState()) !== 'granted') return;
        assessment = await assessFolderCopy(folder, key);
        if (assessment.kind !== 'sync') folderName = await folder.getDirectoryName();
      } catch {
        assessment = { kind: 'unreadable', reason: 'read-failed' };
      }

      if (cancelled) return;
      if (assessment.kind === 'sync') {
        // Nothing at risk: from now on the browser's own data is what counts
        emptyAtUnlock.current = { ...emptyAtUnlock.current, empty: false };
      }
      setStatus(
        assessment.kind === 'sync'
          ? 'sync'
          : assessment.kind === 'offer'
            ? { kind: 'offer', data: assessment.data, folderName, replacesBrowserData: browserHasData }
            : { kind: 'unreadable', reason: assessment.reason, folderName }
      );
    }

    void check(db, encryptionKey);
    return () => {
      cancelled = true;
    };
  }, [db, isReady, encryptionKey, generation]);

  const decide = useCallback((decision: FolderRestoreDecision) => {
    if (decision === 'sync') {
      // Decided: from now on the browser's own data is what counts
      emptyAtUnlock.current = { ...emptyAtUnlock.current, empty: false };
    }
    setStatus(decision === 'sync' ? 'sync' : 'held');
  }, []);

  return {
    syncAllowed: !isFolderStorageOn() || status === 'sync',
    prompt: typeof status === 'object' ? status : null,
    syncHeld: isFolderStorageOn() && (status === 'checking' || status === 'held'),
    decide,
  };
}
