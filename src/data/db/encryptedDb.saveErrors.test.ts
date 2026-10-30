/**
 * Writes the browser's storage does not keep reject with a SaveError, and
 * leave nothing of themselves behind
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import Dexie from 'dexie';
import { IDBObjectStore } from 'fake-indexeddb';
import { EncryptedDb } from './encryptedDb';
import { SaveError } from './saveError';
import { openTestDb, type TestDb } from './testDb';
import type { LabResult, TestValue, UserNote } from '@/types';

const now = new Date('2024-01-15T10:00:00Z');

const labResult = (labName: string): Omit<LabResult, 'id'> => ({
  date: now,
  labName,
  createdAt: now,
  updatedAt: now,
});

const value = (biomarkerKey: string): Omit<TestValue, 'id' | 'labResultId'> => ({
  biomarkerKey,
  value: 95,
  unit: 'mg/dL',
  createdAt: now,
  updatedAt: now,
});

const note = (content: string): Omit<UserNote, 'id'> => ({
  labResultId: 1,
  content,
  tags: [],
  createdAt: now,
  updatedAt: now,
});

type Failure =
  /** The request is refused at once */
  | 'quota'
  /** The request succeeds, then the transaction aborts for lack of room, as at commit */
  | 'quota-at-commit'
  /** The request succeeds, then the transaction is cancelled */
  | 'cancel';

const WRITES = ['add', 'put', 'delete', 'clear'] as const;

/**
 * Make the storage fail every write from the `from`th request on (1 = the first)
 */
function failWrites(failure: Failure, from = 1): void {
  let count = 0;
  const proto = IDBObjectStore.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of WRITES) {
    const original = proto[name];
    vi.spyOn(proto, name).mockImplementation(function (this: IDBObjectStore, ...args: unknown[]) {
      if (++count < from) return original.apply(this, args);
      if (failure === 'quota') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      const request = original.apply(this, args) as IDBRequest;
      const transaction = this.transaction as IDBTransaction & { _abort(name: string): void };
      request.addEventListener('success', () => {
        if (failure === 'cancel') transaction.abort();
        else transaction._abort('QuotaExceededError');
      });
      return request;
    });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function rejection(promise: Promise<unknown>): Promise<SaveError> {
  const error = await promise.then(
    () => undefined,
    (err: unknown) => err
  );
  expect(error).toBeInstanceOf(SaveError);
  return error as SaveError;
}

describe('EncryptedDb: a write the storage does not keep', () => {
  it.each<[Failure, SaveError['kind']]>([
    ['quota', 'quota'],
    ['quota-at-commit', 'quota'],
    ['cancel', 'failed'],
  ])('rejects (%s) and stores nothing', async (failure, kind) => {
    const { db } = await openTestDb();
    failWrites(failure);

    expect((await rejection(db.addNote(note('Felt tired')))).kind).toBe(kind);

    vi.restoreAllMocks();
    expect(await db.getAllNotes()).toEqual([]);
  });

  it('leaves an edited note as it was', async () => {
    const { db } = await openTestDb();
    const id = await db.addNote(note('Original'));
    failWrites('quota-at-commit');

    await rejection(db.updateNote(id, { content: 'Changed' }));

    vi.restoreAllMocks();
    expect((await db.getNote(id))?.content).toBe('Original');
  });

  it('leaves a deleted note, and a deleted lab result with its values, in place', async () => {
    const { db } = await openTestDb();
    const [resultId] = await db.addLabResultsWithValues([
      { labResult: labResult('Lab'), testValues: [value('glucose'), value('hemoglobin')] },
    ]);
    const noteId = await db.addNote(note('Keep me'));
    // Both values are deleted first (writes 1 and 2): the result's own
    // deletion, write 3, is what fails
    failWrites('cancel', 3);

    await rejection(db.deleteLabResult(resultId));
    vi.restoreAllMocks();
    failWrites('cancel');
    await rejection(db.deleteNote(noteId));

    vi.restoreAllMocks();
    expect(await db.getLabResult(resultId)).toBeDefined();
    expect(await db.getTestValuesByLabResult(resultId)).toHaveLength(2);
    expect(await db.getNote(noteId)).toBeDefined();
  });

  it('leaves the preferences as they were', async () => {
    const { db } = await openTestDb();
    await db.updatePreferences(() => ({ unitPreferences: { glucose: 'mg/dL' } }));
    failWrites('cancel');

    await rejection(db.updatePreferences(() => ({ unitPreferences: { glucose: 'mmol/L' } })));
    await rejection(db.updateSettings({ aiProvider: 'anthropic' }));

    vi.restoreAllMocks();
    expect((await db.getPreferences())?.unitPreferences).toEqual({ glucose: 'mg/dL' });
    expect((await db.getSettings())?.aiProvider).toBeUndefined();
  });

  it('keeps the data a restore would have replaced', async () => {
    const { db } = await openTestDb();
    await db.addLabResultsWithValues([{ labResult: labResult('Current'), testValues: [value('glucose')] }]);
    // Cleared and refilled: only the last request fails
    failWrites('cancel', 5);

    await rejection(
      db.replaceLabData({
        labResults: [{ id: 1, ...labResult('Restored') }],
        testValues: [],
        userNotes: [],
        userPreferences: { unitPreferences: {}, personalTargets: {}, theme: 'dark', dateFormat: 'MM/DD/YYYY' },
      })
    );

    vi.restoreAllMocks();
    expect((await db.getAllLabResults()).map((r) => r.labName)).toEqual(['Current']);
    expect(await db.getAllTestValues()).toHaveLength(1);
  });

  it('rejects as closed when the connection to the storage is gone', async () => {
    const { db, database } = await openTestDb();
    await db.getAllNotes();
    database.close();

    expect((await rejection(db.addNote(note('Late')))).kind).toBe('closed');
  });
});

describe('EncryptedDb.addLabResultsWithValues', () => {
  it('stores every lab result with its values, under the new result IDs', async () => {
    const { db } = await openTestDb();

    const ids = await db.addLabResultsWithValues([
      { labResult: labResult('First'), testValues: [value('glucose')] },
      { labResult: labResult('Second'), testValues: [value('hemoglobin'), value('ldl')] },
    ]);

    expect(ids).toHaveLength(2);
    expect((await db.getTestValuesByLabResult(ids[0])).map((v) => v.biomarkerKey)).toEqual(['glucose']);
    expect((await db.getTestValuesByLabResult(ids[1])).map((v) => v.biomarkerKey).sort()).toEqual([
      'hemoglobin',
      'ldl',
    ]);
  });

  it('stores none of them when one cannot be stored', async () => {
    const { db } = await openTestDb();
    // Both results, then the values: all but the last value go through
    failWrites('quota', 4);

    await rejection(
      db.addLabResultsWithValues([
        { labResult: labResult('First'), testValues: [value('glucose')] },
        { labResult: labResult('Second'), testValues: [value('hemoglobin')] },
      ])
    );

    vi.restoreAllMocks();
    expect(await db.getAllLabResults()).toEqual([]);
    expect(await db.getAllTestValues()).toEqual([]);
  });
});

describe('EncryptedDb: a write that does not finish in time', () => {
  const withDeadline = ({ database, key }: TestDb) =>
    new EncryptedDb(key, database, { writeTimeoutMs: 50 });

  it('is cancelled when the storage never opens, and does not write once it does', async () => {
    const test = await openTestDb();
    const db = withDeadline(test);
    const open = test.database.open.bind(test.database);
    vi.spyOn(test.database, 'open').mockReturnValue(new Promise(() => {}) as never);

    expect((await rejection(db.addNote(note('Never')))).kind).toBe('timeout');

    vi.restoreAllMocks();
    await open();
    // Let the queued transaction run (and cancel itself)
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await test.db.getAllNotes()).toEqual([]);
  });

  it('is aborted when it hangs part-way, leaving the record as it was', async () => {
    const test = await openTestDb();
    const db = withDeadline(test);
    const id = await db.addNote(note('Original'));
    // Decrypting the current note, inside the transaction, never finishes
    vi.spyOn(crypto.subtle, 'decrypt').mockReturnValue(new Promise(() => {}));

    expect((await rejection(db.updateNote(id, { content: 'Changed' }))).kind).toBe('timeout');

    vi.restoreAllMocks();
    expect((await test.db.getNote(id))?.content).toBe('Original');
  });

  it('reports a commit that fails after the deadline found it committing', async () => {
    const test = await openTestDb();
    const db = withDeadline(test);
    // Dexie stops listening once its own abort() is refused, so its promise
    // never settles: only the browser's event says how the commit ended
    const idbtrans = Object.assign(new EventTarget(), {
      error: null as DOMException | null,
      abort(): void {
        throw new DOMException('The transaction is committing', 'InvalidStateError');
      },
    });
    vi.spyOn(test.database, 'transaction').mockImplementation(((...args: unknown[]) => {
      const scope = args.at(-1) as (tx: unknown) => unknown;
      void scope({ active: true, idbtrans, abort: idbtrans.abort });
      return new Promise(() => {});
    }) as never);
    setTimeout(() => {
      idbtrans.error = new DOMException('Quota exceeded', 'QuotaExceededError');
      idbtrans.dispatchEvent(new Event('abort'));
    }, 100);

    expect((await rejection(db.addNote(note('Late')))).kind).toBe('quota');
  });

  it('reports a transaction the browser aborts while the write is encrypting', async () => {
    const test = await openTestDb();
    const db = withDeadline(test);
    const id = await db.addNote(note('Original'));
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'decrypt').mockImplementation((...args) => {
      // Inside Dexie.waitFor, which never returns once the transaction is gone
      const trans = Dexie.currentTransaction as unknown as { idbtrans: { _abort(name: string): void } };
      setTimeout(() => trans.idbtrans._abort('AbortError'), 10);
      return new Promise((resolve) => setTimeout(() => resolve(decrypt(...args)), 30));
    });

    const outcome = await Promise.race([
      db.updateNote(id, { content: 'Changed' }).then(
        () => 'saved',
        (err: unknown) => (err instanceof SaveError ? 'refused' : 'other error')
      ),
      new Promise((resolve) => setTimeout(() => resolve('never settled'), 1000)),
    ]);

    expect(outcome).toBe('refused');
  });
});
