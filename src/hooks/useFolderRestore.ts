/**
 * Hook deciding whether folder sync may write, and offering the folder copy
 *
 * A browser that has lost its data would sync its empty state over the copy
 * in the folder, the one place the data is left. So with folder storage on,
 * sync is held until the folder has been looked at: if this browser has no
 * lab data and the folder copy has some, or cannot be read, the user decides
 * first. Folder access granted again or another folder chosen starts over.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@contexts';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';
import { onFolderAccessChanged } from '@data/storage/folderAccessEvents';
import { isFileSystemAccessSupported } from '@/utils/fileSystemSupport';
import { assessFolderCopy, type FolderCopyProblem } from '@services/sync';
import { useEncryptedDb } from './useEncryptedDb';
import type { ParsedBackupData } from '@services/import';

const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';

export type FolderRestorePrompt =
  | { kind: 'offer'; data: ParsedBackupData; folderName: string | null }
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
  decide: (decision: FolderRestoreDecision) => void;
}

type Phase = 'checking' | 'asking' | 'sync' | 'held';

function isFolderStorageOn(): boolean {
  return isFileSystemAccessSupported() && localStorage.getItem(STORAGE_PROVIDER_KEY) === 'filesystem';
}

export function useFolderRestore(): UseFolderRestoreResult {
  const { db, isReady } = useEncryptedDb();
  const { encryptionKey } = useAuth();
  const [phase, setPhase] = useState<Phase>('checking');
  const [prompt, setPrompt] = useState<FolderRestorePrompt | null>(null);
  // Bumped when folder access changes, to check the folder again
  const [generation, setGeneration] = useState(0);

  useEffect(
    () =>
      onFolderAccessChanged(() => {
        setPhase('checking');
        setPrompt(null);
        setGeneration((g) => g + 1);
      }),
    []
  );

  useEffect(() => {
    if (!isFolderStorageOn() || !db || !isReady || !encryptionKey) return;
    let cancelled = false;

    async function check(database: NonNullable<typeof db>, key: CryptoKey): Promise<void> {
      const folder = new FileSystemStorageProvider();
      // Without access nothing can be written either: wait to be told it was granted
      if ((await folder.getPermissionState()) !== 'granted') return;

      let browserHasData: boolean;
      try {
        browserHasData = await database.hasLabData();
      } catch {
        // Not logged with the error, which could name stored data. Sync stays held.
        console.error('Could not check this browser for lab data before syncing to the folder');
        return;
      }

      const assessment = await assessFolderCopy({ browserHasData, folder, key });
      if (cancelled) return;
      if (assessment.kind === 'sync') {
        setPhase('sync');
        return;
      }
      const folderName = await folder.getDirectoryName();
      if (cancelled) return;
      setPrompt(
        assessment.kind === 'offer'
          ? { kind: 'offer', data: assessment.data, folderName }
          : { kind: 'unreadable', reason: assessment.reason, folderName }
      );
      setPhase('asking');
    }

    void check(db, encryptionKey);
    return () => {
      cancelled = true;
    };
  }, [db, isReady, encryptionKey, generation]);

  const decide = useCallback((decision: FolderRestoreDecision) => {
    setPrompt(null);
    setPhase(decision === 'sync' ? 'sync' : 'held');
  }, []);

  return {
    syncAllowed: !isFolderStorageOn() || phase === 'sync',
    prompt: phase === 'asking' ? prompt : null,
    decide,
  };
}
