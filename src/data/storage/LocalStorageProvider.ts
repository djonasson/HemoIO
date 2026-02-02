/**
 * Local Storage Provider
 *
 * Implements the StorageProvider interface using the browser's
 * IndexedDB (via Dexie) as the storage backend.
 *
 * Data is already encrypted by the EncryptedDb layer before
 * being stored, so this provider doesn't need to handle encryption.
 */

import type { StorageProvider } from '@/types';
import { db } from '@data/db';

const BACKUP_STORAGE_KEY = 'hemoio_backup';

/**
 * Local storage provider implementation
 *
 * For local storage, the actual data is stored in IndexedDB via Dexie.
 * The save/load methods here are for backup/export purposes, storing
 * a complete database snapshot as a single blob.
 */
export class LocalStorageProvider implements StorageProvider {
  /**
   * Save data to local storage
   * This is used for backup/export functionality
   */
  async save(data: ArrayBuffer): Promise<void> {
    // Convert ArrayBuffer to base64 for storage
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    try {
      localStorage.setItem(BACKUP_STORAGE_KEY, base64);
    } catch (error) {
      // localStorage might be full
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new Error('Storage quota exceeded. Please free up space or use cloud storage.');
      }
      throw error;
    }
  }

  /**
   * Load data from local storage
   * This is used for restore/import functionality
   */
  async load(): Promise<ArrayBuffer> {
    const base64 = localStorage.getItem(BACKUP_STORAGE_KEY);
    if (!base64) {
      throw new Error('No backup data found');
    }

    // Convert base64 back to ArrayBuffer
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
  }

  /**
   * Check if backup data exists
   */
  async exists(): Promise<boolean> {
    return localStorage.getItem(BACKUP_STORAGE_KEY) !== null;
  }

  /**
   * Delete backup data
   */
  async delete(): Promise<void> {
    localStorage.removeItem(BACKUP_STORAGE_KEY);
  }

  /**
   * Get storage usage information
   */
  async getStorageInfo(): Promise<{
    used: number;
    available: number;
    quota: number;
  }> {
    // Try to use Storage API if available
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage ?? 0,
        available: (estimate.quota ?? 0) - (estimate.usage ?? 0),
        quota: estimate.quota ?? 0,
      };
    }

    // Fallback: estimate based on IndexedDB
    // This is a rough estimate
    return {
      used: 0,
      available: 0,
      quota: 0,
    };
  }

  /**
   * Check if the database has any data
   */
  async hasData(): Promise<boolean> {
    const labResultCount = await db.labResults.count();
    return labResultCount > 0;
  }

  /**
   * Get the count of stored lab results
   */
  async getLabResultCount(): Promise<number> {
    return db.labResults.count();
  }

  /**
   * Get the count of stored test values
   */
  async getTestValueCount(): Promise<number> {
    return db.testValues.count();
  }
}
