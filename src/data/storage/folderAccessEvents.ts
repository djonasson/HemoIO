/**
 * Folder access changes: access granted again after the browser was
 * reopened, or another folder chosen. Settings and folder sync live in
 * different parts of the app; this tells sync to look at the folder again.
 */

const FOLDER_ACCESS_CHANGED = 'hemoio:folder-access-changed';

export function notifyFolderAccessChanged(): void {
  window.dispatchEvent(new Event(FOLDER_ACCESS_CHANGED));
}

/** Listen for folder access changes; returns the function that stops listening */
export function onFolderAccessChanged(listener: () => void): () => void {
  window.addEventListener(FOLDER_ACCESS_CHANGED, listener);
  return () => window.removeEventListener(FOLDER_ACCESS_CHANGED, listener);
}

const FOLDER_BACKUPS_CHANGED = 'hemoio:folder-backups-changed';

/** A dated backup was saved to the folder, or deleted from it */
export function notifyFolderBackupsChanged(): void {
  window.dispatchEvent(new Event(FOLDER_BACKUPS_CHANGED));
}

/** Listen for changes to the folder's dated backups; returns the function that stops listening */
export function onFolderBackupsChanged(listener: () => void): () => void {
  window.addEventListener(FOLDER_BACKUPS_CHANGED, listener);
  return () => window.removeEventListener(FOLDER_BACKUPS_CHANGED, listener);
}
