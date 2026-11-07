/**
 * File System Storage Provider
 *
 * Implements the StorageProvider interface using the File System Access API.
 * Allows users to select a local folder (which can be synced via their preferred service)
 * to store their encrypted data.
 *
 * Browser support: Chrome/Edge 86+ only (Firefox and Safari not supported)
 */

import { notifyFolderBackupsChanged } from './folderAccessEvents';
import type { StorageProvider } from '@/types';

/**
 * The folder copy: the JSON sync file (`{ version, exportedAt, revision,
 * ancestors, data }`, see `services/sync/folderSync.ts`), sealed in the
 * envelope beside the password lock (`services/sync/folderEnvelope.ts`)
 */
export const FOLDER_DATA_FILE_NAME = 'hemoio-data.encrypted';

/**
 * An earlier folder copy, to undo a bad write from: the content of a copy a
 * write replaced, sealed again in the same envelope but without the lock
 * (only the current copy carries it). The sync decides which replaced copy
 * is kept here (never one holding less than half of the copy already here,
 * see `services/sync/folderSync.ts`). Only one is kept, so a synced folder
 * does not fill up with copies of health data.
 */
export const FOLDER_PREVIOUS_FILE_NAME = 'hemoio-data.previous.encrypted';

/**
 * The current password lock, beside the copy, as plain JSON (see
 * `services/sync/folderLockFile.ts`): rewritten whenever the copy's lock is,
 * so recovery can unwrap the data key when the copy itself is gone or damaged
 */
export const FOLDER_LOCK_FILE_NAME = 'hemoio-lock.json';

/**
 * The folder's dated backups, in a folder of their own beside the copy: the
 * side of a conflict the user did not choose, and this computer's data kept
 * before a newer copy was loaded, sealed like the copy but without the lock
 * (see `services/sync/folderBackups.ts`)
 */
export const FOLDER_BACKUPS_DIR_NAME = 'hemoio-backups';

const HANDLE_STORAGE_KEY = 'hemoio_filesystem_handle';

/** The database that keeps the chosen folder's handle; the folder itself is elsewhere */
const HANDLE_DATABASE_NAME = 'HemoIO-FileSystemHandles';
const HANDLE_STORE_NAME = 'handles';

function openHandleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DATABASE_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        db.createObjectStore(HANDLE_STORE_NAME);
      }
    };
  });
}

/**
 * One request on the handle store, in a transaction of its own: resolves
 * with the request's result once the transaction is done, rejects when it
 * fails. The database is closed either way.
 */
export async function inHandleStore<T>(
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openHandleDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(HANDLE_STORE_NAME, mode);
      const pending = request(transaction.objectStore(HANDLE_STORE_NAME));
      transaction.oncomplete = () => resolve(pending.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Forgets which folder was chosen: empties the handle store. The folder and
 * its files are not touched. Rejects when the store cannot be emptied.
 */
export async function clearFolderHandleStore(): Promise<void> {
  await inHandleStore('readwrite', (store) => store.clear());
}

/**
 * Permission state for directory access
 */
export type FileSystemPermissionState = 'granted' | 'prompt' | 'denied';

declare const FOLDER_TOKEN: unique symbol;

/**
 * Names a folder without handing it out: the UI holds the token, and only
 * the provider can tell which folder it names (folderIdentity, isCurrentFolder)
 */
export interface FolderToken {
  readonly [FOLDER_TOKEN]: true;
}

const TOKEN_FOLDERS = new WeakMap<FolderToken, FileSystemDirectoryHandle>();

/**
 * File System Storage Provider
 *
 * Uses the File System Access API to store encrypted data in a user-selected
 * local directory. The directory handle is persisted to IndexedDB for
 * re-requesting access on subsequent visits.
 */
export class FileSystemStorageProvider implements StorageProvider {
  private directoryHandle: FileSystemDirectoryHandle | null = null;

  /**
   * Save data to the selected directory. Given `previous`, those bytes are
   * written as FOLDER_PREVIOUS_FILE_NAME first; if that fails, nothing is replaced.
   */
  async save(data: ArrayBuffer, previous?: ArrayBuffer): Promise<void> {
    const handle = await this.getGrantedHandle();
    if (previous) {
      await this.writeFile(handle, FOLDER_PREVIOUS_FILE_NAME, previous);
    }
    await this.writeFile(handle, FOLDER_DATA_FILE_NAME, data);
  }

  /**
   * The folder copy's bytes, or null when the folder holds none. Any other
   * failure (no folder, no permission, an unreadable file) throws, so it is
   * never mistaken for a folder without data.
   */
  async loadCurrent(): Promise<ArrayBuffer | null> {
    return this.readFile(await this.getGrantedHandle(), FOLDER_DATA_FILE_NAME);
  }

  /** The previous copy's bytes, or null when the folder holds none */
  async loadPrevious(): Promise<ArrayBuffer | null> {
    return this.readFile(await this.getGrantedHandle(), FOLDER_PREVIOUS_FILE_NAME);
  }

  /** The lock file's bytes, or null when the folder holds none */
  async loadLock(): Promise<ArrayBuffer | null> {
    return this.readFile(await this.getGrantedHandle(), FOLDER_LOCK_FILE_NAME);
  }

  /** Write the lock file */
  async saveLock(bytes: ArrayBuffer): Promise<void> {
    await this.writeFile(await this.getGrantedHandle(), FOLDER_LOCK_FILE_NAME, bytes);
  }

  /**
   * The names of the files in the backups folder; none when there is no such
   * folder. An empty file, or one that cannot be read, is left out: there is
   * nothing in it to restore, and it must not count as one of the backups
   * kept when the oldest are pruned.
   */
  async listBackups(): Promise<string[]> {
    const backups = await this.getBackupsHandle(false);
    if (!backups) return [];
    const files: FileSystemFileHandle[] = [];
    for await (const [, entry] of backups.entries()) {
      if (entry.kind === 'file') files.push(entry as FileSystemFileHandle);
    }
    // Only the sizes: no file's content is read
    const sizes = await Promise.all(files.map((file) => file.getFile().then((f) => f.size, () => 0)));
    return files.filter((_, i) => sizes[i] > 0).map((file) => file.name);
  }

  /** Write a backup into the backups folder, made when missing */
  async saveBackup(name: string, bytes: ArrayBuffer): Promise<void> {
    const backups = await this.getBackupsHandle(true);
    await this.writeFile(backups!, name, bytes);
    notifyFolderBackupsChanged();
  }

  /** A backup's bytes; throws when there is no such backup */
  async loadBackup(name: string): Promise<ArrayBuffer> {
    const backups = await this.getBackupsHandle(false);
    const bytes = backups && (await this.readFile(backups, name));
    if (!bytes) throw new Error('No such backup');
    return bytes;
  }

  async deleteBackup(name: string): Promise<void> {
    const backups = await this.getBackupsHandle(false);
    if (!backups) return;
    await backups.removeEntry(name);
    notifyFolderBackupsChanged();
  }

  /** The backups folder; null when it is missing and not to be made */
  private async getBackupsHandle(create: boolean): Promise<FileSystemDirectoryHandle | null> {
    const handle = await this.getGrantedHandle();
    try {
      return await handle.getDirectoryHandle(FOLDER_BACKUPS_DIR_NAME, { create });
    } catch (error) {
      if (!create && error instanceof DOMException && error.name === 'NotFoundError') return null;
      throw error;
    }
  }

  /**
   * Load data from the selected directory
   */
  async load(): Promise<ArrayBuffer> {
    const data = await this.loadCurrent();
    if (!data) {
      throw new Error('No backup data found');
    }
    return data;
  }

  /**
   * Check if the data file exists in the selected directory
   */
  async exists(): Promise<boolean> {
    const handle = await this.getDirectoryHandle();
    if (!handle) {
      return false;
    }

    // Check permission first
    const permission = await this.checkPermission(handle);
    if (permission !== 'granted') {
      return false;
    }

    try {
      await handle.getFileHandle(FOLDER_DATA_FILE_NAME);
      return true;
    } catch {
      return false;
    }
  }

  /** The selected directory, once it may be read and written */
  private async getGrantedHandle(): Promise<FileSystemDirectoryHandle> {
    const handle = await this.getDirectoryHandle();
    if (!handle) {
      throw new Error('No directory selected. Please select a folder first.');
    }
    if ((await this.checkPermission(handle)) !== 'granted') {
      throw new Error('Permission denied. Please grant folder access to continue.');
    }
    return handle;
  }

  /**
   * A file's bytes, or null when the directory does not hold it or the file is
   * empty, as an interrupted first write can leave it: there is nothing in it
   * to restore or to protect
   */
  private async readFile(
    handle: FileSystemDirectoryHandle,
    name: string
  ): Promise<ArrayBuffer | null> {
    try {
      const file = await (await handle.getFileHandle(name)).getFile();
      const bytes = await file.arrayBuffer();
      return bytes.byteLength === 0 ? null : bytes;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        // The same error for a folder that is gone (moved, an unmounted drive):
        // only a folder that can be listed has no file
        await handle.keys().next();
        return null;
      }
      throw error;
    }
  }

  /**
   * The browser writes to a temporary file and swaps it in on close, so a
   * failed write leaves the file as it was. A file the write created is
   * removed again: it would be left empty.
   */
  private async writeFile(
    handle: FileSystemDirectoryHandle,
    name: string,
    data: ArrayBuffer
  ): Promise<void> {
    const existed = await handle.getFileHandle(name).then(
      () => true,
      () => false
    );
    const fileHandle = await handle.getFileHandle(name, { create: true });
    try {
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(data);
        await writable.close();
      } catch (error) {
        // Abort can fail on a stream already closing; the write's error is the one to report
        await writable.abort().catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if (!existed) await handle.removeEntry(name).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Show the directory picker and store the selected handle. With
   * `persist: false` it is kept in this provider only, until
   * persistDirectory: so a choice that is not taken up changes nothing.
   */
  async selectDirectory({ persist = true }: { persist?: boolean } = {}): Promise<FileSystemDirectoryHandle | null> {
    try {
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });

      this.directoryHandle = handle;
      if (persist) await this.persistHandle(handle);

      return handle;
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'AbortError') {
          // User cancelled - not an error
          return null;
        }
        if (error.name === 'NotAllowedError') {
          throw new Error('Please grant folder access to continue.');
        }
      }
      throw error;
    }
  }

  /** Store the directory chosen with `persist: false`, as the one HemoIO uses */
  async persistDirectory(): Promise<void> {
    if (!this.directoryHandle) {
      throw new Error('No directory selected. Please select a folder first.');
    }
    await this.persistHandle(this.directoryHandle);
  }

  /**
   * Check if we have a stored directory handle
   */
  async hasStoredHandle(): Promise<boolean> {
    const handle = await this.loadHandle();
    return handle !== null;
  }

  /**
   * Get the current permission state for the stored directory
   */
  async getPermissionState(): Promise<FileSystemPermissionState | null> {
    const handle = await this.getDirectoryHandle();
    if (!handle) {
      return null;
    }
    return this.checkPermission(handle);
  }

  /**
   * Request permission to access the stored directory
   * This must be called in response to a user gesture (click, etc.)
   */
  async requestPermission(): Promise<FileSystemPermissionState> {
    const handle = await this.getDirectoryHandle();
    if (!handle) {
      throw new Error('No directory selected. Please select a folder first.');
    }

    const result = await handle.requestPermission({ mode: 'readwrite' });
    return result as FileSystemPermissionState;
  }

  /**
   * Get the name of the selected directory (for display in UI)
   */
  async getDirectoryName(): Promise<string | null> {
    const handle = await this.getDirectoryHandle();
    return handle?.name ?? null;
  }

  /**
   * The folder this provider reads and writes, by name and by a token that
   * tells later whether it is still the one chosen (isCurrentFolder). Kept
   * since the provider first used it, so it is the folder a file was just
   * read from, even if another was chosen meanwhile. Null when none is chosen.
   */
  async folderIdentity(): Promise<{ token: FolderToken; name: string } | null> {
    const handle = await this.getDirectoryHandle();
    if (!handle) return null;
    const token = Object.freeze({}) as FolderToken;
    TOKEN_FOLDERS.set(token, handle);
    return { token, name: handle.name };
  }

  /**
   * Whether the folder `token` names is the directory chosen now: so a
   * choice made about a file in one folder is never carried out in another
   * chosen meanwhile (in this tab or another). False when no folder is chosen.
   */
  async isCurrentFolder(token: FolderToken | null): Promise<boolean> {
    const folder = token && TOKEN_FOLDERS.get(token);
    const handle = await this.getDirectoryHandle();
    if (!handle || !folder) return false;
    return handle.isSameEntry(folder);
  }

  /**
   * Clear the stored directory handle
   */
  async clearStoredHandle(): Promise<void> {
    this.directoryHandle = null;
    await this.deletePersistedHandle();
  }

  /**
   * Get the directory handle (from memory cache or storage)
   */
  private async getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (this.directoryHandle) {
      return this.directoryHandle;
    }

    const handle = await this.loadHandle();
    if (handle) {
      this.directoryHandle = handle;
    }
    return handle;
  }

  /**
   * Check permission status for a directory handle
   */
  private async checkPermission(
    handle: FileSystemDirectoryHandle
  ): Promise<FileSystemPermissionState> {
    const result = await handle.queryPermission({ mode: 'readwrite' });
    return result as FileSystemPermissionState;
  }

  /**
   * Persist the directory handle to IndexedDB
   */
  private async persistHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    await inHandleStore('readwrite', (store) => store.put(handle, HANDLE_STORAGE_KEY));
  }

  /**
   * Load the directory handle from IndexedDB
   */
  private async loadHandle(): Promise<FileSystemDirectoryHandle | null> {
    try {
      const handle = await inHandleStore<FileSystemDirectoryHandle | undefined>('readonly', (store) =>
        store.get(HANDLE_STORAGE_KEY)
      );
      return handle ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Delete the persisted handle from IndexedDB
   */
  private async deletePersistedHandle(): Promise<void> {
    try {
      await inHandleStore('readwrite', (store) => store.delete(HANDLE_STORAGE_KEY));
    } catch {
      // Ignore errors when deleting
    }
  }
}
