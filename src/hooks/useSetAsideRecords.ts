/**
 * The records HemoIO cannot open with the session key, kept aside: how many
 * there are, and the user's two ways to settle them
 */

import { useCallback, useSyncExternalStore } from 'react';
import { showPersistentNotice } from '@components/common/showPersistentNotice';
import { useAuth } from '@contexts/useAuth';
import { onSetAsideChanged } from '@data/db/setAsideEvents';
import { buildSetAsideFile, saveSealedFile, setAsideFileName } from '@services/export';
import { useEncryptedDb } from './useEncryptedDb';
import type { EncryptedDb } from '@data/db';
import type { SetAsideSummary } from '@/types';

/**
 * How a sealed download went. Only a file the save picker wrote is known to
 * be saved; after a plain download the user is asked, and confirmSaved marks
 * the rows of that file.
 */
export type SealedDownload =
  | { outcome: 'saved' }
  /** The picker wrote the file, but marking its rows saved failed */
  | { outcome: 'unrecorded' }
  | { outcome: 'cancelled' }
  | { outcome: 'unconfirmed'; ids: number[] }
  | { outcome: 'nothing' };

export interface UseSetAsideRecordsResult {
  /** { total: 0, unsaved: 0 } while locked */
  summary: SetAsideSummary;
  /** Save every set-aside row as a sealed file */
  download: () => Promise<SealedDownload>;
  /** The user says the downloaded file saved: mark the rows it holds */
  confirmSaved: (ids: number[]) => Promise<void>;
  /** The IDs set aside now: what a delete confirmation counts and deletes */
  snapshot: () => Promise<number[]>;
  /** Delete those rows: only at the user's confirmed request */
  remove: (ids: number[]) => Promise<void>;
}

const NOTHING_SET_ASIDE: SetAsideSummary = { total: 0, unsaved: 0 };

const PREFERENCES_SET_ASIDE_NOTICE_ID = 'preferences-set-aside';

/**
 * The sessions already told their preferences were kept aside, by session
 * key: a new unlock tells again
 */
const toldPreferencesSetAside = new WeakSet<CryptoKey>();

/**
 * One count for every hook of the session: a change is counted once, however
 * many parts of the app show it
 */
interface SharedCount {
  key: CryptoKey;
  summary: SetAsideSummary;
  listeners: Set<() => void>;
  stop: () => void;
}

let shared: SharedCount | null = null;

function startCount(key: CryptoKey, db: EncryptedDb): SharedCount {
  const count: SharedCount = { key, summary: NOTHING_SET_ASIDE, listeners: new Set(), stop: () => {} };
  let stopped = false;
  // Counts can finish out of order; only the latest asked for is kept
  let latest = 0;
  const recount = (): void => {
    const asked = ++latest;
    db.countSetAside().then(
      (summary) => {
        if (stopped || asked !== latest) return;
        count.summary = summary;
        count.listeners.forEach((listener) => listener());
      },
      // Fixed text: the error could name stored data
      () => console.error('Could not count the records kept aside')
    );
  };
  const stopListening = onSetAsideChanged(({ movedAside }) => {
    recount();
    if (movedAside.includes('userPreferences') && !toldPreferencesSetAside.has(key)) {
      toldPreferencesSetAside.add(key);
      // Told once a session: it stays until dismissed
      showPersistentNotice({
        id: PREFERENCES_SET_ASIDE_NOTICE_ID,
        title: 'Earlier preferences kept aside',
        message:
          "Your saved preferences couldn't be opened, so HemoIO kept them aside and saved your change.",
        color: 'yellow',
      });
    }
  });
  count.stop = () => {
    stopped = true;
    stopListening();
  };
  recount();
  return count;
}

function subscribeCount(key: CryptoKey, db: EncryptedDb, listener: () => void): () => void {
  if (!shared || shared.key !== key) {
    shared?.stop();
    shared = startCount(key, db);
  }
  const count = shared;
  count.listeners.add(listener);
  return () => {
    count.listeners.delete(listener);
    if (count.listeners.size > 0) return;
    count.stop();
    if (shared === count) shared = null;
  };
}

/**
 * @returns The set-aside summary, counted again whenever the set-aside rows change
 */
export function useSetAsideRecords(): UseSetAsideRecordsResult {
  const { encryptionKey } = useAuth();
  const { db, isReady } = useEncryptedDb();
  const active = isReady && db !== null && encryptionKey !== null;

  const subscribe = useCallback(
    (listener: () => void) =>
      isReady && db && encryptionKey ? subscribeCount(encryptionKey, db, listener) : () => undefined,
    [isReady, encryptionKey, db]
  );
  const getSummary = useCallback(
    // A count from an earlier session is never shown
    () => (active && shared?.key === encryptionKey ? shared.summary : NOTHING_SET_ASIDE),
    [active, encryptionKey]
  );
  const summary = useSyncExternalStore(subscribe, getSummary);

  const download = useCallback(async (): Promise<SealedDownload> => {
    if (!db) return { outcome: 'nothing' };
    const savedAt = new Date();
    let ids: number[] = [];
    // The rows are read once the save picker has opened, which needs the click
    const saved = await saveSealedFile(setAsideFileName(savedAt), async () => {
      const rows = await db.exportSetAside();
      ids = rows.map((row) => row.id!);
      return rows.length > 0 ? buildSetAsideFile(rows, savedAt) : null;
    });
    if (saved === 'nothing') return { outcome: 'nothing' };
    if (saved === 'cancelled') return { outcome: 'cancelled' };
    if (saved === 'downloaded') return { outcome: 'unconfirmed', ids };
    try {
      // Only the rows in the file: one set aside meanwhile is not saved
      await db.markSetAsideSaved(ids);
    } catch {
      return { outcome: 'unrecorded' };
    }
    return { outcome: 'saved' };
  }, [db]);

  const confirmSaved = useCallback(
    async (ids: number[]): Promise<void> => {
      if (db) await db.markSetAsideSaved(ids);
    },
    [db]
  );

  const snapshot = useCallback(async (): Promise<number[]> => (db ? db.setAsideIds() : []), [db]);

  const remove = useCallback(
    async (ids: number[]): Promise<void> => {
      if (db) await db.deleteSetAside(ids);
    },
    [db]
  );

  return { summary, download, confirmSaved, snapshot, remove };
}
