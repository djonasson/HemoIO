/**
 * Choosing a folder for folder storage, from wherever the app offers it:
 * the picker, then the folder sync and Settings are told to look at the
 * folder chosen.
 */

import { FileSystemStorageProvider } from './FileSystemStorageProvider';
import { notifyFolderAccessChanged } from './folderAccessEvents';

/**
 * Show the folder picker and keep the folder chosen, telling no one: for a
 * choice that is announced another way (switching storage on). Resolves its
 * name, or null when the picker was cancelled. Must be called straight from
 * a click, with nothing awaited before it: the picker needs the click's user
 * activation. Rejects when the folder cannot be chosen.
 */
export async function pickFolder(): Promise<string | null> {
  const handle = await new FileSystemStorageProvider().selectDirectory();
  return handle ? handle.name : null;
}

/**
 * Show the folder picker; resolves true once a folder is chosen, kept, and
 * the sync and Settings told; false when the picker was cancelled (nothing
 * changes then). Called as pickFolder is; rejects when the folder cannot be
 * chosen.
 */
export async function chooseFolder(): Promise<boolean> {
  if ((await pickFolder()) === null) return false;
  notifyFolderAccessChanged();
  return true;
}
