/**
 * Choosing another folder for folder storage, from wherever the app offers
 * it: the picker, then the folder sync and Settings are told to look at the
 * folder chosen.
 */

import { FileSystemStorageProvider } from './FileSystemStorageProvider';
import { notifyFolderAccessChanged } from './folderAccessEvents';

/**
 * Show the folder picker; resolves true once a folder is chosen and kept,
 * false when the picker was cancelled (nothing changes then). Must be called
 * straight from a click, with nothing awaited before it: the picker needs
 * the click's user activation. Rejects when the folder cannot be chosen.
 */
export async function chooseFolder(): Promise<boolean> {
  const handle = await new FileSystemStorageProvider().selectDirectory();
  if (!handle) return false;
  notifyFolderAccessChanged();
  return true;
}
