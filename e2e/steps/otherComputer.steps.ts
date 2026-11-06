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
import { FOLDER_COPY, TEST_FOLDER_NAME } from './folderSync.steps';

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
  folderName: string = TEST_FOLDER_NAME
): Promise<void> {
  const body = {
    labResults: data.labResults ?? SEED_LAB_RESULTS,
    testValues: data.testValues ?? SEED_TEST_VALUES,
    userNotes: data.userNotes ?? [],
    ...(data.userPreferences ? { preferences: data.userPreferences } : {}),
  };
  await page.evaluate(
    async ({ source, body, folderName, fileName }) => {
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
        const stored = JSON.parse(localStorage.getItem('hemoio_credentials') ?? 'null') as Lock;
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
    { source, body, folderName, fileName: FOLDER_COPY }
  );
}

/**
 * Given I changed my password on another computer that syncs to the same
 * folder — or only saved there, with `newPassword` left out
 */
export function saveCopyAsAnotherComputer(page: Page, options: OtherComputerCopy): Promise<void> {
  const { password, data, newPassword, changedAt, folderName } = options;
  return writeEnvelopeCopy(
    page,
    { kind: 'this-setup', password, newPassword, changedAt },
    data,
    folderName
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
export function readFolderCopyText(page: Page, folderName: string = TEST_FOLDER_NAME): Promise<string> {
  return page.evaluate(
    async ({ folderName, fileName }) => {
      const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName);
      return (await (await folder.getFileHandle(fileName)).getFile()).text();
    },
    { folderName, fileName: FOLDER_COPY }
  );
}

/** The changedAt of this browser's stored lock */
export function storedLockChangedAt(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () => (JSON.parse(localStorage.getItem('hemoio_credentials') ?? '{}') as { changedAt?: string }).changedAt
  );
}
