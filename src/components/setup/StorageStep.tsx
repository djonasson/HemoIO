import { Stack, Text, Radio, Group, Paper, ThemeIcon } from '@mantine/core';
import { IconDeviceDesktop, IconBrandDropbox, IconBrandGoogleDrive } from '@tabler/icons-react';
import type { StorageProviderType } from '@/types';

interface StorageStepProps {
  selectedStorage: StorageProviderType;
  onStorageChange: (storage: StorageProviderType) => void;
}

interface StorageOptionProps {
  value: StorageProviderType;
  label: string;
  description: string;
  icon: React.ReactNode;
  disabled?: boolean;
  selected: boolean;
  onChange: (value: StorageProviderType) => void;
}

function StorageOption({
  value,
  label,
  description,
  icon,
  disabled = false,
  selected,
  onChange,
}: StorageOptionProps): React.ReactNode {
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
        </div>
      </Group>
    </Paper>
  );
}

function StorageStep({
  selectedStorage,
  onStorageChange,
}: StorageStepProps): React.ReactNode {
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
