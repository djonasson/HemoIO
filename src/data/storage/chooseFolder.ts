/**
 * Choosing a folder for folder storage, from wherever the app offers it:
 * the picker, then the folder sync and Settings are told to look at the
 * folder chosen.
 */

import { FileSystemStorageProvider } from './FileSystemStorageProvider';
import { notifyFolderAccessChanged } from './folderAccessEvents';
import { isFolderStorageOn } from './storageChoice';

/**
 * How choosing ended: a folder chosen and kept, the picker cancelled
 * (nothing changes), or folder storage switched off meanwhile, so there was
 * no folder to choose and no picker was shown
 */
export type FolderChoice = 'chosen' | 'cancelled' | 'off';

/**
 * Show the folder picker and keep the folder chosen. Must be called straight
 * from a click, with nothing awaited before it: the picker needs the click's
 * user activation. Rejects when the folder cannot be chosen.
 *
 * For folder storage that is on: 'off' once it was switched off, and the
 * folder chosen is announced (notifyFolderAccessChanged). `switchingOn`: the
 * choice that turns folder storage on, which announces itself (saving the
 * storage choice): neither checked nor announced here.
 */
export async function chooseFolder({ switchingOn = false }: { switchingOn?: boolean } = {}): Promise<FolderChoice> {
  if (!switchingOn && !isFolderStorageOn()) return 'off';
  if (!(await new FileSystemStorageProvider().selectDirectory())) return 'cancelled';
  if (!switchingOn) notifyFolderAccessChanged();
  return 'chosen';
}
