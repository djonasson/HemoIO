/**
 * File System Access API feature detection
 *
 * The File System Access API allows web apps to read and write files
 * to the user's local file system. This is useful for storing encrypted
 * data in a user-selected folder (which can be synced via their preferred service).
 *
 * Browser support:
 * - Chrome/Edge 86+: Full support
 * - Firefox: Not supported
 * - Safari: Not supported
 */

/**
 * Check if the File System Access API is supported in the current browser.
 * This specifically checks for directory picker support which is needed
 * for selecting a folder to store data.
 */
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    typeof window.showDirectoryPicker === 'function'
  );
}
