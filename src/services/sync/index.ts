/**
 * Sync Services
 *
 * Keeping the encrypted folder copy up to date without losing data in it,
 * and reading it back.
 */

export {
  FOLDER_SYNC_FILE_VERSION,
  MAX_FOLDER_ANCESTORS,
  digestFolderData,
  exportDigest,
  folderCopyId,
  folderDataJson,
  markFolderCopySeen,
  sealFolderCopy,
  writeFolderCopy,
  type ChangedElsewhereReason,
  type FolderCopyStore,
  type FolderProtectionReason,
  type FolderSide,
  type FolderSyncOutcome,
  type FolderWriteContext,
} from './folderSync';
export {
  MAX_FOLDER_BACKUPS,
  backupDate,
  backupFileName,
  backupKind,
  keepFolderBackup,
  sealedForBackup,
  type FolderBackupKind,
  type FolderBackupStore,
  type KeepFolderBackupOptions,
} from './folderBackups';
export { keepBrowserData, keepCurrentFolderCopy, keepFolderCopy } from './folderConflict';
export {
  assessFolderCopy,
  readFolderCopy,
  type FolderCopyProblem,
  type FolderCopySource,
  type FolderCopyAssessment,
  type FolderCopyReading,
} from './folderCopy';
