/**
 * BackupRestore Component
 *
 * Settings section for backing up and restoring data.
 */

import { useState, useRef, useCallback } from 'react';
import {
  Stack,
  Paper,
  Title,
  Text,
  Button,
  Group,
  Alert,
  Modal,
  FileInput,
  Divider,
} from '@mantine/core';
import {
  IconDownload,
  IconAlertCircle,
  IconCheck,
  IconFileZip,
} from '@tabler/icons-react';
import {
  exportToJson,
  generateBackupFilename,
  downloadJson,
  getBackupStats,
  type ExportDataSources,
} from '@services/export';
import {
  parseBackupJson,
  readBackupFile,
  validateBackupFile,
  getImportPreview,
  type ParsedBackupData,
} from '@services/import';

/**
 * Props for BackupRestore component
 */
export interface BackupRestoreProps {
  /** Data sources for backup */
  dataSources: ExportDataSources;
  /** Called when restore is initiated */
  onRestore: (data: ParsedBackupData) => Promise<void>;
  /** Whether backup/restore is currently in progress */
  isProcessing?: boolean;
}

/**
 * BackupRestore component for the settings page
 */
export function BackupRestore({
  dataSources,
  onRestore,
  isProcessing = false,
}: BackupRestoreProps): React.ReactNode {
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedBackupData | null>(null);
  const fileInputRef = useRef<HTMLButtonElement>(null);

  // Get backup stats
  const backupStats = getBackupStats(dataSources);
  const hasData =
    backupStats.labResultCount > 0 ||
    backupStats.testValueCount > 0 ||
    backupStats.noteCount > 0;

  // Handle create backup
  const handleCreateBackup = useCallback(async () => {
    setIsCreatingBackup(true);
    setError(null);
    setSuccess(null);

    try {
      const json = exportToJson(dataSources, { prettyPrint: true });
      const filename = generateBackupFilename();
      downloadJson(json, filename);
      setSuccess('Backup created successfully');
    } catch (err) {
      setError('Failed to create backup');
      console.error('Backup failed:', err);
    } finally {
      setIsCreatingBackup(false);
    }
  }, [dataSources]);

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File | null) => {
    setError(null);
    setSuccess(null);
    setSelectedFile(file);
    setParsedData(null);

    if (!file) {
      return;
    }

    // Validate file
    const validation = validateBackupFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    try {
      // Read and parse file
      const content = await readBackupFile(file);
      const parsed = parseBackupJson(content);
      setParsedData(parsed);
      setRestoreConfirmOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read backup file');
    }
  }, []);

  // Handle restore confirmation
  const handleConfirmRestore = useCallback(async () => {
    if (!parsedData) return;

    setIsRestoring(true);
    setError(null);
    setRestoreConfirmOpen(false);

    try {
      await onRestore(parsedData);
      setSuccess('Data restored successfully');
      setSelectedFile(null);
      setParsedData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore data');
    } finally {
      setIsRestoring(false);
    }
  }, [parsedData, onRestore]);

  // Handle cancel restore
  const handleCancelRestore = useCallback(() => {
    setRestoreConfirmOpen(false);
    setSelectedFile(null);
    setParsedData(null);
  }, []);

  // Get import preview
  const importPreview = parsedData ? getImportPreview(parsedData) : null;

  const processing = isProcessing || isCreatingBackup || isRestoring;

  return (
    <>
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Title order={4}>Backup & Restore</Title>

          <Text size="sm" c="dimmed">
            Create a backup of all your data or restore from a previous backup.
            Backups include lab results, test values, notes, and settings.
          </Text>

          {error && (
            <Alert color="red" icon={<IconAlertCircle size={16} />} onClose={() => setError(null)} withCloseButton>
              {error}
            </Alert>
          )}

          {success && (
            <Alert color="green" icon={<IconCheck size={16} />} onClose={() => setSuccess(null)} withCloseButton>
              {success}
            </Alert>
          )}

          <Divider />

          {/* Create Backup Section */}
          <Stack gap="sm">
            <Text fw={500}>Create Backup</Text>
            <Text size="sm" c="dimmed">
              Download a copy of all your data as a JSON file.
              {hasData && (
                <>
                  {' '}Your backup will include {backupStats.labResultCount} lab result
                  {backupStats.labResultCount !== 1 ? 's' : ''},{' '}
                  {backupStats.testValueCount} test value
                  {backupStats.testValueCount !== 1 ? 's' : ''}, and{' '}
                  {backupStats.noteCount} note
                  {backupStats.noteCount !== 1 ? 's' : ''}.
                </>
              )}
            </Text>

            {!hasData && (
              <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                You don't have any data to backup yet. Import some lab results first.
              </Alert>
            )}

            <Button
              leftSection={<IconDownload size={16} />}
              onClick={handleCreateBackup}
              loading={isCreatingBackup}
              disabled={!hasData || processing}
            >
              Create Backup
            </Button>
          </Stack>

          <Divider />

          {/* Restore Section */}
          <Stack gap="sm">
            <Text fw={500}>Restore from Backup</Text>
            <Text size="sm" c="dimmed">
              Upload a backup file to restore your data. This will replace all
              existing data with the data from the backup.
            </Text>

            <FileInput
              ref={fileInputRef}
              value={selectedFile}
              onChange={handleFileSelect}
              accept=".json"
              placeholder="Select backup file"
              leftSection={<IconFileZip size={16} />}
              clearable
              disabled={processing}
              aria-label="Select backup file to restore"
            />
          </Stack>
        </Stack>
      </Paper>

      {/* Restore Confirmation Modal */}
      <Modal
        opened={restoreConfirmOpen}
        onClose={handleCancelRestore}
        title="Restore from Backup"
        centered
      >
        <Stack gap="md">
          <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
            This will replace all your current data with the data from the backup.
            This action cannot be undone.
          </Alert>

          {importPreview && (
            <Paper p="sm" withBorder>
              <Stack gap="xs">
                <Text size="sm" fw={500}>Backup Contents</Text>
                <Text size="sm" c="dimmed">
                  Created: {importPreview.exportedAt.toLocaleDateString()}
                </Text>
                <Text size="sm" c="dimmed">
                  {importPreview.labResultCount} lab result
                  {importPreview.labResultCount !== 1 ? 's' : ''},{' '}
                  {importPreview.testValueCount} test value
                  {importPreview.testValueCount !== 1 ? 's' : ''},{' '}
                  {importPreview.noteCount} note
                  {importPreview.noteCount !== 1 ? 's' : ''}
                </Text>
              </Stack>
            </Paper>
          )}

          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={handleCancelRestore}>
              Cancel
            </Button>
            <Button color="red" onClick={handleConfirmRestore} loading={isRestoring}>
              Restore
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
