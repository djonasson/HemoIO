/**
 * Where the user chose to keep their data, as setup and Settings save it
 */

import { isFileSystemAccessSupported } from '@/utils/fileSystemSupport';

export const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';

/** Whether data is kept in a folder (only where the browser can open one) */
export function isFolderStorageOn(): boolean {
  return isFileSystemAccessSupported() && localStorage.getItem(STORAGE_PROVIDER_KEY) === 'filesystem';
}
