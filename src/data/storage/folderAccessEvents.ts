/**
 * Folder access changes: access granted again after the browser was
 * reopened, or another folder chosen. Settings and folder sync live in
 * different parts of the app; this tells sync to look at the folder again.
 */

import { createWindowEvent } from '@/utils/createWindowEvent';

const folderAccessChanged = createWindowEvent('hemoio:folder-access-changed');

export function notifyFolderAccessChanged(): void {
  folderAccessChanged.notify();
}

/** Listen for folder access changes; returns the function that stops listening */
export function onFolderAccessChanged(listener: () => void): () => void {
  return folderAccessChanged.on(() => listener());
}

const folderBackupsChanged = createWindowEvent('hemoio:folder-backups-changed');

/** A dated backup was saved to the folder, or deleted from it */
export function notifyFolderBackupsChanged(): void {
  folderBackupsChanged.notify();
}

/** Listen for changes to the folder's dated backups; returns the function that stops listening */
export function onFolderBackupsChanged(listener: () => void): () => void {
  return folderBackupsChanged.on(() => listener());
}
