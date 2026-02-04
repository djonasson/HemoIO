/**
 * StorageSettings Component
 *
 * Settings section for managing storage provider configuration.
 * Allows switching between storage providers and handles filesystem
 * permission re-requests and directory changes.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Stack,
  Paper,
  Text,
  Group,
  ThemeIcon,
  Button,
  Badge,
  Alert,
  Radio,
  Modal,
} from '@mantine/core';
import {
  IconFolder,
  IconDeviceDesktop,
  IconFolderOpen,
  IconCheck,
  IconAlertTriangle,
  IconRefresh,
  IconSwitchHorizontal,
} from '@tabler/icons-react';
import type { StorageProviderType } from '@/types';
import { isFileSystemAccessSupported } from '@/utils/fileSystemSupport';
import {
  FileSystemStorageProvider,
  type FileSystemPermissionState,
} from '@data/storage/FileSystemStorageProvider';

const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';

export interface StorageSettingsProps {
  /** Whether the settings are being saved */
  isSaving?: boolean;
}

export function StorageSettings({
  isSaving = false,
}: StorageSettingsProps): React.ReactNode {
  const [storageProvider, setStorageProvider] = useState<StorageProviderType>('local');
  const [directoryName, setDirectoryName] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<FileSystemPermissionState | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<StorageProviderType | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const fileSystemSupported = isFileSystemAccessSupported();

  // Load storage provider from localStorage
  useEffect(() => {
    const savedProvider = localStorage.getItem(STORAGE_PROVIDER_KEY) as StorageProviderType | null;
    if (savedProvider) {
      setStorageProvider(savedProvider);
    }
  }, []);

  // Load filesystem status when provider is filesystem
  useEffect(() => {
    async function loadFileSystemStatus() {
      if (storageProvider !== 'filesystem' || !fileSystemSupported) {
        return;
      }

      const provider = new FileSystemStorageProvider();
      const name = await provider.getDirectoryName();
      setDirectoryName(name);

      if (name) {
        const state = await provider.getPermissionState();
        setPermissionState(state);
      }
    }

    loadFileSystemStatus();
  }, [storageProvider, fileSystemSupported]);

  const handleRequestPermission = useCallback(async () => {
    setIsRequestingPermission(true);
    setError(null);

    try {
      const provider = new FileSystemStorageProvider();
      const state = await provider.requestPermission();
      setPermissionState(state);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to request permission');
      }
    } finally {
      setIsRequestingPermission(false);
    }
  }, []);

  const handleSelectDirectory = useCallback(async () => {
    setIsSelectingDirectory(true);
    setError(null);

    try {
      const provider = new FileSystemStorageProvider();
      const handle = await provider.selectDirectory();

      if (handle) {
        setDirectoryName(handle.name);
        setPermissionState('granted');
        return handle.name;
      }
      return null;
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to select directory');
      }
      return null;
    } finally {
      setIsSelectingDirectory(false);
    }
  }, []);

  const handleProviderChange = useCallback((newProvider: StorageProviderType) => {
    if (newProvider === storageProvider) return;

    // Show confirmation modal before switching
    setPendingProvider(newProvider);
    setShowConfirmModal(true);
  }, [storageProvider]);

  const handleConfirmSwitch = useCallback(async () => {
    if (!pendingProvider) return;

    setIsChanging(true);
    setError(null);

    try {
      // If switching to filesystem, need to select a directory first
      if (pendingProvider === 'filesystem') {
        const selectedDir = await handleSelectDirectory();
        if (!selectedDir) {
          // User cancelled directory selection
          setIsChanging(false);
          setShowConfirmModal(false);
          setPendingProvider(null);
          return;
        }
      }

      // Save the new provider
      localStorage.setItem(STORAGE_PROVIDER_KEY, pendingProvider);
      setStorageProvider(pendingProvider);

      // Clear filesystem state if switching away from it
      if (pendingProvider !== 'filesystem') {
        setDirectoryName(null);
        setPermissionState(null);
      }

      setShowConfirmModal(false);
      setPendingProvider(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to switch storage provider');
      }
    } finally {
      setIsChanging(false);
    }
  }, [pendingProvider, handleSelectDirectory]);

  const handleCancelSwitch = useCallback(() => {
    setShowConfirmModal(false);
    setPendingProvider(null);
  }, []);

  const renderStorageOption = (
    type: StorageProviderType,
    label: string,
    description: string,
    icon: React.ReactNode,
    disabled: boolean = false,
    extra?: React.ReactNode
  ): React.ReactNode => {
    const isSelected = storageProvider === type;

    return (
      <Paper
        withBorder
        p="md"
        radius="md"
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          borderColor: isSelected ? 'var(--mantine-color-blue-5)' : undefined,
          backgroundColor: isSelected ? 'var(--mantine-color-blue-light)' : undefined,
        }}
        onClick={() => !disabled && !isSaving && handleProviderChange(type)}
        role="radio"
        aria-checked={isSelected}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (!disabled && !isSaving && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleProviderChange(type);
          }
        }}
      >
        <Group>
          <Radio
            checked={isSelected}
            onChange={() => handleProviderChange(type)}
            disabled={disabled || isSaving}
            aria-hidden="true"
            tabIndex={-1}
          />
          <ThemeIcon size="lg" variant="light" color={disabled ? 'gray' : 'blue'}>
            {icon}
          </ThemeIcon>
          <div style={{ flex: 1 }}>
            <Group gap="xs">
              <Text fw={500}>{label}</Text>
              {isSelected && (
                <Badge color="green" variant="light" size="sm">
                  Active
                </Badge>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              {description}
            </Text>
            {extra}
          </div>
        </Group>
      </Paper>
    );
  };

  const renderFilesystemExtra = (): React.ReactNode => {
    if (storageProvider !== 'filesystem') return null;

    return (
      <Stack gap="xs" mt="sm" onClick={(e) => e.stopPropagation()}>
        {directoryName && (
          <Group gap="xs">
            {permissionState === 'granted' ? (
              <>
                <ThemeIcon size="sm" variant="light" color="green">
                  <IconCheck size={14} />
                </ThemeIcon>
                <Text size="sm" fw={500}>
                  {directoryName}
                </Text>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={handleSelectDirectory}
                  loading={isSelectingDirectory}
                  disabled={isSaving}
                  leftSection={<IconFolderOpen size={14} />}
                >
                  Change
                </Button>
              </>
            ) : permissionState === 'prompt' ? (
              <>
                <ThemeIcon size="sm" variant="light" color="yellow">
                  <IconAlertTriangle size={14} />
                </ThemeIcon>
                <Text size="sm" c="dimmed">
                  {directoryName}
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  color="yellow"
                  onClick={handleRequestPermission}
                  loading={isRequestingPermission}
                  disabled={isSaving}
                  leftSection={<IconRefresh size={14} />}
                >
                  Grant Access
                </Button>
              </>
            ) : (
              <>
                <ThemeIcon size="sm" variant="light" color="red">
                  <IconAlertTriangle size={14} />
                </ThemeIcon>
                <Text size="sm" c="red">
                  Access denied
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  onClick={handleSelectDirectory}
                  loading={isSelectingDirectory}
                  disabled={isSaving}
                  leftSection={<IconFolderOpen size={14} />}
                >
                  Select New Folder
                </Button>
              </>
            )}
          </Group>
        )}

        {!directoryName && (
          <Button
            size="sm"
            variant="light"
            onClick={handleSelectDirectory}
            loading={isSelectingDirectory}
            disabled={isSaving}
            leftSection={<IconFolderOpen size={16} />}
          >
            Choose Folder
          </Button>
        )}
      </Stack>
    );
  };

  return (
    <>
      <Stack gap="md">
        <Text fw={500}>Storage Location</Text>
        <Text size="sm" c="dimmed">
          Choose where to store your encrypted data. You can switch between storage
          providers at any time.
        </Text>

        <Stack gap="sm" role="radiogroup" aria-label="Storage provider selection">
          {renderStorageOption(
            'local',
            'Local Storage',
            'Store data in your browser. Data stays on this device only.',
            <IconDeviceDesktop size={20} />
          )}

          {fileSystemSupported &&
            renderStorageOption(
              'filesystem',
              'Local Directory',
              'Store data in a local folder.',
              <IconFolder size={20} />,
              false,
              renderFilesystemExtra()
            )}
        </Stack>

        {error && (
          <Alert color="red" variant="light" title="Error">
            {error}
          </Alert>
        )}

        {storageProvider === 'filesystem' && permissionState === 'prompt' && (
          <Alert color="yellow" variant="light" title="Permission Required">
            Your browser requires permission to access the selected folder. Click
            "Grant Access" to continue using your data.
          </Alert>
        )}

        {!fileSystemSupported && (
          <Text size="xs" c="dimmed">
            Note: Local Directory storage is not supported in this browser.
            Use Chrome or Edge to enable folder-based storage.
          </Text>
        )}
      </Stack>

      <Modal
        opened={showConfirmModal}
        onClose={handleCancelSwitch}
        title="Change Storage Location"
        centered
      >
        <Stack gap="md">
          <Alert color="yellow" variant="light" icon={<IconSwitchHorizontal size={16} />}>
            <Text size="sm">
              Changing your storage location will affect where new data is saved.
              Your existing data will remain in the current location.
            </Text>
          </Alert>

          <Text size="sm">
            To migrate your existing data:
          </Text>
          <Text size="sm" component="ol" style={{ paddingLeft: '1.5rem', margin: 0 }}>
            <li>Export a backup from the current storage (Backup & Restore section)</li>
            <li>Switch to the new storage location</li>
            <li>Import your backup into the new location</li>
          </Text>

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={handleCancelSwitch} disabled={isChanging}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSwitch}
              loading={isChanging}
              leftSection={<IconSwitchHorizontal size={16} />}
            >
              {pendingProvider === 'filesystem' ? 'Select Folder & Switch' : 'Switch Storage'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
