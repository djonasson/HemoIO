/**
 * File System Storage Provider
 *
 * Implements the StorageProvider interface using the File System Access API.
 * Allows users to select a local folder (which can be synced via their preferred service)
 * to store their encrypted data.
 *
 * Browser support: Chrome/Edge 86+ only (Firefox and Safari not supported)
 */

import type { StorageProvider } from '@/types';

const DATA_FILE_NAME = 'hemoio-data.encrypted';
const HANDLE_STORAGE_KEY = 'hemoio_filesystem_handle';

/**
 * Permission state for directory access
 */
export type FileSystemPermissionState = 'granted' | 'prompt' | 'denied';

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
   * Save data to the selected directory
   */
  async save(data: ArrayBuffer): Promise<void> {
    const handle = await this.getDirectoryHandle();
    if (!handle) {
      throw new Error('No directory selected. Please select a folder first.');
    }

    // Verify we have permission
    const permission = await this.checkPermission(handle);
    if (permission !== 'granted') {
      throw new Error('Permission denied. Please grant folder access to continue.');
    }

    // Get or create the file
    const fileHandle = await handle.getFileHandle(DATA_FILE_NAME, { create: true });

    // Write the data
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(data);
    } finally {
      await writable.close();
    }
  }

  /**
   * Load data from the selected directory
   */
  async load(): Promise<ArrayBuffer> {
    const handle = await this.getDirectoryHandle();
    if (!handle) {
      throw new Error('No directory selected. Please select a folder first.');
    }

    // Verify we have permission
    const permission = await this.checkPermission(handle);
    if (permission !== 'granted') {
      throw new Error('Permission denied. Please grant folder access to continue.');
    }

    try {
      const fileHandle = await handle.getFileHandle(DATA_FILE_NAME);
      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        throw new Error('No backup data found');
      }
      throw error;
    }
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
      await handle.getFileHandle(DATA_FILE_NAME);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Show the directory picker and store the selected handle
   */
  async selectDirectory(): Promise<FileSystemDirectoryHandle | null> {
    try {
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });

      this.directoryHandle = handle;
      await this.persistHandle(handle);

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
    const db = await this.openIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('handles', 'readwrite');
      const store = transaction.objectStore('handles');
      const request = store.put(handle, HANDLE_STORAGE_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => db.close();
    });
  }

  /**
   * Load the directory handle from IndexedDB
   */
  private async loadHandle(): Promise<FileSystemDirectoryHandle | null> {
    try {
      const db = await this.openIndexedDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('handles', 'readonly');
        const store = transaction.objectStore('handles');
        const request = store.get(HANDLE_STORAGE_KEY);

        request.onsuccess = () => {
          resolve(request.result ?? null);
        };
        request.onerror = () => reject(request.error);

        transaction.oncomplete = () => db.close();
      });
    } catch {
      return null;
    }
  }

  /**
   * Delete the persisted handle from IndexedDB
   */
  private async deletePersistedHandle(): Promise<void> {
    try {
      const db = await this.openIndexedDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('handles', 'readwrite');
        const store = transaction.objectStore('handles');
        const request = store.delete(HANDLE_STORAGE_KEY);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);

        transaction.oncomplete = () => db.close();
      });
    } catch {
      // Ignore errors when deleting
    }
  }

  /**
   * Open IndexedDB for handle storage
   */
  private openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('HemoIO-FileSystemHandles', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles');
        }
      };
    });
  }
}
