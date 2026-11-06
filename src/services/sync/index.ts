/**
 * Sync Services
 *
 * Keeping the encrypted folder copy up to date without losing data in it,
 * and reading it back.
 */

export {
  FOLDER_SYNC_FILE_VERSION,
  digestFolderData,
  exportDigest,
  folderDataJson,
  markFolderCopySeen,
  sealFolderCopy,
  writeFolderCopy,
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
  keepFolderBackup,
  sealedForBackup,
  type FolderBackupStore,
} from './folderBackups';
export {
  assessFolderCopy,
  readFolderCopy,
  type FolderCopyProblem,
  type FolderCopySource,
  type FolderCopyAssessment,
  type FolderCopyReading,
} from './folderCopy';
