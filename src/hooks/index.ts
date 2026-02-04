/**
 * Custom React Hooks
 *
 * Re-exports all custom hooks for easy importing.
 */

export { useEncryptedDb, type UseEncryptedDbResult } from './useEncryptedDb';
export { useLabResults, type UseLabResultsResult, type LabResultWithDetails, type LabResultFilters, type TestValueStatus, type EnrichedTestValue } from './useLabResults';
export { useAlerts, type UseAlertsResult, type BiomarkerAlert, type GroupedAlert, type AlertType } from './useAlerts';
export { useNotes, type UseNotesResult, type NoteFilters, type CreateNoteInput, type UpdateNoteInput } from './useNotes';
export { useExportData, type UseExportDataResult } from './useExportData';
export { useEncryptedApiKey, type UseEncryptedApiKeyResult } from './useEncryptedApiKey';
export { useFormKeyboardSubmit, type UseFormKeyboardSubmitOptions, type UseFormKeyboardSubmitResult } from './useFormKeyboardSubmit';
export { useFilesystemSync, triggerGlobalSync, setGlobalSyncCallback } from './useFilesystemSync';
export { useAISettings, type UseAISettingsResult } from './useAISettings';
