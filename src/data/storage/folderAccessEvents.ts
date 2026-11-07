/**
 * Folder access changes: access granted again after the browser was
 * reopened, another folder chosen, or folder storage switched on or off.
 * Settings and folder sync live in different parts of the app; this tells
 * sync to look at the folder again. Other tabs of this browser share the
 * folder choice, so they are told too: a question one of them asks about
 * the folder it had in view is dropped once another folder is chosen.
 */

import { createTabsEvent } from '@/utils/createTabsEvent';

export const FOLDER_CHANNEL_NAME = 'hemoio-folder';
export const FOLDER_BACKUPS_CHANNEL_NAME = 'hemoio-folder-backups';

const folderAccessChanged = createTabsEvent('hemoio:folder-access-changed', FOLDER_CHANNEL_NAME);

export function notifyFolderAccessChanged(): void {
  folderAccessChanged.notify();
}

/** Listen for folder access changes, in this tab or another; returns the function that stops listening */
export function onFolderAccessChanged(listener: () => void): () => void {
  return folderAccessChanged.on(listener);
}

const folderBackupsChanged = createTabsEvent('hemoio:folder-backups-changed', FOLDER_BACKUPS_CHANNEL_NAME);

/** A dated backup was saved to the folder, or deleted from it */
export function notifyFolderBackupsChanged(): void {
  folderBackupsChanged.notify();
}

/** Listen for changes to the folder's dated backups, in this tab or another; returns the function that stops listening */
export function onFolderBackupsChanged(listener: () => void): () => void {
  return folderBackupsChanged.on(listener);
}
