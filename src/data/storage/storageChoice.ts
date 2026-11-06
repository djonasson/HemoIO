/**
 * Where the user chose to keep their data, as setup and Settings save it
 */

import { isFileSystemAccessSupported } from '@/utils/fileSystemSupport';
import { notifyFolderAccessChanged } from './folderAccessEvents';
import type { StorageProviderType } from '@/types';

export const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';

/** Whether data is kept in a folder (only where the browser can open one) */
export function isFolderStorageOn(): boolean {
  return isFileSystemAccessSupported() && localStorage.getItem(STORAGE_PROVIDER_KEY) === 'filesystem';
}

/**
 * Save where the data is kept, and tell folder sync and the folder banner,
 * which read the choice when told
 */
export function saveStorageChoice(provider: StorageProviderType): void {
  localStorage.setItem(STORAGE_PROVIDER_KEY, provider);
  notifyFolderAccessChanged();
}
