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
