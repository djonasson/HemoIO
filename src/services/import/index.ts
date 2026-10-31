/**
 * Import Services
 *
 * Services for importing backup data.
 */

export {
  parseBackupJson,
  parseBackupData,
  readBackupFile,
  validateBackupFile,
  createIdMapping,
  updateTestValueReferences,
  updateNoteReferences,
  getImportPreview,
  type ImportMode,
  type JsonImportOptions,
  type ImportResult,
  type ParsedBackupData,
} from './jsonImport';

export {
  detectBackupType,
  detectBackupTypeFromFile,
  validateEncryptedBackupFile,
  parseEncryptedBackup,
  validateBackupPassword,
  getEncryptedImportPreview,
  type ParsedEncryptedBackupData,
} from './encryptedImport';

export { restoreBackup, type RestoreTarget, type RestoreSummary } from './restoreBackup';
export {
  describeBackupAISettings,
  restoreAISettings,
  type AISettingsTarget,
  type BackupAISettingsSummary,
} from './restoreAISettings';
export { afterRestoreAdvice, runAfterRestore, type AfterRestoreStep } from './afterRestore';
