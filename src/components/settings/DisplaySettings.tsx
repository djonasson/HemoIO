/**
 * DisplaySettings Component
 *
 * Settings section for display preferences including theme and date format.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Stack,
  Paper,
  Title,
  Text,
  SegmentedControl,
  Select,
  Alert,
  Group,
} from '@mantine/core';
import {
  IconSun,
  IconMoon,
  IconDeviceDesktop,
  IconCheck,
} from '@tabler/icons-react';
import { useMantineColorScheme } from '@mantine/core';

/**
 * Theme options
 */
type ThemeOption = 'light' | 'dark' | 'system';

/**
 * Date format options
 */
type DateFormatOption = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

/**
 * Props for DisplaySettings component
 */
export interface DisplaySettingsProps {
  /** Current theme setting */
  theme?: ThemeOption;
  /** Current date format setting */
  dateFormat?: DateFormatOption;
  /** Called when theme changes */
  onThemeChange?: (theme: ThemeOption) => void;
  /** Called when date format changes */
  onDateFormatChange?: (format: DateFormatOption) => void;
  /** Whether settings are being saved */
  isSaving?: boolean;
}

/**
 * Date format options for select
 */
const DATE_FORMAT_OPTIONS = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (European)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' },
];

/**
 * DisplaySettings component for theme and date format preferences
 */
export function DisplaySettings({
  theme = 'system',
  dateFormat = 'MM/DD/YYYY',
  onThemeChange,
  onDateFormatChange,
  isSaving = false,
}: DisplaySettingsProps): React.ReactNode {
  const { setColorScheme } = useMantineColorScheme();
  const [localTheme, setLocalTheme] = useState<ThemeOption>(theme);
  const [localDateFormat, setLocalDateFormat] = useState<DateFormatOption>(dateFormat);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync local state with props
  useEffect(() => {
    setLocalTheme(theme);
  }, [theme]);

  useEffect(() => {
    setLocalDateFormat(dateFormat);
  }, [dateFormat]);

  // Handle theme change
  const handleThemeChange = useCallback(
    (value: string) => {
      const newTheme = value as ThemeOption;
      setLocalTheme(newTheme);

      // Apply theme immediately
      if (newTheme === 'system') {
        setColorScheme('auto');
      } else {
        setColorScheme(newTheme);
      }

      // Notify parent
      onThemeChange?.(newTheme);

      // Show success briefly
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
    [onThemeChange, setColorScheme]
  );

  // Handle date format change
  const handleDateFormatChange = useCallback(
    (value: string | null) => {
      if (!value) return;
      const newFormat = value as DateFormatOption;
      setLocalDateFormat(newFormat);
      onDateFormatChange?.(newFormat);

      // Show success briefly
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
    [onDateFormatChange]
  );

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Title order={4}>Display Preferences</Title>

        <Text size="sm" c="dimmed">
          Customize how the application looks and displays information.
        </Text>

        {saveSuccess && (
          <Alert color="green" icon={<IconCheck size={16} />}>
            Preferences saved
          </Alert>
        )}

        {/* Theme Selection */}
        <Stack gap="xs">
          <Text fw={500}>Theme</Text>
          <Text size="sm" c="dimmed">
            Choose your preferred color scheme
          </Text>
          <SegmentedControl
            value={localTheme}
            onChange={handleThemeChange}
            disabled={isSaving}
            data={[
              {
                value: 'light',
                label: (
                  <Group gap="xs" wrap="nowrap">
                    <IconSun size={16} />
                    <span>Light</span>
                  </Group>
                ),
              },
              {
                value: 'dark',
                label: (
                  <Group gap="xs" wrap="nowrap">
                    <IconMoon size={16} />
                    <span>Dark</span>
                  </Group>
                ),
              },
              {
                value: 'system',
                label: (
                  <Group gap="xs" wrap="nowrap">
                    <IconDeviceDesktop size={16} />
                    <span>System</span>
                  </Group>
                ),
              },
            ]}
            aria-label="Select theme"
          />
        </Stack>

        {/* Date Format Selection */}
        <Stack gap="xs">
          <Text fw={500}>Date Format</Text>
          <Text size="sm" c="dimmed">
            Choose how dates are displayed throughout the application
          </Text>
          <Select
            value={localDateFormat}
            onChange={handleDateFormatChange}
            data={DATE_FORMAT_OPTIONS}
            disabled={isSaving}
            aria-label="Select date format"
          />
          <Text size="xs" c="dimmed">
            Example: {formatExampleDate(localDateFormat)}
          </Text>
        </Stack>
      </Stack>
    </Paper>
  );
}

/**
 * Format an example date to show the selected format
 */
function formatExampleDate(format: DateFormatOption): string {
  // Example date: January 15, 2024
  switch (format) {
    case 'MM/DD/YYYY':
      return '01/15/2024';
    case 'DD/MM/YYYY':
      return '15/01/2024';
    case 'YYYY-MM-DD':
      return '2024-01-15';
    default:
      return '01/15/2024';
  }
}
