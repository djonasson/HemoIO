import { useState, useCallback } from 'react';
import { Stack, Text, Radio, Group, Paper, ThemeIcon, Button, Alert } from '@mantine/core';
import {
  IconDeviceDesktop,
  IconFolder,
  IconBrandDropbox,
  IconBrandGoogleDrive,
  IconFolderOpen,
  IconCheck,
} from '@tabler/icons-react';
import type { StorageProviderType } from '@/types';
import { isFileSystemAccessSupported } from '@/utils/fileSystemSupport';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';

interface StorageStepProps {
  selectedStorage: StorageProviderType;
  onStorageChange: (storage: StorageProviderType) => void;
  /** The name of the selected directory (for filesystem storage) */
  selectedDirectoryName?: string | null;
  /** Called when a directory is selected */
  onDirectorySelect?: (directoryName: string) => void;
}

interface StorageOptionProps {
  value: StorageProviderType;
  label: string;
  description: string;
  icon: React.ReactNode;
  disabled?: boolean;
  hidden?: boolean;
  selected: boolean;
  onChange: (value: StorageProviderType) => void;
  children?: React.ReactNode;
}

function StorageOption({
  value,
  label,
  description,
  icon,
  disabled = false,
  hidden = false,
  selected,
  onChange,
  children,
}: StorageOptionProps): React.ReactNode {
  if (hidden) {
    return null;
  }

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        borderColor: selected ? 'var(--mantine-color-blue-5)' : undefined,
        backgroundColor: selected
          ? 'var(--mantine-color-blue-light)'
          : undefined,
      }}
      onClick={() => !disabled && onChange(value)}
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onChange(value);
        }
      }}
    >
      <Group>
        <Radio
          checked={selected}
          onChange={() => onChange(value)}
          disabled={disabled}
          aria-hidden="true"
          tabIndex={-1}
        />
        <ThemeIcon size="lg" variant="light" color={disabled ? 'gray' : 'blue'}>
          {icon}
        </ThemeIcon>
        <div style={{ flex: 1 }}>
          <Text fw={500}>
            {label}
            {disabled && (
              <Text span size="xs" c="dimmed" ml="xs">
                (Coming soon)
              </Text>
            )}
          </Text>
          <Text size="sm" c="dimmed">
            {description}
          </Text>
          {children}
        </div>
      </Group>
    </Paper>
  );
}

function StorageStep({
  selectedStorage,
  onStorageChange,
  selectedDirectoryName,
  onDirectorySelect,
}: StorageStepProps): React.ReactNode {
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  const fileSystemSupported = isFileSystemAccessSupported();

  const handleSelectDirectory = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent the radio button from being triggered
    setIsSelectingDirectory(true);
    setDirectoryError(null);

    try {
      const provider = new FileSystemStorageProvider();
      const handle = await provider.selectDirectory();

      if (handle) {
        onDirectorySelect?.(handle.name);
      }
    } catch (error) {
      if (error instanceof Error) {
        setDirectoryError(error.message);
      } else {
        setDirectoryError('Failed to select directory');
      }
    } finally {
      setIsSelectingDirectory(false);
    }
  }, [onDirectorySelect]);

  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        Choose where to store your encrypted lab data. All data is encrypted
        before being stored, regardless of the storage location.
      </Text>

      <Stack gap="sm" role="radiogroup" aria-label="Storage provider selection">
        <StorageOption
          value="local"
          label="Local Storage"
          description="Store data in your browser. Data stays on this device only."
          icon={<IconDeviceDesktop size={20} />}
          selected={selectedStorage === 'local'}
          onChange={onStorageChange}
        />

        <StorageOption
          value="filesystem"
          label="Local Directory"
          description="Store data in a local folder."
          icon={<IconFolder size={20} />}
          selected={selectedStorage === 'filesystem'}
          onChange={onStorageChange}
          hidden={!fileSystemSupported}
        >
          {selectedStorage === 'filesystem' && (
            <Stack gap="xs" mt="sm" onClick={(e) => e.stopPropagation()}>
              {selectedDirectoryName ? (
                <Group gap="xs">
                  <ThemeIcon size="sm" variant="light" color="green">
                    <IconCheck size={14} />
                  </ThemeIcon>
                  <Text size="sm" fw={500}>
                    {selectedDirectoryName}
                  </Text>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={handleSelectDirectory}
                    loading={isSelectingDirectory}
                    leftSection={<IconFolderOpen size={14} />}
                  >
                    Change
                  </Button>
                </Group>
              ) : (
                <Button
                  size="sm"
                  variant="light"
                  onClick={handleSelectDirectory}
                  loading={isSelectingDirectory}
                  leftSection={<IconFolderOpen size={16} />}
                >
                  Choose Folder
                </Button>
              )}
              {directoryError && (
                <Alert color="red" variant="light" p="xs">
                  {directoryError}
                </Alert>
              )}
            </Stack>
          )}
        </StorageOption>

        <StorageOption
          value="dropbox"
          label="Dropbox"
          description="Sync encrypted data across devices via Dropbox."
          icon={<IconBrandDropbox size={20} />}
          disabled
          selected={selectedStorage === 'dropbox'}
          onChange={onStorageChange}
        />

        <StorageOption
          value="googledrive"
          label="Google Drive"
          description="Sync encrypted data across devices via Google Drive."
          icon={<IconBrandGoogleDrive size={20} />}
          disabled
          selected={selectedStorage === 'googledrive'}
          onChange={onStorageChange}
        />
      </Stack>

      <Text size="xs" c="dimmed">
        Note: Cloud storage options will be available in a future update. Your
        data will always be encrypted before upload.
      </Text>
    </Stack>
  );
}

export { StorageStep };
