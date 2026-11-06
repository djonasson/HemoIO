/**
 * Steps for a second computer that syncs to the same folder
 *
 * The other computer is played in the page itself: it holds the same data key
 * (unwrapped from this browser's lock with the password), and writes the
 * folder copy as HemoIO does. The envelope is spelt out here rather than
 * imported from the app, so these tests check the format on disk:
 *
 *   JSON { format: 'hemoio-folder-copy', version: 1, lock, sealed }
 *   sealed = base64(IV + AES-GCM(body)), with the header as additional data
 *   additional data = JSON of { format, version, lock { version, kekSalt,
 *     iterations, wrapIv, wrappedKey, changedAt (null when absent) } }
 */

import type { Page } from '@playwright/test';
import { SEED_LAB_RESULTS, SEED_TEST_VALUES, type SeedData } from './data.steps';
import { FOLDER_COPY, TEST_FOLDER_NAME, readFolderFile, writeFolderFile } from './folderSync.steps';
import { CREDENTIALS_KEY, storedCredentials } from './app.steps';

export interface OtherComputerCopy {
  /** The password this browser's lock opens with, which the other computer knows too */
  password: string;
  /** What the other computer holds; the seeded lab results by default */
  data?: SeedData;
  /** The password the other computer changed to: its copy then carries a new lock */
  newPassword?: string;
  /** When that change was made (ISO); now by default */
  changedAt?: string;
  /** The folder both computers sync to */
  folderName?: string;
  /**
   * The copies this one replaced, newest first; none by default, as a
   * computer that never read the folder writes. See `ancestryOfFolderCopy`.
   */
  ancestors?: string[];
}

/** Where a copy's data key comes from: this browser's lock, or a setup of its own */
type KeySource =
  | { kind: 'this-setup'; password: string; newPassword?: string; changedAt?: string }
  | { kind: 'another-setup' };

/**
 * Seal `data` as a folder copy and write it to the folder, in the page.
 * Web Crypto runs in the browser, so the keys never leave it.
 */
export async function writeEnvelopeCopy(
  page: Page,
  source: KeySource,
  data: SeedData = {},
  folderName: string = TEST_FOLDER_NAME,
  ancestors: string[] = []
): Promise<void> {
  const body = {
    labResults: data.labResults ?? SEED_LAB_RESULTS,
    testValues: data.testValues ?? SEED_TEST_VALUES,
    userNotes: data.userNotes ?? [],
    ...(data.userPreferences ? { preferences: data.userPreferences } : {}),
  };
  await page.evaluate(
    async ({ source, body, folderName, fileName, ancestors, credentialsKey }) => {
      const toBase64 = (bytes: Uint8Array): string => {
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary);
      };
      const fromBase64 = (text: string): Uint8Array =>
        Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
      const kekFor = async (password: string, salt: Uint8Array, iterations: number) =>
        crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
          await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
            'deriveKey',
          ]),
          { name: 'AES-GCM', length: 256 },
          false,
          ['wrapKey', 'unwrapKey']
        );
      interface Lock {
        version: 2;
        kekSalt: string;
        iterations: number;
        wrapIv: string;
        wrappedKey: string;
        changedAt?: string;
      }
      const wrap = async (dataKey: CryptoKey, password: string, iterations: number, changedAt: string) => {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrapped = await crypto.subtle.wrapKey('raw', dataKey, await kekFor(password, salt, iterations), {
          name: 'AES-GCM',
          iv,
        });
        const lock: Lock = {
          version: 2,
          kekSalt: toBase64(salt),
          iterations,
          wrapIv: toBase64(iv),
          wrappedKey: toBase64(new Uint8Array(wrapped)),
          changedAt,
        };
        return lock;
      };

      let dataKey: CryptoKey;
      let lock: Lock;
      if (source.kind === 'another-setup') {
        dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
          'encrypt',
          'decrypt',
        ]);
        // Cheap to make; nobody unwraps it here
        lock = await wrap(dataKey, 'Another-Setup-Passw0rd!', 1000, new Date().toISOString());
      } else {
        const stored = JSON.parse(localStorage.getItem(credentialsKey) ?? 'null') as Lock;
        const kek = await kekFor(source.password, fromBase64(stored.kekSalt), stored.iterations);
        dataKey = await crypto.subtle.unwrapKey(
          'raw',
          fromBase64(stored.wrappedKey) as BufferSource,
          kek,
          { name: 'AES-GCM', iv: fromBase64(stored.wrapIv) as BufferSource },
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        lock = source.newPassword
          ? await wrap(
              dataKey,
              source.newPassword,
              stored.iterations,
              source.changedAt ?? new Date().toISOString()
            )
          : stored;
      }

      const header = { format: 'hemoio-folder-copy', version: 1, lock };
      const additionalData = new TextEncoder().encode(
        JSON.stringify({
          format: header.format,
          version: header.version,
          lock: {
            version: lock.version,
            kekSalt: lock.kekSalt,
            iterations: lock.iterations,
            wrapIv: lock.wrapIv,
            wrappedKey: lock.wrappedKey,
            changedAt: lock.changedAt ?? null,
          },
        })
      );
      const plain = new TextEncoder().encode(
        JSON.stringify({
          version: 4,
          exportedAt: new Date().toISOString(),
          revision: crypto.randomUUID(),
          ancestors,
          data: body,
        })
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, dataKey, plain)
      );
      const sealed = new Uint8Array(iv.length + cipher.length);
      sealed.set(iv);
      sealed.set(cipher, iv.length);

      const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName, {
        create: true,
      });
      const writable = await (await folder.getFileHandle(fileName, { create: true })).createWritable();
      await writable.write(JSON.stringify({ ...header, sealed: toBase64(sealed) }));
      await writable.close();
    },
    { source, body, folderName, fileName: FOLDER_COPY, ancestors, credentialsKey: CREDENTIALS_KEY }
  );
}

/**
 * Given I changed my password on another computer that syncs to the same
 * folder — or only saved there, with `newPassword` left out
 */
export function saveCopyAsAnotherComputer(page: Page, options: OtherComputerCopy): Promise<void> {
  const { password, data, newPassword, changedAt, folderName, ancestors } = options;
  return writeEnvelopeCopy(
    page,
    { kind: 'this-setup', password, newPassword, changedAt },
    data,
    folderName,
    ancestors
  );
}

/** The folder copy as it lies in the folder: its plaintext header, and how long the sealed part is */
export function readFolderEnvelope(
  page: Page,
  folderName: string = TEST_FOLDER_NAME
): Promise<{ header: { format?: unknown; version?: unknown; lock?: Record<string, unknown> | null }; sealedLength: number }> {
  return page.evaluate(
    async ({ folderName, fileName }) => {
      const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName);
      const text = await (await (await folder.getFileHandle(fileName)).getFile()).text();
      const { sealed, ...header } = JSON.parse(text) as { sealed?: string } & Record<string, unknown>;
      return { header, sealedLength: typeof sealed === 'string' ? sealed.length : 0 };
    },
    { folderName, fileName: FOLDER_COPY }
  );
}

/** The folder copy's text, as anyone opening the file would see it */
export async function readFolderCopyText(page: Page, folderName: string = TEST_FOLDER_NAME): Promise<string> {
  const text = await readFolderFile(page, folderName, FOLDER_COPY);
  if (text === null) throw new Error('No folder copy');
  return text;
}

/** The changedAt of this browser's stored lock */
export async function storedLockChangedAt(page: Page): Promise<string | undefined> {
  return (JSON.parse((await storedCredentials(page)) ?? '{}') as { changedAt?: string }).changedAt;
}

/** Mirrors FOLDER_SYNC_LOCK in src/utils/withWebLock.ts */
const FOLDER_SYNC_LOCK = 'hemoio-folder-sync';

/** Mirrors FOLDER_BACKUPS_DIR_NAME in FileSystemStorageProvider */
export const FOLDER_BACKUPS = 'hemoio-backups';

/**
 * The body sealed inside a folder file — the copy, the previous copy, or a
 * backup at `hemoio-backups/<name>` — opened with the data key, unwrapped
 * from this browser's lock with `password`
 */
export function folderFileBody(
  page: Page,
  path: string,
  password: string,
  folderName: string = TEST_FOLDER_NAME
): Promise<{
  revision?: string;
  exportedAt?: string;
  ancestors?: string[];
  data: { labResults: Array<{ labName?: string }>; testValues: unknown[]; userNotes: unknown[]; preferences?: object };
}> {
  return page.evaluate(
    async ({ path, password, folderName, credentialsKey }) => {
      const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
        Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
      const stored = JSON.parse(localStorage.getItem(credentialsKey) ?? 'null');
      const kek = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: fromBase64(stored.kekSalt), iterations: stored.iterations, hash: 'SHA-256' },
        await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']),
        { name: 'AES-GCM', length: 256 },
        false,
        ['unwrapKey']
      );
      const dataKey = await crypto.subtle.unwrapKey(
        'raw',
        fromBase64(stored.wrappedKey),
        kek,
        { name: 'AES-GCM', iv: fromBase64(stored.wrapIv) },
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName);
      const parts = path.split('/');
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
      const file = JSON.parse(await (await (await dir.getFileHandle(parts.at(-1)!)).getFile()).text());
      const { lock } = file;
      const additionalData = new TextEncoder().encode(
        JSON.stringify({
          format: file.format,
          version: file.version,
          lock: lock && {
            version: lock.version,
            kekSalt: lock.kekSalt,
            iterations: lock.iterations,
            wrapIv: lock.wrapIv,
            wrappedKey: lock.wrappedKey,
            changedAt: lock.changedAt ?? null,
          },
        })
      );
      const sealed = fromBase64(file.sealed);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: sealed.slice(0, 12), additionalData },
        dataKey,
        sealed.slice(12)
      );
      return JSON.parse(new TextDecoder().decode(plain));
    },
    { path, password, folderName, credentialsKey: CREDENTIALS_KEY }
  );
}

/**
 * The data in the folder copy as it is now, for the other computer to save
 * again: as its sync does when only its password changed
 */
export async function currentFolderData(
  page: Page,
  password: string,
  folderName: string = TEST_FOLDER_NAME
): Promise<SeedData> {
  const { data } = await folderFileBody(page, FOLDER_COPY, password, folderName);
  return {
    labResults: data.labResults,
    testValues: data.testValues,
    userNotes: data.userNotes,
    ...(data.preferences ? { userPreferences: data.preferences } : {}),
  };
}

/**
 * The ancestry a copy built on the folder copy now there carries: that
 * copy's revision, then its own ancestors, newest first, as HemoIO writes it
 */
export async function ancestryOfFolderCopy(
  page: Page,
  password: string,
  folderName: string = TEST_FOLDER_NAME
): Promise<string[]> {
  const { revision, ancestors } = await folderFileBody(page, FOLDER_COPY, password, folderName);
  return [...(revision ? [revision] : []), ...(ancestors ?? [])].slice(0, 50);
}

/**
 * The revision sealed inside a folder file: the same however often the copy
 * is sealed again (the previous copy is sealed again without its lock). Opened
 * with the data key, unwrapped from this browser's lock with `password`.
 */
export async function folderFileRevision(
  page: Page,
  fileName: string,
  password: string,
  folderName: string = TEST_FOLDER_NAME
): Promise<string | null> {
  return (await folderFileBody(page, fileName, password, folderName)).revision ?? null;
}

/** The plaintext header of a folder file, at `hemoio-backups/<name>` for a backup */
export function folderFileHeader(
  page: Page,
  path: string,
  folderName: string = TEST_FOLDER_NAME
): Promise<{ format?: unknown; lock?: unknown }> {
  return page.evaluate(
    async ({ path, folderName }) => {
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName);
      const parts = path.split('/');
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
      const file = JSON.parse(await (await (await dir.getFileHandle(parts.at(-1)!)).getFile()).text());
      delete file.sealed;
      return file;
    },
    { path, folderName }
  );
}

/** The names of the dated backups in the folder, oldest first; none when it holds none */
export function folderBackupNames(page: Page, folderName: string = TEST_FOLDER_NAME): Promise<string[]> {
  return page.evaluate(
    async ({ folderName, backups }) => {
      const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName);
      let dir: FileSystemDirectoryHandle;
      try {
        dir = await folder.getDirectoryHandle(backups);
      } catch {
        return [];
      }
      const names: string[] = [];
      for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
      return names.sort();
    },
    { folderName, backups: FOLDER_BACKUPS }
  );
}

/** Given a backup in the folder is damaged — its file now holds bytes that are no folder copy */
export function corruptFolderBackup(page: Page, name: string, folderName: string = TEST_FOLDER_NAME): Promise<void> {
  return writeFolderFile(page, folderName, `${FOLDER_BACKUPS}/${name}`, [7, 7, 7, 7, 7, 7, 7, 7]);
}

/** Given my folder already holds these backups — files of the given names, as HemoIO names them */
export async function putFolderBackups(
  page: Page,
  names: string[],
  folderName: string = TEST_FOLDER_NAME
): Promise<void> {
  for (const name of names) await writeFolderFile(page, folderName, `${FOLDER_BACKUPS}/${name}`, 'an older backup');
}

/**
 * Hold this origin's folder-sync lock, as a sync running in another tab
 * would: syncs wait until the returned function releases it. Lets a test
 * change both the folder and this browser before the next sync looks.
 */
export async function holdFolderSyncs(page: Page): Promise<() => Promise<void>> {
  await page.evaluate(
    (lockName) =>
      new Promise<void>((held) => {
        void navigator.locks.request(
          lockName,
          () =>
            new Promise<void>((release) => {
              (window as unknown as { __e2eReleaseSync: () => void }).__e2eReleaseSync = release;
              held();
            })
        );
      }),
    FOLDER_SYNC_LOCK
  );
  return () => page.evaluate(() => (window as unknown as { __e2eReleaseSync: () => void }).__e2eReleaseSync());
}
