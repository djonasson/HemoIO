/**
 * Whether data is kept in a folder, kept current when Settings switches it
 */

import { useSyncExternalStore } from 'react';
import { onFolderAccessChanged } from '@data/storage/folderAccessEvents';
import { isFolderStorageOn } from '@data/storage/storageChoice';

export function useFolderStorageOn(): boolean {
  return useSyncExternalStore(onFolderAccessChanged, isFolderStorageOn);
}
