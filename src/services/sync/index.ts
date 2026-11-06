/**
 * Sync Services
 *
 * Keeping the encrypted folder copy up to date without losing data in it,
 * and reading it back.
 */

export {
  FOLDER_SYNC_FILE_VERSION,
  writeFolderCopy,
  type FolderCopyStore,
  type FolderProtectionReason,
  type FolderSyncOutcome,
  type FolderWriteContext,
} from './folderSync';
export {
  assessFolderCopy,
  readFolderCopy,
  type FolderCopyProblem,
  type FolderCopySource,
  type FolderCopyAssessment,
  type FolderCopyReading,
} from './folderCopy';
