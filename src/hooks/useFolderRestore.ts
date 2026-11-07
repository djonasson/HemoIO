/**
 * Hook deciding whether folder sync may write, and offering the folder copy
 *
 * A browser that has lost its data would sync its empty state over the copy
 * in the folder, the one place the data is left. So with folder storage on,
 * sync is held until the folder has been looked at: if this browser has no
 * lab data and the folder copy has some, or cannot be read, the user decides
 * first. Folder access granted again or another folder chosen starts over.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@contexts';
import { notifyFolderSyncPaused } from '@components/storage/notifyFolderSyncPaused';
import { currentFolder } from '@data/storage/StorageProviderFactory';
import { onFolderAccessChanged } from '@data/storage/folderAccessEvents';
import { isFolderStorageOn } from '@data/storage/storageChoice';
import {
  assessFolderCopy,
  type FolderCopyAssessment,
  type FolderCopyProblem,
  type UnreadableFolderCopy,
} from '@services/sync';
import { useEncryptedDb } from './useEncryptedDb';
import { logFailure } from '@/utils/logFailure';
import type { FolderToken } from '@data/storage/FileSystemStorageProvider';
import type { ParsedBackupData } from '@services/import';
import type { FolderReplaceChoice } from './useFilesystemSync';

/**
 * "Replace folder copy…" as the question offers it: what a replace is for
 * (the copy offered, or the very file that cannot be read, in the folder it
 * was found in), and whether the copy may be someone else's, so the
 * confirmation warns
 */
export interface PromptReplace {
  choice: FolderReplaceChoice;
  warn: boolean;
}

export type FolderRestorePrompt =
  | {
      kind: 'offer';
      data: ParsedBackupData;
      /** The copy's revision: a restore records it as seen, so the next sync finds no conflict */
      revision: string | null;
      folderName: string | null;
      /** The browser gained data since unlock, which a restore replaces */
      replacesBrowserData: boolean;
      /**
       * The stored data as the question found it (EncryptedDb.storedDataStamp):
       * a restore replaces only that, never a change saved since
       */
      stamp: string;
      /** The current copy cannot be read, and the previous copy is offered instead */
      damagedCurrent: boolean;
      /** The copy offered, or a damaged current copy; null when it may not be replaced */
      replace: PromptReplace | null;
    }
  | {
      kind: 'unreadable';
      folderName: string | null;
      reason: FolderCopyProblem;
      /** Null when it may not be replaced (the sync's own decision), or the file could not be read at all */
      replace: PromptReplace | null;
    };

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
  /** Look at the folder and this browser again, as when folder access changes */
  recheck: () => void;
}

/** Checking, sync allowed, held after "Not now", or asking the user */
type Status = 'checking' | 'sync' | 'held' | FolderRestorePrompt;

export function useFolderRestore(): UseFolderRestoreResult {
  const { db, isReady } = useEncryptedDb();
  const { encryptionKey, storedLock } = useAuth();
  // Read when a check starts: a password change needs no new check
  const lockRef = useRef(storedLock);
  useLayoutEffect(() => {
    lockRef.current = storedLock;
  }, [storedLock]);
  const [status, setStatus] = useState<Status>('checking');
  // Bumped when folder access changes, to check the folder again
  const [generation, setGeneration] = useState(0);
  // Whether this session's database was empty when first checked
  const emptyAtUnlock = useRef<{ db: unknown; empty: boolean }>({ db: null, empty: false });

  const recheck = useCallback(() => {
    setStatus('checking');
    setGeneration((g) => g + 1);
  }, []);

  useEffect(() => onFolderAccessChanged(recheck), [recheck]);

  useEffect(() => {
    if (!isFolderStorageOn() || !db || !isReady || !encryptionKey) return;
    let cancelled = false;

    async function check(database: NonNullable<typeof db>, key: CryptoKey): Promise<void> {
      let browserHasData: boolean;
      let stamp: string;
      try {
        // Stamped first: a change saved after it is never replaced by the offer
        stamp = await database.storedDataStamp();
        browserHasData = await database.hasLabData();
      } catch {
        // Not logged with the error, which could name stored data. Sync stays held.
        logFailure('Could not check this browser for lab data before syncing to the folder');
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

      const folder = currentFolder();
      let assessment: FolderCopyAssessment;
      let folderName: string | null = null;
      let folderToken: FolderToken | null = null;
      try {
        // Without access nothing can be written either: wait to be told it was granted
        if ((await folder.getPermissionState()) !== 'granted') return;
        assessment = await assessFolderCopy(folder, key, lockRef.current);
        if (assessment.kind !== 'sync') {
          // The folder the provider read the file from
          const identity = await folder.folderIdentity();
          folderName = identity?.name ?? null;
          folderToken = identity?.token ?? null;
        }
      } catch {
        assessment = { kind: 'unreadable', reason: 'read-failed', fileId: null, replace: false };
      }
      const replaceOf = ({ fileId, replace }: UnreadableFolderCopy): PromptReplace | null =>
        replace === false || fileId === null
          ? null
          : { choice: { kind: 'unreadable', fileId, folder: folderToken }, warn: replace === 'warn' };

      if (cancelled) return;
      if (assessment.kind === 'sync') {
        // Nothing at risk: from now on the browser's own data is what counts
        emptyAtUnlock.current = { ...emptyAtUnlock.current, empty: false };
      }
      setStatus(
        assessment.kind === 'sync'
          ? 'sync'
          : assessment.kind === 'offer'
            ? {
                kind: 'offer',
                data: assessment.data,
                revision: assessment.revision,
                folderName,
                replacesBrowserData: browserHasData,
                stamp,
                damagedCurrent: assessment.damagedCurrent !== undefined,
                replace: assessment.damagedCurrent
                  ? replaceOf(assessment.damagedCurrent)
                  : { choice: { kind: 'copy', revision: assessment.revision }, warn: false },
              }
            : { kind: 'unreadable', folderName, reason: assessment.reason, replace: replaceOf(assessment) }
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
    } else {
      notifyFolderSyncPaused();
    }
    setStatus(decision === 'sync' ? 'sync' : 'held');
  }, []);

  return {
    syncAllowed: !isFolderStorageOn() || status === 'sync',
    prompt: typeof status === 'object' ? status : null,
    syncHeld: isFolderStorageOn() && (status === 'checking' || status === 'held'),
    decide,
    recheck,
  };
}
