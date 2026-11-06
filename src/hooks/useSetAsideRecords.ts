/**
 * The records HemoIO cannot open with the session key, kept aside: how many
 * there are, and the user's two ways to settle them
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@contexts/useAuth';
import { onSetAsideChanged } from '@data/db/setAsideEvents';
import { buildSetAsideFile, downloadJson, setAsideFileName } from '@services/export';
import { useEncryptedDb } from './useEncryptedDb';
import type { EncryptedDb } from '@data/db';
import type { SetAsideSummary } from '@/types';

export interface UseSetAsideRecordsResult {
  /** { total: 0, unsaved: 0 } while locked */
  summary: SetAsideSummary;
  /** Download every set-aside row as a sealed file, then mark them saved */
  download: () => Promise<void>;
  /** Delete every set-aside row: only at the user's confirmed request */
  remove: () => Promise<void>;
}

const NOTHING_SET_ASIDE: SetAsideSummary = { total: 0, unsaved: 0 };

export const PREFERENCES_SET_ASIDE_NOTICE_ID = 'preferences-set-aside';

/**
 * The sessions already told their preferences were kept aside, by session
 * key: every hook in the session shares it, and a new unlock tells again
 */
const toldPreferencesSetAside = new WeakSet<CryptoKey>();

/**
 * @returns The set-aside summary, counted again whenever the set-aside rows change
 */
export function useSetAsideRecords(): UseSetAsideRecordsResult {
  const { encryptionKey } = useAuth();
  const { db, isReady } = useEncryptedDb();
  // The count of one database: a count from an earlier session is never shown
  const [counted, setCounted] = useState<{ db: EncryptedDb; summary: SetAsideSummary } | null>(null);
  // Counts can finish out of order; only the latest asked for is kept
  const latestCount = useRef(0);

  useEffect(() => {
    if (!db || !isReady) return;
    let active = true;
    const count = (): void => {
      const asked = ++latestCount.current;
      db.countSetAside().then(
        (summary) => {
          if (active && asked === latestCount.current) setCounted({ db, summary });
        },
        // Fixed text: the error could name stored data
        () => console.error('Could not count the records kept aside')
      );
    };

    count();
    const stop = onSetAsideChanged(({ movedAside }) => {
      count();
      if (
        movedAside.includes('userPreferences') &&
        encryptionKey &&
        !toldPreferencesSetAside.has(encryptionKey)
      ) {
        toldPreferencesSetAside.add(encryptionKey);
        notifications.show({
          id: PREFERENCES_SET_ASIDE_NOTICE_ID,
          title: 'Earlier preferences kept aside',
          message:
            "Your saved preferences couldn't be opened, so HemoIO kept them aside and saved your change.",
          color: 'yellow',
        });
      }
    });
    return () => {
      active = false;
      stop();
    };
  }, [db, isReady, encryptionKey]);

  const download = useCallback(async (): Promise<void> => {
    if (!db) return;
    const rows = await db.exportSetAside();
    if (rows.length === 0) return;
    const savedAt = new Date();
    downloadJson(buildSetAsideFile(rows, savedAt), setAsideFileName(savedAt));
    await db.markSetAsideSaved(rows.map((row) => row.id!));
  }, [db]);

  const remove = useCallback(async (): Promise<void> => {
    if (!db) return;
    await db.deleteSetAside();
  }, [db]);

  const summary = isReady && counted && counted.db === db ? counted.summary : NOTHING_SET_ASIDE;
  return { summary, download, remove };
}
