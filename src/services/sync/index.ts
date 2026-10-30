/**
 * Sync Services
 *
 * Keeping the encrypted folder copy up to date without losing data in it.
 */

export {
  FOLDER_SYNC_FILE_VERSION,
  writeFolderCopy,
  type FolderCopyStore,
  type FolderProtectionReason,
  type FolderSyncData,
  type FolderSyncFile,
  type FolderSyncOutcome,
} from './folderSync';
