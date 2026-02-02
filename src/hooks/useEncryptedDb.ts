/**
 * Hook to get EncryptedDb instance
 *
 * Provides access to the encrypted database operations using the current
 * authentication session's encryption key.
 */

import { useMemo } from 'react';
import { useAuth } from '@contexts';
import { createEncryptedDb, EncryptedDb } from '@data/db';

/**
 * Result of useEncryptedDb hook
 */
export interface UseEncryptedDbResult {
  /** The encrypted database instance, null if not authenticated */
  db: EncryptedDb | null;
  /** Whether the user is authenticated and db is available */
  isReady: boolean;
}

/**
 * Hook to access the encrypted database
 *
 * Returns an EncryptedDb instance that uses the current session's encryption key.
 * The instance is memoized to avoid recreating it on every render.
 *
 * @returns UseEncryptedDbResult with db instance and ready state
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { db, isReady } = useEncryptedDb();
 *
 *   if (!isReady) {
 *     return <Text>Please log in to view data</Text>;
 *   }
 *
 *   // Use db to fetch/save data
 *   const results = await db.getAllLabResults();
 * }
 * ```
 */
export function useEncryptedDb(): UseEncryptedDbResult {
  const { encryptionKey, status } = useAuth();

  const db = useMemo(() => {
    if (!encryptionKey) return null;
    return createEncryptedDb(encryptionKey);
  }, [encryptionKey]);

  const isReady = status === 'unlocked' && db !== null;

  return { db, isReady };
}
