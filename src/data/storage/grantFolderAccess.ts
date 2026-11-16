/**
 * Asking the browser for access to the chosen folder again, as browsers
 * ask after they were reopened
 */

import { currentFolder } from './StorageProviderFactory';
import { notifyFolderAccessChanged } from './folderAccessEvents';
import type { FileSystemPermissionState } from './FileSystemStorageProvider';

/**
 * Asks for access to the chosen folder: call straight from a click, as the
 * browser asks only then. Once given, every tab is told, so the restore
 * question and the folder notices look at the folder again.
 */
export async function grantFolderAccess(): Promise<FileSystemPermissionState> {
  const state = await currentFolder().requestPermission();
  if (state === 'granted') notifyFolderAccessChanged();
  return state;
}
