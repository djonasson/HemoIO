/**
 * Runs the post-unlock data migration that needs the encryption key
 * (reconciling legacy unknown biomarker keys) once per unlocked session.
 *
 * Views that read lab data should wait for `isReconciling` to be false so
 * they never load half-migrated data.
 */

import { useEffect, useState } from 'react';
import { useEncryptedDb } from './useEncryptedDb';

export interface UseLegacyKeyReconciliationResult {
  isReconciling: boolean;
}

export function useLegacyKeyReconciliation(): UseLegacyKeyReconciliationResult {
  const { db, isReady } = useEncryptedDb();
  const [reconciledDb, setReconciledDb] = useState<typeof db>(null);

  useEffect(() => {
    if (!db || !isReady || reconciledDb === db) return;

    let cancelled = false;
    db.reconcileLegacyUnknownKeys()
      .catch(() => {
        // Not fatal: values keep their legacy key and still display correctly
        console.error('Failed to reconcile legacy biomarker keys');
      })
      .finally(() => {
        if (!cancelled) setReconciledDb(db);
      });

    return () => {
      cancelled = true;
    };
  }, [db, isReady, reconciledDb]);

  return { isReconciling: !db || !isReady || reconciledDb !== db };
}
