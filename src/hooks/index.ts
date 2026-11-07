/**
 * Custom React Hooks
 *
 * Re-exports all custom hooks for easy importing.
 */

export { useFolderStorageOn } from './useFolderStorageOn';
export { useDataReplacedElsewhere } from './useDataReplacedElsewhere';
export { useAfterRestore, type AfterRestore, type AfterRestoreRun } from './useAfterRestore';
export { useApplyFolderCopy, type ApplyFolderCopy } from './useApplyFolderCopy';
export { useEncryptedDb, type UseEncryptedDbResult } from './useEncryptedDb';
export { useLabResults, type UseLabResultsResult, type LabResultWithDetails, type LabResultFilters, type TestValueStatus, type EnrichedTestValue } from './useLabResults';
export { useAlerts, type UseAlertsResult, type BiomarkerAlert, type GroupedAlert, type AlertType } from './useAlerts';
export { useNotes, type UseNotesResult, type NoteFilters, type CreateNoteInput, type UpdateNoteInput } from './useNotes';
export { useExportData, type UseExportDataResult } from './useExportData';
export { useEncryptedApiKey, type UseEncryptedApiKeyResult } from './useEncryptedApiKey';
export { useFormKeyboardSubmit, type UseFormKeyboardSubmitOptions, type UseFormKeyboardSubmitResult } from './useFormKeyboardSubmit';
export {
  useFilesystemSync,
  triggerGlobalSync,
  setGlobalSyncCallback,
  type FolderConflict,
  type FolderConflictChoice,
  type FolderSyncIssue,
  type FolderReplaceChoice,
  type FolderReplaceResult,
  type UnreadableCopyTarget,
} from './useFilesystemSync';
export { useFolderSyncIssue, FolderSyncIssueContext, type FolderSyncIssueState } from './useFolderSyncIssue';
export { useFolderSyncNotice, type FolderSyncNoticeActions } from './useFolderSyncNotice';
export { useFolderSyncReplace, type UseFolderSyncReplaceResult } from './useFolderSyncReplace';
export { useAISettings, type UseAISettingsResult } from './useAISettings';
export { useAlertState, type AlertState } from './useAlertState';
export { usePreferences, type PreferencesState, type PersonalTargetRange } from './usePreferences';
export { useSaveImport } from './useSaveImport';
export {
  useFolderRestore,
  type UseFolderRestoreResult,
  type FolderRestorePrompt,
  type FolderRestoreDecision,
  type UnreadableCopyPrompt,
} from './useFolderRestore';
export { useSetAsideRecords, type UseSetAsideRecordsResult, type SealedDownload } from './useSetAsideRecords';
export { useExistingBrowserData, type UseExistingBrowserDataResult } from './useExistingBrowserData';
export { useNavigation, type UseNavigationResult, type AppView, type ViewFocus, type Destination } from './useNavigation';
