/**
 * Folder sync: what the folder copy may be replaced with
 *
 * The folder copy may be a user's only full copy of their lab data, so a sync
 * never replaces one that holds data with one that has none, and never
 * replaces one it cannot open. To tell, it decrypts the folder copy in memory
 * with the session key: a plaintext record count would leak how much health
 * data a person has.
 */

import { arrayBufferToBase64 } from '@data/encryption';
import { isLaterLock, isSameLock, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import { saveFolderSyncState, type FolderSyncState } from '@data/storage/folderSyncState';
import { BACKUP_SCHEMA_VERSION } from '@services/export/jsonExport';
import { isPreLoincBackupVersion, parseBackupData, type ParsedBackupData } from '@services/import';
import { openEnvelope, readEnvelopeHeader, resealWithoutLock, sealEnvelope } from './folderEnvelope';
import { keepLockFile, readLockFile, type FolderLockStore } from './folderLockFile';
import { logFailure } from '@/utils/logFailure';
import type { EncryptedDb } from '@data/db/encryptedDb';

/**
 * Format version of the encrypted sync file. Its records are those of the
 * backup schema of the same number, so a restore reads a copy back as it
 * reads a backup; a copy saved before tests were identified by LOINC (before
 * version 4) cannot be restored, and is never written over.
 */
export const FOLDER_SYNC_FILE_VERSION = BACKUP_SCHEMA_VERSION;

/** Everything a sync writes: the database as exported */
export type FolderSyncData = Awaited<ReturnType<EncryptedDb['exportAllData']>>;

/** The decrypted folder copy */
export interface FolderSyncFile {
  version: number;
  /** When it was saved, as an ISO string; anything else reads as an unknown date */
  exportedAt?: unknown;
  /** New with every write; absent from a copy written before the lock was kept beside it */
  revision?: string;
  /**
   * The revisions this copy was built on, newest first: the copy it replaced,
   * then that copy's own. A copy is loaded without asking only when it was
   * built on the one this browser last saw. Absent from older copies.
   */
  ancestors?: string[];
  data: FolderSyncData;
}

/** How many revisions a copy records as built on: a browser that missed more writes is asked */
export const MAX_FOLDER_ANCESTORS = 200;

/** What a sync knows besides the data */
export interface FolderWriteContext {
  /** This browser's lock, kept beside the copy; null when it has none */
  lock: StoredCredentialsV2 | null;
  /** Records set aside that are not yet saved */
  setAsideUnsaved: number;
  /** The revision this browser last read or wrote, and its data then; null when it never did */
  lastSeen: FolderSyncState | null;
  /** The revision the user chose to replace ("keep this computer's data") */
  replaces?: string | null;
  /**
   * False once the folder is known to hold `lock`: a sync that leaves the
   * data as they are then does not read the copy to put the lock in it
   * (sealLockIntoFolderCopy). Unknown counts as true.
   */
  lockMayBeBehind?: boolean;
}

/** One side of a conflict, as the user is shown it: counts and a date, never values */
export interface FolderSide {
  labResults: number;
  testValues: number;
  notes: number;
  /** The folder copy: when it was saved. This browser: its latest change. Null when unknown. */
  savedAt: Date | null;
}

/**
 * Whether "Keep this computer's data" cannot be carried out: this browser
 * holds no health records and the folder copy does, and a sync never writes
 * an empty browser over such a copy
 */
export function isNothingToKeep(browser: FolderSide, folder: FolderSide): boolean {
  const records = (side: FolderSide): number => side.labResults + side.testValues + side.notes;
  return records(browser) === 0 && records(folder) > 0;
}

/** The folder, as the sync reads and writes it: the copy, the previous copy and the lock file */
export interface FolderCopyStore extends FolderLockStore {
  /** The folder copy's bytes, or null when there is none */
  loadCurrent(): Promise<ArrayBuffer | null>;
  /** The previous copy's bytes, or null when there is none */
  loadPrevious(): Promise<ArrayBuffer | null>;
  /** Write the folder copy; given `previous`, keep those bytes as the previous copy first */
  save(data: ArrayBuffer, previous?: ArrayBuffer): Promise<void>;
}

/**
 * Why a sync left the folder copy alone: the browser has no health data but
 * the folder copy does (`empty`); the session key cannot read the folder copy,
 * so what it holds is unknown (`unreadable`); the copy carries a lock but the
 * session key does not open it: another setup made it, with another data key,
 * or its lock was edited (`another-setup`); a newer HemoIO wrote it, in a
 * format this one would lose parts of (`newer`); or an earlier HemoIO wrote
 * it before tests were identified by LOINC, so it cannot be restored and may
 * be the only copy of that history (`before-loinc`); or stored records that
 * cannot be opened are set aside and not yet saved, and the folder copy may
 * still hold them (`set-aside`)
 */
export type FolderProtectionReason =
  | 'empty'
  | 'unreadable'
  | 'another-setup'
  | 'newer'
  | 'before-loinc'
  | 'set-aside';

/**
 * `folderLock` is always the lock found in the folder, given whenever the
 * copy there opened (null for none, or a copy without one). It opened under
 * the session key with the lock sealed to it, so only a holder of the data
 * key can have written it.
 */
export type FolderSyncOutcome =
  /** `state` is what this browser has now seen: to be saved as its `lastSeen` */
  | { status: 'written'; state: FolderSyncState; folderLock: StoredCredentialsV2 | null }
  | { status: 'unchanged'; state: FolderSyncState; folderLock: StoredCredentialsV2 | null }
  | { status: 'protected'; reason: FolderProtectionReason; folderLock?: StoredCredentialsV2 | null }
  /**
   * The folder copy was written elsewhere since this browser last saw it (or
   * this browser never saw it). `reason` 'newer' means it is to be loaded:
   * built on the copy this browser last saw, which has not changed here
   * since. Otherwise the user chooses. `bytes` are the copy as it lies in
   * the folder.
   */
  | {
      status: 'changed-elsewhere';
      reason: ChangedElsewhereReason;
      copy: ParsedBackupData;
      revision: string | null;
      bytes: ArrayBuffer;
      localChanged: boolean;
      folder: FolderSide;
      browser: FolderSide;
      folderLock: StoredCredentialsV2 | null;
    };

/**
 * Why a copy written elsewhere is loaded or asked about: built on the one
 * this browser last saw, with nothing changed here (`newer`); both changed
 * (`both-changed`); nothing changed here, but the copy is not built on the
 * one last seen (`not-newer`); or nothing changed here and the copy is built
 * on the one last seen, but holds no health records while this browser does
 * (`empties`): everything may have been deleted on the other computer
 */
export type ChangedElsewhereReason = 'newer' | 'both-changed' | 'not-newer' | 'empties';

type CopyProblem = Exclude<FolderProtectionReason, 'empty' | 'set-aside'>;

/** A copy that opened, and the lock it carries */
interface OpenedCopy {
  file: FolderSyncFile;
  lock: StoredCredentialsV2 | null;
}

/**
 * How much a person would lose: lab results, test values and notes. Settings
 * and preferences do not count: a fresh setup has them too.
 */
function healthRecords(data: FolderSyncData): number {
  return data.labResults.length + data.testValues.length + data.userNotes.length;
}

/**
 * Whether a decrypted copy is a sync file: the one check for every reader
 * (the sync, a restore, recovery, a backup). Its save date is not checked:
 * a copy whose date cannot be read is loaded all the same, with the date
 * shown as unknown.
 */
export function isFolderSyncFile(value: unknown): value is FolderSyncFile {
  if (typeof value !== 'object' || value === null) return false;
  const { version, data } = value as Partial<FolderSyncFile>;
  return (
    typeof version === 'number' &&
    typeof data === 'object' &&
    data !== null &&
    Array.isArray(data.labResults) &&
    Array.isArray(data.testValues) &&
    Array.isArray(data.userNotes)
  );
}

/**
 * A copy's content and lock: `null` for no copy or an empty file, or why it
 * cannot be read as a current copy
 */
async function open(
  encrypted: ArrayBuffer | null,
  key: CryptoKey,
  ownLock: StoredCredentialsV2 | null = null
): Promise<OpenedCopy | null | CopyProblem> {
  // An interrupted first write can leave an empty file; there is nothing to lose
  if (!encrypted || encrypted.byteLength === 0) return null;

  const header = readEnvelopeHeader(encrypted);
  // 'unreadable' here and 'not-a-copy' in readFolderCopy: both name a damaged header
  if (header === 'damaged') return 'unreadable';
  let plain: ArrayBuffer;
  try {
    ({ plain } = await openEnvelope(encrypted, key));
  } catch {
    // Another key, a damaged file, or an edited lock. Not logged: a log would add nothing.
    // This browser's own lock beside a body that does not open: the file is damaged.
    if (!header?.lock || (ownLock !== null && isSameLock(ownLock, header.lock))) return 'unreadable';
    return 'another-setup';
  }

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plain));
    // Checked first: a newer HemoIO may lay its data out in a way this one cannot check
    const version = (parsed as { version?: unknown } | null)?.version;
    if (typeof version === 'number' && version > FOLDER_SYNC_FILE_VERSION) return 'newer';
    if (typeof version === 'number' && isPreLoincBackupVersion(version)) return 'before-loinc';
    return isFolderSyncFile(parsed) ? { file: parsed, lock: header?.lock ?? null } : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

/**
 * Whether the copy being replaced should become the previous copy. It must
 * hold at least half the records of the one already kept: a browser that lost
 * its data and then gains a result or two must not push the full history out
 * with its second write, while a cleanup that removes some records still lets
 * the previous copy move on. One that cannot be read is no copy to undo to.
 */
async function keepsAsPrevious(
  store: FolderCopyStore,
  replaced: FolderSyncFile,
  key: CryptoKey
): Promise<boolean> {
  const replacedRecords = healthRecords(replaced.data);
  if (replacedRecords === 0) return false;

  const previous = await open(await store.loadPrevious(), key);
  // A newer or pre-LOINC copy cannot be counted, but it is one to undo to
  if (previous === 'newer' || previous === 'before-loinc') return false;
  if (!previous || typeof previous === 'string') return true;
  return replacedRecords * 2 >= healthRecords(previous.file.data);
}

/** JSON with every object's keys sorted, so equal records give equal text however they were built */
function sortedJson(value: unknown): string {
  // Dates reach the replacer already as their ISO strings (toJSON runs first)
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      : item
  );
}

/**
 * The data in a form that compares equal for the same records however they
 * are numbered and ordered: a copy loaded from the folder is stored under
 * new IDs, and same-day results are exported in ID order. Which records
 * belong together (a value's result, a note's result and value) is kept,
 * by content rather than by ID. The settings are left out: they belong to
 * each computer, and loading a folder copy never takes them, so a
 * difference there is no change to the data the computers share.
 */
export function folderDataJson(data: FolderSyncData): string {
  // An ID set to undefined is left out of the JSON
  const resultJson = new Map(data.labResults.map((r) => [r.id, sortedJson({ ...r, id: undefined })]));
  const valueJson = new Map<number | undefined, string>();
  const valuesOf = new Map<number | undefined, string[]>();
  const unlinkedValues: string[] = [];
  for (const value of data.testValues) {
    const json = sortedJson({ ...value, id: undefined, labResultId: undefined });
    valueJson.set(value.id, json);
    if (!resultJson.has(value.labResultId)) unlinkedValues.push(json);
    else valuesOf.set(value.labResultId, [...(valuesOf.get(value.labResultId) ?? []), json]);
  }
  const linkTo = (map: Map<number | undefined, string>, id: number | undefined): string | null =>
    typeof id !== 'number' ? null : (map.get(id) ?? 'missing');

  return sortedJson({
    labResults: data.labResults
      .map((r) => sortedJson({ result: resultJson.get(r.id), values: (valuesOf.get(r.id) ?? []).sort() }))
      .sort(),
    unlinkedValues: unlinkedValues.sort(),
    userNotes: data.userNotes
      .map((note) =>
        sortedJson({
          ...note,
          id: undefined,
          labResultId: undefined,
          testValueId: undefined,
          labResult: linkTo(resultJson, note.labResultId),
          testValue: linkTo(valueJson, note.testValueId),
        })
      )
      .sort(),
    preferences: data.preferences ? { ...data.preferences, id: undefined } : null,
  });
}

/** SHA-256 of the data's folderDataJson, base64 */
export async function digestFolderData(dataJson: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataJson));
  return arrayBufferToBase64(digest);
}

/** The digest of this browser's data as it now is */
export async function exportDigest(db: Pick<EncryptedDb, 'exportAllData'>): Promise<string> {
  return digestFolderData(folderDataJson(await db.exportAllData()));
}

/** Saved as the digest when the data changed after a load: no export digests to it */
const CHANGED_SINCE_LOAD = 'changed-since-load';

/**
 * The one place that records "this browser has read or written this
 * revision": exports the data as it now is, digests it, and saves both.
 *
 * Given the stamp a load left (EncryptedDb.storedDataStamp), the digest is
 * saved only while the data is still as the load left it, checked after the
 * export: a change saved since, in this tab or another, is not recorded as
 * seen, and the next sync writes it.
 */
export async function markFolderCopySeen(
  db: Pick<EncryptedDb, 'exportAllData' | 'storedDataStamp'>,
  key: CryptoKey,
  revision: string | null,
  loadedStamp?: string
): Promise<void> {
  const digest = await exportDigest(db);
  const changed = loadedStamp !== undefined && (await db.storedDataStamp()) !== loadedStamp;
  await saveFolderSyncState({ revision, digest: changed ? CHANGED_SINCE_LOAD : digest }, key);
}

/** The data sealed as a folder copy, under a new revision */
export async function sealFolderCopy(
  data: FolderSyncData,
  key: CryptoKey,
  lock: StoredCredentialsV2 | null,
  ancestors: string[] = []
): Promise<{ bytes: ArrayBuffer; revision: string }> {
  const revision = crypto.randomUUID();
  // The version leads: the format is told by it before anything else
  const file =
    `{"version":${FOLDER_SYNC_FILE_VERSION},"exportedAt":"${new Date().toISOString()}",` +
    `"revision":"${revision}","ancestors":${JSON.stringify(ancestors.slice(0, MAX_FOLDER_ANCESTORS))},` +
    `"data":${JSON.stringify(data)}}`;
  return { bytes: await sealEnvelope(new TextEncoder().encode(file), key, lock), revision };
}

/**
 * What identifies a folder copy the user chose to replace: its revision, or
 * for a copy without one (written before revisions were kept), a digest of
 * its bytes
 */
export async function folderCopyId(bytes: ArrayBuffer, revision: string | null): Promise<string> {
  if (revision !== null) return revision;
  return `sha256:${arrayBufferToBase64(await crypto.subtle.digest('SHA-256', bytes))}`;
}

/**
 * The revisions a copy says it was built on. Anything but a list of strings
 * names none: such a copy is then never loaded without asking.
 */
function ancestorsOf(file: Pick<FolderSyncFile, 'ancestors'> | undefined): string[] {
  const value: unknown = file?.ancestors;
  return Array.isArray(value) && value.every((a) => typeof a === 'string') ? value : [];
}

/** A folder copy's records as a restore reads them, with dates; throws when they cannot be read */
export function parseFolderCopyData(file: {
  version: number;
  exportedAt?: unknown;
  data: { labResults?: unknown; testValues?: unknown; userNotes?: unknown; preferences?: unknown };
}): ParsedBackupData {
  const { data } = file;
  return parseBackupData({
    schemaVersion: file.version,
    // A date that cannot be read is an unknown date (Invalid Date), never a reason to refuse the copy
    exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : '',
    appVersion: 'folder copy',
    labResults: data.labResults,
    testValues: data.testValues,
    userNotes: data.userNotes,
    userPreferences: data.preferences ?? null,
    // Storage and AI settings belong to this device, as with a backup
    settings: null,
  });
}

/** When a record was last changed, or null */
function latestChange(records: Array<{ updatedAt?: unknown }>): Date | null {
  let latest: number | null = null;
  for (const { updatedAt } of records) {
    const time = updatedAt instanceof Date ? updatedAt.getTime() : NaN;
    if (!Number.isNaN(time) && (latest === null || time > latest)) latest = time;
  }
  return latest === null ? null : new Date(latest);
}

function sideOf(
  data: { labResults: unknown[]; testValues: unknown[]; userNotes: unknown[] },
  savedAt: Date | null
): FolderSide {
  return {
    labResults: data.labResults.length,
    testValues: data.testValues.length,
    notes: data.userNotes.length,
    savedAt: savedAt && !Number.isNaN(savedAt.getTime()) ? savedAt : null,
  };
}

/** What sealLockIntoFolderCopy did, and the lock the copy carries after it */
export interface LockReseal {
  /**
   * 'current': the folder holds this lock or a later one already, or no copy
   * (or a copy without a lock) holds an older one; 'resealed': the copy was sealed again with this
   * lock, its content untouched; 'not-opened': the copy does not open under
   * the key, and nothing was written
   */
  status: 'current' | 'resealed' | 'not-opened';
  /** The lock the copy carries now, once it opened under the key; null otherwise */
  folderLock: StoredCredentialsV2 | null;
}

/**
 * A password change reaches the folder whatever keeps the data from being
 * written (records set aside, an empty browser, a question to the user, a
 * hold): when this browser's lock is later than the one the copy carries,
 * the copy's own plaintext is sealed again with it, so the same revision,
 * ancestors and data, and the lock file brought up to date. The data are
 * never touched, so nothing a protection guards is at risk; and an old
 * password no longer opens the key that opens the copy. The previous copy
 * is left as it is: it carries no lock. Rejects when the folder cannot be
 * read or written.
 *
 * `encrypted`: the copy's bytes, when already read.
 */
export async function sealLockIntoFolderCopy(
  store: FolderCopyStore,
  key: CryptoKey,
  lock: StoredCredentialsV2,
  encrypted?: ArrayBuffer | null
): Promise<LockReseal> {
  // No lock in the copy for an old password to open: only a lock file
  // holding an older lock is put right; the next write of the data adds one
  const putRightLockFile = async (): Promise<LockReseal> => {
    const fileLock = readLockFile(await store.loadLock().catch(() => null));
    if (fileLock !== null && isLaterLock(lock, fileLock)) await keepLockFile(store, lock);
    return { status: 'current', folderLock: null };
  };
  const bytes = encrypted === undefined ? await store.loadCurrent() : encrypted;
  if (!bytes || bytes.byteLength === 0) return putRightLockFile();
  // Opened first, whatever the header says: its lock counts only once the
  // copy opens under the key, as AES-GCM then proves the header unedited
  let opened: Awaited<ReturnType<typeof openEnvelope>>;
  try {
    opened = await openEnvelope(bytes, key);
  } catch {
    return { status: 'not-opened', folderLock: null };
  }
  const { header, plain } = opened;
  const folderLock = header?.lock ?? null;
  if (folderLock === null) return putRightLockFile();
  if (!isLaterLock(lock, folderLock)) return { status: 'current', folderLock };
  const sealed = await sealEnvelope(new Uint8Array(plain), key, lock);
  // The lock file first, as for every write of a copy with a lock
  await keepLockFile(store, lock);
  await store.save(sealed);
  return { status: 'resealed', folderLock: lock };
}

/**
 * Rejected by a store's save once the sync's hold has begun: nothing was
 * written, and the sync ends without a word, as one never started would
 */
export class FolderWriteHeld extends Error {}

/**
 * Write the data to the folder copy, unless that could lose data there.
 * A copy with the same data is not rewritten, so the previous copy stays the
 * one from before the last real change, unless this browser's lock is later
 * than the one beside it (a password change): then the lock must reach the
 * folder. The lock written is the later of the two, so an earlier one never
 * replaces a password change made elsewhere.
 *
 * A copy written elsewhere since this browser last saw it is never written
 * over unseen: it is returned as 'changed-elsewhere', to be loaded when this
 * browser changed nothing since, or for the user to choose when it did.
 *
 * While records that cannot be opened are set aside and unsaved, the folder
 * copy may be the only place that still holds them, and the export leaves
 * them out: it is left as it is, and not even read. Nor is a newer copy
 * loaded over them.
 *
 * The lock file beside the copy (folderLockFile.ts) is kept holding the
 * lock the copy carries: written before any copy with a lock, and brought
 * up to date when the copy is left unchanged.
 */
export async function writeFolderCopy(
  store: FolderCopyStore,
  data: FolderSyncData,
  key: CryptoKey,
  context: FolderWriteContext
): Promise<FolderSyncOutcome> {
  const outcome = await syncFolderCopy(store, data, key, context);
  // The lock file follows the copy's lock, which opened under the session
  // key, even when the copy is left as it is: a lock adopted from another
  // computer, or a lock file lost, is put right by the next sync
  if (outcome.status === 'unchanged' && outcome.folderLock) await keepLockFile(store, outcome.folderLock);
  // The data are left as they are, but a password change made here still
  // reaches the folder (P42). Only after the data's own decision: records
  // set aside keep the copy from being read for that, never for this.
  const dataLeft = outcome.status === 'protected' || outcome.status === 'changed-elsewhere';
  if (dataLeft && context.lock !== null && context.lockMayBeBehind !== false) {
    const bytes = outcome.status === 'changed-elsewhere' ? outcome.bytes : undefined;
    try {
      const reseal = await sealLockIntoFolderCopy(store, key, context.lock, bytes);
      if (reseal.folderLock !== null) return { ...outcome, folderLock: reseal.folderLock };
    } catch (error) {
      // A write the hold stopped did not fail: the caller ends the sync quietly
      if (error instanceof FolderWriteHeld) throw error;
      // The data's own outcome is what the user needs to hear; the lock is
      // tried again at the next sync. Fixed text: the error could name the folder.
      logFailure('Could not put the new lock into the folder copy');
    }
  }
  return outcome;
}

/** writeFolderCopy, but for the lock file of a copy left unchanged */
async function syncFolderCopy(
  store: FolderCopyStore,
  data: FolderSyncData,
  key: CryptoKey,
  context: FolderWriteContext
): Promise<FolderSyncOutcome> {
  if (context.setAsideUnsaved > 0) {
    return { status: 'protected', reason: 'set-aside' };
  }
  const encrypted = await store.loadCurrent();
  const existing = await open(encrypted, key, context.lock);
  if (typeof existing === 'string') {
    return { status: 'protected', reason: existing };
  }

  const local = folderDataJson(data);
  const digest = await digestFolderData(local);
  const folderLock = existing?.lock ?? null;
  const lockIsLater = context.lock !== null && isLaterLock(context.lock, folderLock);
  const revision = typeof existing?.file.revision === 'string' ? existing.file.revision : null;
  // What the copy was built on; a copy without a revision is no ancestor to name
  const ancestors = revision === null ? [] : [revision, ...ancestorsOf(existing?.file)];

  /**
   * Seal and save, as built on the copy there now; `keepPrevious`: keep that
   * copy as the previous copy when it should be (not for a lock-only rewrite)
   */
  const write = async (keepPrevious: boolean, builtOn: string[] = ancestors): Promise<FolderSyncOutcome> => {
    const lock = lockIsLater || folderLock === null ? context.lock : folderLock;
    const sealed = await sealFolderCopy(data, key, lock, builtOn);
    const replaced = keepPrevious ? existing : null;
    const keep = replaced !== null && (await keepsAsPrevious(store, replaced.file, key));
    // Only the current copy carries the lock. A password change re-wraps the
    // same data key, so an older lock left in the previous copy would let an
    // old password unwrap the key that opens the current copy too. Opened
    // again only now, rather than its plaintext kept through every sync, and
    // sealed before anything is saved: if this fails, both files stay as they are.
    const previous = keep ? await resealWithoutLock(encrypted as ArrayBuffer, key) : undefined;
    // The lock file first: if the copy then fails to save, the file holds
    // the lock this browser has, and the next sync writes the copy to match
    if (lock !== null) await keepLockFile(store, lock);
    await store.save(sealed.bytes, previous);
    return { status: 'written', state: { revision: sealed.revision, digest }, folderLock };
  };
  const unchanged: FolderSyncOutcome = { status: 'unchanged', state: { revision, digest }, folderLock };

  // An interrupted first write, or none yet: there is nothing to lose
  if (!existing) return write(false);
  const copy = existing;
  // Canonicalised only when needed: a copy this browser last saw, with its
  // data unchanged here, needs neither (most syncs)
  let copyJsonMemo: string | undefined;
  const copyJson = (): string => (copyJsonMemo ??= folderDataJson(copy.file.data));
  const sameData = (): boolean => local === copyJson();

  /** The rules for a copy this browser may write over: never with nothing, keeping the previous copy */
  const writeOver = (builtOn: string[] = ancestors): Promise<FolderSyncOutcome> | FolderSyncOutcome => {
    const same = sameData();
    if (same && !lockIsLater) return unchanged;
    if (!same && healthRecords(copy.file.data) > 0 && healthRecords(data) === 0) {
      return { status: 'protected', reason: 'empty', folderLock };
    }
    // Only the lock changed: the previous copy stays the one from before the last change of data
    return write(!same, builtOn);
  };

  /** The copy is to be loaded ('newer'), or the user is to choose */
  const changedElsewhere = (reason: ChangedElsewhereReason, localChanged: boolean): FolderSyncOutcome => {
    let parsed: ParsedBackupData;
    try {
      parsed = parseFolderCopyData(copy.file);
    } catch {
      // Opens, but its records cannot be read back: no copy to load, and none
      // to write over. Its lock opened under the key, so a later one is adopted.
      return { status: 'protected', reason: 'unreadable', folderLock };
    }
    return {
      status: 'changed-elsewhere',
      reason,
      copy: parsed,
      revision,
      bytes: encrypted as ArrayBuffer,
      localChanged,
      folder: sideOf(parsed, parsed.exportedAt),
      browser: sideOf(data, latestChange([...data.labResults, ...data.testValues, ...data.userNotes])),
      folderLock,
    };
  };

  // The user chose to replace this very copy (a copy without a revision by its bytes)
  const { replaces } = context;
  if (typeof replaces === 'string' && replaces === (await folderCopyId(encrypted as ArrayBuffer, revision))) {
    // Built on both sides of the conflict: so the copy this browser saw last
    // is an ancestor too, and a computer that saw it loads the result by itself
    const own = context.lastSeen?.revision;
    const builtOn = typeof own === 'string' ? [...new Set([...ancestors.slice(0, 1), own, ...ancestors])] : ancestors;
    return writeOver(builtOn);
  }

  const { lastSeen } = context;
  // The copy this browser last read or wrote; or one rewritten elsewhere with
  // the data this browser saw then, as a password change there rewrites it
  // for the lock alone: nothing in it is new to this browser. A missing
  // revision never matches a missing one.
  const sameRevision = lastSeen !== null && revision !== null && revision === lastSeen.revision;
  // Seen, and nothing changed on either side: the common case, settled before canonicalising the copy
  if (sameRevision && digest === lastSeen.digest && !lockIsLater) return unchanged;
  const seenBefore =
    lastSeen !== null && (sameRevision || (await digestFolderData(copyJson())) === lastSeen.digest);
  if (seenBefore) {
    if (digest === lastSeen.digest && !lockIsLater) return unchanged;
    return writeOver();
  }

  // Written elsewhere, or never read here
  if (sameData()) return lockIsLater ? write(false) : unchanged;
  if (lastSeen === null) {
    if (healthRecords(copy.file.data) === 0) return write(true);
    // A browser that lost its data must not write its empty state over the copy
    if (healthRecords(data) === 0) return { status: 'protected', reason: 'empty', folderLock };
    return changedElsewhere('both-changed', true);
  }
  // Loaded without asking only when nothing here changed since this browser
  // last saw the folder, the copy was built on that one (not an older copy
  // put back, one written at the same time, or another folder's), and it
  // takes no health records away
  const localChanged = digest !== lastSeen.digest;
  const builtOnLastSeen = lastSeen.revision !== null && ancestors.includes(lastSeen.revision);
  if (localChanged) return changedElsewhere('both-changed', true);
  if (!builtOnLastSeen) return changedElsewhere('not-newer', false);
  return changedElsewhere(healthRecords(copy.file.data) > 0 || healthRecords(data) === 0 ? 'newer' : 'empties', false);
}
