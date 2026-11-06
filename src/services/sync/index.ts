/**
 * Sync Services
 *
 * Keeping the encrypted folder copy up to date without losing data in it,
 * and reading it back.
 */

export {
  FOLDER_SYNC_FILE_VERSION,
  digestFolderData,
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
  protectFolderBackup,
  sealedForBackup,
  type FolderBackupKind,
  type FolderBackupStore,
  type KeepFolderBackupOptions,
} from './folderBackups';
export { canKeepFolderCopy, keepBrowserData, keepCurrentFolderCopy, keepFolderCopy } from './folderConflict';
export {
  assessFolderCopy,
  readFolderCopy,
  unlockFolderCopy,
  type FolderCopyOrigin,
  type FolderCopyProblem,
  type FolderRecoverySource,
  type FolderUnlockProblem,
  type FolderUnlockResult,
  type FolderCopySource,
  type FolderCopyAssessment,
  type FolderCopyReading,
} from './folderCopy';
