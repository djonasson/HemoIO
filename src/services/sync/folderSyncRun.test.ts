/**
 * Tests for one folder sync's steps, on a real (fake-indexeddb) database
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openTestDb } from '@data/db/testDb';
import { createCredentialsV2 } from '@data/encryption/keyWrapping';
import { loadFolderSyncState } from '@data/storage/folderSyncState';
import { restoreBackup, restoreBackupIfUnchanged, type ParsedBackupData } from '@services/import';
import { exportDigest } from './folderSync';
import { loadNewerFolderCopy, runFolderSync, type ChangedElsewhere } from './folderSyncRun';
import type { FolderBackupStore } from './folderBackups';
import type { FolderCopyStore } from './folderSync';

const at = new Date('2024-01-15T10:00:00Z');
const result = (labName: string) => ({ date: at, labName, createdAt: at, updatedAt: at });

/** A newer copy written on another computer, holding one result */
const NEWER: ChangedElsewhere = {
  status: 'changed-elsewhere',
  reason: 'newer',
  copy: {
    labResults: [{ id: 1, ...result('From the folder') }],
    testValues: [],
    userNotes: [],
    exportedAt: at,
  } as unknown as ParsedBackupData,
  revision: 'r2',
  bytes: new ArrayBuffer(0),
  localChanged: false,
  folder: { labResults: 1, testValues: 0, notes: 0, savedAt: at },
  browser: { labResults: 1, testValues: 0, notes: 0, savedAt: at },
  folderLock: null,
};

function backupStore(onSave?: () => Promise<void>): FolderBackupStore & { saved: string[] } {
  const saved: string[] = [];
  return {
    saved,
    listBackups: async () => [...saved],
    saveBackup: async (name) => {
      saved.push(name);
      await onSave?.();
    },
    loadBackup: async () => new ArrayBuffer(0),
    deleteBackup: async () => undefined,
  };
}

describe('loadNewerFolderCopy', () => {
  beforeEach(() => localStorage.clear());

  async function setUp() {
    const test = await openTestDb();
    await test.db.addLabResult(result('Here'));
    const lastSeen = { revision: 'r1', digest: await exportDigest(test.db) };
    const session = { db: test.db, key: test.key };
    // As AppShell applies a copy: only while the data is as stamped, when given a stamp
    const apply = async (data: ParsedBackupData, unchangedSince?: string): Promise<string | null> =>
      (unchangedSince === undefined
        ? await restoreBackup(test.db, data)
        : await restoreBackupIfUnchanged(test.db, data, unchangedSince)
      )?.stamp ?? null;
    return { ...test, lastSeen, session, apply };
  }

  it('keeps this computer data as a backup, loads the copy and records it as seen', async () => {
    const { db, key, lastSeen, session, apply } = await setUp();
    const backups = backupStore();
    const onLoaded = vi.fn();

    await loadNewerFolderCopy(session, backups, NEWER, lastSeen, { apply, isCurrent: () => true, onLoaded });

    expect(backups.saved).toHaveLength(1);
    expect((await db.getAllLabResults()).map((r) => r.labName)).toEqual(['From the folder']);
    expect(onLoaded).toHaveBeenCalled();
    expect((await loadFolderSyncState(key))?.revision).toBe('r2');
  });

  it('does not record a change saved right after the load as seen', async () => {
    const { db, key, lastSeen, session, apply } = await setUp();
    const onLoaded = vi.fn();
    // Saved in another tab between the load and its record
    const applyThenChange = async (data: ParsedBackupData, unchangedSince: string) => {
      const loaded = await apply(data, unchangedSince);
      await db.addLabResult(result('Saved after the load'));
      return loaded;
    };

    await loadNewerFolderCopy(session, backupStore(), NEWER, lastSeen, {
      apply: applyThenChange,
      isCurrent: () => true,
      onLoaded,
    });

    const seen = await loadFolderSyncState(key);
    expect(seen?.revision).toBe('r2');
    // The next sync finds this computer's data differs from what it saw, and writes it
    expect(seen?.digest).not.toBe(await exportDigest(db));
  });

  it('loses no change saved after the backup: nothing is loaded, and the next sync decides', async () => {
    const { db, key, lastSeen, session, apply } = await setUp();
    // A change saved while the backup is written, after its export was checked
    const backups = backupStore(async () => void (await db.addLabResult(result('Saved meanwhile'))));
    const onLoaded = vi.fn();

    await loadNewerFolderCopy(session, backups, NEWER, lastSeen, { apply, isCurrent: () => true, onLoaded });

    expect((await db.getAllLabResults()).map((r) => r.labName).sort()).toEqual(['Here', 'Saved meanwhile']);
    expect(onLoaded).not.toHaveBeenCalled();
    // Not recorded as seen: the next sync finds both sides changed and asks
    expect(await loadFolderSyncState(key)).toBeNull();
  });

  it('loads nothing when this computer changed since it last saw the folder', async () => {
    const { db, lastSeen, session, apply } = await setUp();
    await db.addLabResult(result('Changed here'));
    const backups = backupStore();

    await loadNewerFolderCopy(session, backups, NEWER, lastSeen, {
      apply,
      isCurrent: () => true,
      onLoaded: vi.fn(),
    });

    expect(backups.saved).toHaveLength(0);
    expect(await db.getAllLabResults()).toHaveLength(2);
  });
});

describe('runFolderSync', () => {
  beforeEach(() => localStorage.clear());

  function folder(): FolderCopyStore & { save: ReturnType<typeof vi.fn>; saveLock: ReturnType<typeof vi.fn> } {
    return {
      loadCurrent: async () => null,
      loadPrevious: async () => null,
      loadLock: async () => null,
      save: vi.fn(async () => undefined),
      saveLock: vi.fn(async () => undefined),
    };
  }

  it('uses up the choice to replace a copy only once past the hold check', async () => {
    const { db, key } = await openTestDb();
    const takeReplaces = vi.fn(() => undefined);

    expect(
      await runFolderSync({ db, key }, folder(), { lock: null, takeReplaces, isEnabled: () => false })
    ).toBeNull();
    expect(takeReplaces).not.toHaveBeenCalled();
  });

  it('ends without a word when the hold begins before the save', async () => {
    const { db, key } = await openTestDb();
    await db.addLabResult(result('Here'));
    const store = folder();
    let enabled = true;
    const takeReplaces = vi.fn(() => {
      // The hold begins while the folder copy is read
      enabled = false;
      return undefined;
    });

    expect(await runFolderSync({ db, key }, store, { lock: null, takeReplaces, isEnabled: () => enabled })).toBeNull();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('writes neither the lock file nor the copy once the hold has begun', async () => {
    const { db, key } = await openTestDb();
    await db.addLabResult(result('Here'));
    const { credentials: lock } = await createCredentialsV2('Passw0rd!', 1000);
    const store = folder();
    let enabled = true;
    const takeReplaces = vi.fn(() => {
      enabled = false;
      return undefined;
    });

    expect(await runFolderSync({ db, key }, store, { lock, takeReplaces, isEnabled: () => enabled })).toBeNull();
    expect(store.saveLock).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('leaves the folder copy as it was while stored records could not be opened for the export', async () => {
    const { db, key } = await openTestDb();
    await db.addLabResult(result('Here'));
    const exportAllData = db.exportAllData.bind(db);
    // A record another tab sealed under another key since the unlock
    vi.spyOn(db, 'exportAllData').mockImplementation(async (onSkipped) => {
      const data = await exportAllData(onSkipped);
      onSkipped?.(1);
      return data;
    });
    const store = folder();
    const takeReplaces = vi.fn(() => 'r1');

    const run = await runFolderSync({ db, key }, store, { lock: null, takeReplaces, isEnabled: () => true });

    expect(run?.outcome).toMatchObject({ status: 'protected', reason: 'set-aside' });
    expect(store.save).not.toHaveBeenCalled();
    expect(takeReplaces).not.toHaveBeenCalled();
  });

  it('counts the records set aside after the export: one moved aside while it ran is never left out unannounced', async () => {
    const { db, key } = await openTestDb();
    await db.addLabResult(result('Here'));
    let exported = false;
    const exportAllData = db.exportAllData.bind(db);
    vi.spyOn(db, 'exportAllData').mockImplementation(async (onSkipped) => {
      const data = await exportAllData(onSkipped);
      exported = true;
      return data;
    });
    // Another tab moves a row aside while the export runs
    vi.spyOn(db, 'countSetAside').mockImplementation(async () =>
      exported ? { total: 1, unsaved: 1 } : { total: 0, unsaved: 0 }
    );
    const store = folder();

    const run = await runFolderSync({ db, key }, store, { lock: null, takeReplaces: () => undefined, isEnabled: () => true });

    expect(run?.outcome).toMatchObject({ status: 'protected', reason: 'set-aside' });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('keeps the choice to replace a copy while set-aside records keep the folder from being read', async () => {
    const { db, key } = await openTestDb();
    vi.spyOn(db, 'countSetAside').mockResolvedValue({ total: 1, unsaved: 1 });
    const takeReplaces = vi.fn(() => 'r1');

    await runFolderSync({ db, key }, folder(), { lock: null, takeReplaces, isEnabled: () => true });

    expect(takeReplaces).not.toHaveBeenCalled();
  });
});
