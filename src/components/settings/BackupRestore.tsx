/**
 * BackupRestore Component
 *
 * Settings section for backing up and restoring data.
 * Supports both standard (plaintext) and encrypted backups.
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
  SegmentedControl,
  PasswordInput,
  Badge,
} from '@mantine/core';
import {
  IconDownload,
  IconAlertCircle,
  IconCheck,
  IconFileZip,
  IconLock,
  IconLockOpen,
  IconKey,
} from '@tabler/icons-react';
import {
  exportToJson,
  generateBackupFilename,
  downloadJson,
  getBackupStats,
  exportToEncryptedJson,
  generateEncryptedBackupFilename,
  downloadEncryptedBackup,
  type ExportDataSources,
} from '@services/export';
import {
  parseBackupJson,
  readBackupFile,
  validateBackupFile,
  getImportPreview,
  detectBackupType,
  validateEncryptedBackupFile,
  parseEncryptedBackup,
  getEncryptedImportPreview,
  type ParsedBackupData,
  type ParsedEncryptedBackupData,
} from '@services/import';
import type { BackupType } from '@/types/backup';
import { BackupPasswordInput } from './BackupPasswordInput';

/**
 * Props for BackupRestore component
 */
export interface BackupRestoreProps {
  /** Data sources for backup */
  dataSources: ExportDataSources;
  /** Called when restore is initiated */
  onRestore: (data: ParsedBackupData | ParsedEncryptedBackupData) => Promise<void>;
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
  // Backup state
  const [backupType, setBackupType] = useState<BackupType>('standard');
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportPasswordConfirm, setExportPasswordConfirm] = useState('');
  const [isExportPasswordValid, setIsExportPasswordValid] = useState(false);
  const [showExportPasswordModal, setShowExportPasswordModal] = useState(false);

  // Restore state
  const [isRestoring, setIsRestoring] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<
    ParsedBackupData | ParsedEncryptedBackupData | null
  >(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [importPassword, setImportPassword] = useState('');
  const [showImportPasswordModal, setShowImportPasswordModal] = useState(false);
  const [pendingFileContent, setPendingFileContent] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Common state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLButtonElement>(null);

  // Get backup stats
  const backupStats = getBackupStats(dataSources);
  const hasData =
    backupStats.labResultCount > 0 ||
    backupStats.testValueCount > 0 ||
    backupStats.noteCount > 0;

  // Handle create standard backup
  const handleCreateStandardBackup = useCallback(async () => {
    setIsCreatingBackup(true);
    setError(null);
    setSuccess(null);

    try {
      const json = exportToJson(dataSources, { prettyPrint: true });
      const filename = generateBackupFilename();
      downloadJson(json, filename);
      setSuccess('Standard backup created successfully');
    } catch (err) {
      setError('Failed to create backup');
      console.error('Backup failed:', err);
    } finally {
      setIsCreatingBackup(false);
    }
  }, [dataSources]);

  // Handle create encrypted backup - show password modal
  const handleCreateEncryptedBackup = useCallback(() => {
    setExportPassword('');
    setExportPasswordConfirm('');
    setIsExportPasswordValid(false);
    setShowExportPasswordModal(true);
  }, []);

  // Handle encrypted backup creation after password entry
  const handleConfirmEncryptedExport = useCallback(async () => {
    if (!isExportPasswordValid) return;

    setShowExportPasswordModal(false);
    setIsCreatingBackup(true);
    setError(null);
    setSuccess(null);

    try {
      const json = await exportToEncryptedJson(dataSources, {
        password: exportPassword,
        prettyPrint: false,
      });
      const filename = generateEncryptedBackupFilename();
      downloadEncryptedBackup(json, filename);
      setSuccess('Encrypted backup created successfully');
    } catch (err) {
      setError('Failed to create encrypted backup');
      console.error('Encrypted backup failed:', err);
    } finally {
      setIsCreatingBackup(false);
      setExportPassword('');
      setExportPasswordConfirm('');
    }
  }, [dataSources, exportPassword, isExportPasswordValid]);

  // Handle backup type selection and create
  const handleCreateBackup = useCallback(() => {
    if (backupType === 'encrypted') {
      handleCreateEncryptedBackup();
    } else {
      handleCreateStandardBackup();
    }
  }, [backupType, handleCreateEncryptedBackup, handleCreateStandardBackup]);

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File | null) => {
    setError(null);
    setSuccess(null);
    setSelectedFile(file);
    setParsedData(null);
    setPendingFileContent(null);
    setImportPassword('');

    if (!file) {
      return;
    }

    // Validate file (now accepts both .json and .hemoio)
    const validation = validateEncryptedBackupFile(file);
    if (!validation.valid) {
      // Fall back to standard validation for .json files
      const standardValidation = validateBackupFile(file);
      if (!standardValidation.valid) {
        setError(validation.error || standardValidation.error || 'Invalid file');
        return;
      }
    }

    try {
      // Read file content
      const content = await readBackupFile(file);

      // Detect backup type
      const detection = detectBackupType(content);

      if (!detection.success) {
        setError(detection.error || 'Unable to read backup file');
        return;
      }

      if (detection.type === 'encrypted') {
        // Show password prompt for encrypted backups
        setPendingFileContent(content);
        setShowImportPasswordModal(true);
      } else {
        // Parse standard backup directly
        const parsed = parseBackupJson(content);
        setParsedData(parsed);
        setRestoreConfirmOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read backup file');
    }
  }, []);

  // Handle decryption of encrypted backup
  const handleDecryptBackup = useCallback(async () => {
    if (!pendingFileContent || !importPassword) return;

    setIsDecrypting(true);
    setError(null);

    try {
      const parsed = await parseEncryptedBackup(pendingFileContent, importPassword);
      setParsedData(parsed);
      setShowImportPasswordModal(false);
      setRestoreConfirmOpen(true);
      setPendingFileContent(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decrypt backup');
    } finally {
      setIsDecrypting(false);
    }
  }, [pendingFileContent, importPassword]);

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
      setImportPassword('');
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
    setImportPassword('');
  }, []);

  // Handle cancel password modal
  const handleCancelPasswordModal = useCallback(() => {
    setShowImportPasswordModal(false);
    setPendingFileContent(null);
    setSelectedFile(null);
    setImportPassword('');
  }, []);

  // Handle cancel export password modal
  const handleCancelExportPasswordModal = useCallback(() => {
    setShowExportPasswordModal(false);
    setExportPassword('');
    setExportPasswordConfirm('');
  }, []);

  // Get import preview - handle both standard and encrypted backups
  const importPreview: {
    labResultCount: number;
    testValueCount: number;
    noteCount: number;
    hasSettings: boolean;
    hasPreferences: boolean;
    exportedAt: Date;
    schemaVersion: number;
    wasEncrypted?: boolean;
    hasApiKey?: boolean;
  } | null = parsedData
    ? 'wasEncrypted' in parsedData
      ? getEncryptedImportPreview(parsedData as ParsedEncryptedBackupData)
      : getImportPreview(parsedData)
    : null;

  const processing = isProcessing || isCreatingBackup || isRestoring || isDecrypting;

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
            <Alert
              color="red"
              icon={<IconAlertCircle size={16} />}
              onClose={() => setError(null)}
              withCloseButton
            >
              {error}
            </Alert>
          )}

          {success && (
            <Alert
              color="green"
              icon={<IconCheck size={16} />}
              onClose={() => setSuccess(null)}
              withCloseButton
            >
              {success}
            </Alert>
          )}

          <Divider />

          {/* Create Backup Section */}
          <Stack gap="sm">
            <Text fw={500}>Create Backup</Text>
            <Text size="sm" c="dimmed">
              Download a copy of all your data.
              {hasData && (
                <>
                  {' '}
                  Your backup will include {backupStats.labResultCount} lab result
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
                You don&apos;t have any data to backup yet. Import some lab results
                first.
              </Alert>
            )}

            <Stack gap="xs">
              <Text size="sm" fw={500}>
                Backup Type
              </Text>
              <SegmentedControl
                value={backupType}
                onChange={(value) => setBackupType(value as BackupType)}
                disabled={processing || !hasData}
                data={[
                  {
                    value: 'standard',
                    label: (
                      <Group gap="xs">
                        <IconLockOpen size={16} />
                        <span>Standard</span>
                      </Group>
                    ),
                  },
                  {
                    value: 'encrypted',
                    label: (
                      <Group gap="xs">
                        <IconLock size={16} />
                        <span>Encrypted</span>
                      </Group>
                    ),
                  },
                ]}
                aria-label="Select backup type"
              />
              <Text size="xs" c="dimmed">
                {backupType === 'standard'
                  ? 'Standard backup (.json) - Does not include API keys for security.'
                  : 'Encrypted backup (.hemoio) - Password-protected, includes API keys. Can be restored on any device.'}
              </Text>
            </Stack>

            <Button
              leftSection={
                backupType === 'encrypted' ? (
                  <IconLock size={16} />
                ) : (
                  <IconDownload size={16} />
                )
              }
              onClick={handleCreateBackup}
              loading={isCreatingBackup}
              disabled={!hasData || processing}
            >
              {backupType === 'encrypted' ? 'Create Encrypted Backup' : 'Create Backup'}
            </Button>
          </Stack>

          <Divider />

          {/* Restore Section */}
          <Stack gap="sm">
            <Text fw={500}>Restore from Backup</Text>
            <Text size="sm" c="dimmed">
              Upload a backup file to restore your data. This will replace all existing
              data with the data from the backup. Supports both standard (.json) and
              encrypted (.hemoio) backups.
            </Text>

            <FileInput
              ref={fileInputRef}
              value={selectedFile}
              onChange={handleFileSelect}
              accept=".json,.hemoio"
              placeholder="Select backup file (.json or .hemoio)"
              leftSection={<IconFileZip size={16} />}
              clearable
              disabled={processing}
              aria-label="Select backup file to restore"
            />
          </Stack>
        </Stack>
      </Paper>

      {/* Export Password Modal for Encrypted Backups */}
      <Modal
        opened={showExportPasswordModal}
        onClose={handleCancelExportPasswordModal}
        title={
          <Group gap="xs">
            <IconLock size={20} />
            <span>Set Backup Password</span>
          </Group>
        }
        centered
      >
        <Stack gap="md">
          <Alert color="blue" icon={<IconKey size={16} />}>
            This password is used to encrypt your backup. You will need it to restore
            the backup on any device. The backup will include your API keys.
          </Alert>

          <BackupPasswordInput
            value={exportPassword}
            onChange={setExportPassword}
            confirmValue={exportPasswordConfirm}
            onConfirmChange={setExportPasswordConfirm}
            onValidChange={setIsExportPasswordValid}
            disabled={isCreatingBackup}
            label="Backup Password"
            confirmLabel="Confirm Password"
            showStrengthIndicator
            minStrength={3}
          />

          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={handleCancelExportPasswordModal}>
              Cancel
            </Button>
            <Button
              leftSection={<IconLock size={16} />}
              onClick={handleConfirmEncryptedExport}
              disabled={!isExportPasswordValid}
              loading={isCreatingBackup}
            >
              Create Encrypted Backup
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Import Password Modal for Encrypted Backups */}
      <Modal
        opened={showImportPasswordModal}
        onClose={handleCancelPasswordModal}
        title={
          <Group gap="xs">
            <IconLock size={20} />
            <span>Enter Backup Password</span>
          </Group>
        }
        centered
      >
        <Stack gap="md">
          <Alert color="blue" icon={<IconKey size={16} />}>
            This backup is encrypted. Enter the password that was used when creating
            the backup.
          </Alert>

          <PasswordInput
            label="Backup Password"
            value={importPassword}
            onChange={(e) => setImportPassword(e.target.value)}
            disabled={isDecrypting}
            required
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && importPassword) {
                handleDecryptBackup();
              }
            }}
          />

          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={handleCancelPasswordModal}>
              Cancel
            </Button>
            <Button
              onClick={handleDecryptBackup}
              disabled={!importPassword}
              loading={isDecrypting}
            >
              Decrypt & Continue
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Restore Confirmation Modal */}
      <Modal
        opened={restoreConfirmOpen}
        onClose={handleCancelRestore}
        title="Restore from Backup"
        centered
      >
        <Stack gap="md">
          <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
            This will replace all your current data with the data from the backup. This
            action cannot be undone.
          </Alert>

          {importPreview && (
            <Paper p="sm" withBorder>
              <Stack gap="xs">
                <Group gap="xs">
                  <Text size="sm" fw={500}>
                    Backup Contents
                  </Text>
                  {importPreview.wasEncrypted === true && (
                    <Badge size="xs" color="green" leftSection={<IconLock size={10} />}>
                      Encrypted
                    </Badge>
                  )}
                </Group>
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
                {importPreview.hasApiKey === true && (
                  <Text size="sm" c="green">
                    <Group gap="xs">
                      <IconKey size={14} />
                      <span>Includes API key</span>
                    </Group>
                  </Text>
                )}
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
