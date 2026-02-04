/**
 * SettingsPage Component
 *
 * Main settings page containing all application settings sections.
 */

import { useState, useCallback, useEffect } from 'react';
import { Stack, Title, Tabs } from '@mantine/core';
import { useMantineColorScheme } from '@mantine/core';
import {
  IconDatabase,
  IconRobot,
  IconSettings,
  IconTarget,
} from '@tabler/icons-react';
import { BackupRestore } from './BackupRestore';
import { DisplaySettings } from './DisplaySettings';
import { AISettings } from './AISettings';
import { PersonalTargets, type PersonalTarget } from './PersonalTargets';
import { StorageSettings } from './StorageSettings';
import { useExportData, useEncryptedDb, useEncryptedApiKey, useAISettings } from '@hooks';
import { BIOMARKER_DEFINITIONS } from '@data/biomarkers';
import type { ParsedBackupData } from '@services/import';

/**
 * Theme options
 */
type ThemeOption = 'light' | 'dark' | 'system';

/**
 * Date format options
 */
type DateFormatOption = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

/**
 * Props for SettingsPage component
 */
export interface SettingsPageProps {
  /** Called when data is restored from backup */
  onRestore: (data: ParsedBackupData) => Promise<void>;
  /** Whether restore is in progress */
  isRestoring?: boolean;
}

/**
 * Settings page with tabbed sections
 */
export function SettingsPage({ onRestore, isRestoring = false }: SettingsPageProps): React.ReactNode {
  const { dataSources, isLoading } = useExportData();
  const { db, isReady } = useEncryptedDb();
  const { colorScheme } = useMantineColorScheme();
  const {
    hasApiKey,
    apiKeyLastFour,
    getApiKey,
    setApiKey: saveEncryptedApiKey,
    removeApiKey,
    isLoading: isApiKeyLoading,
  } = useEncryptedApiKey();

  // AI Settings from hook
  const {
    aiProvider,
    ollamaModel,
    openaiModel,
    anthropicModel,
    setAiProvider: handleAiProviderChange,
    setOllamaModel: handleOllamaModelChange,
    setOpenaiModel: handleOpenaiModelChange,
    setAnthropicModel: handleAnthropicModelChange,
  } = useAISettings();
  const [aiTestInProgress, setAiTestInProgress] = useState(false);

  // Display Settings state
  const [theme, setTheme] = useState<ThemeOption>('system');
  const [dateFormat, setDateFormat] = useState<DateFormatOption>('MM/DD/YYYY');

  // Personal Targets state
  const [personalTargets, setPersonalTargets] = useState<PersonalTarget[]>([]);
  const [isSavingTargets, setIsSavingTargets] = useState(false);

  // Load display settings from IndexedDB (with localStorage migration)
  useEffect(() => {
    async function loadDisplaySettings() {
      if (!db || !isReady) return;

      try {
        const prefs = await db.getPreferences();

        // Check for localStorage values to migrate
        const lsDateFormat = localStorage.getItem('hemoio_date_format') as DateFormatOption | null;
        const lsTheme = localStorage.getItem('hemoio_theme') as ThemeOption | null;

        // Use IndexedDB values if available, otherwise fall back to localStorage for migration
        const savedDateFormat = prefs?.dateFormat ?? lsDateFormat ?? 'MM/DD/YYYY';
        const savedTheme = prefs?.theme ?? lsTheme ?? 'system';

        setDateFormat(savedDateFormat);
        setTheme(savedTheme);

        // Migrate localStorage to IndexedDB if needed
        if (lsDateFormat || lsTheme) {
          await db.savePreferences({
            unitPreferences: prefs?.unitPreferences ?? {},
            personalTargets: prefs?.personalTargets ?? {},
            theme: savedTheme,
            dateFormat: savedDateFormat,
          });
          // Clean up localStorage after migration
          localStorage.removeItem('hemoio_date_format');
          localStorage.removeItem('hemoio_theme');
        }
      } catch (err) {
        console.error('Failed to load display settings:', err);
        // Fall back to Mantine's color scheme
        if (colorScheme === 'auto') {
          setTheme('system');
        } else {
          setTheme(colorScheme);
        }
      }
    }

    loadDisplaySettings();
  }, [db, isReady, colorScheme]);

  // Load personal targets from database
  useEffect(() => {
    async function loadTargets() {
      if (!db || !isReady) return;

      try {
        const prefs = await db.getPreferences();
        const targetsMap = prefs?.personalTargets ?? {};

        // Build targets list from biomarker definitions
        const targets: PersonalTarget[] = BIOMARKER_DEFINITIONS.map((biomarker, index) => {
          const target = targetsMap[index + 1]; // biomarkerId is 1-indexed
          return {
            biomarkerId: index + 1,
            biomarkerName: biomarker.name,
            unit: biomarker.canonicalUnit,
            standardLow: biomarker.defaultReferenceRange?.low,
            standardHigh: biomarker.defaultReferenceRange?.high,
            personalLow: target?.low,
            personalHigh: target?.high,
          };
        });

        setPersonalTargets(targets);
      } catch (err) {
        console.error('Failed to load personal targets:', err);
      }
    }

    loadTargets();
  }, [db, isReady]);

  // Handle API key change (async because of encryption)
  const handleApiKeyChange = useCallback(
    async (apiKey: string) => {
      if (apiKey) {
        await saveEncryptedApiKey(apiKey);
      } else {
        removeApiKey();
      }
    },
    [saveEncryptedApiKey, removeApiKey]
  );

  // Handle AI connection test
  const handleTestConnection = useCallback(async (): Promise<boolean> => {
    setAiTestInProgress(true);
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        return false;
      }

      // Simple validation - check if key format looks valid
      if (aiProvider === 'openai' && !apiKey.startsWith('sk-')) {
        return false;
      }
      if (aiProvider === 'anthropic' && !apiKey.startsWith('sk-ant-')) {
        return false;
      }

      // For now, just validate format. Real API test would require network call.
      return true;
    } catch {
      return false;
    } finally {
      setAiTestInProgress(false);
    }
  }, [aiProvider, getApiKey]);

  // Handle theme change
  const handleThemeChange = useCallback(
    async (newTheme: ThemeOption) => {
      setTheme(newTheme);
      if (db && isReady) {
        try {
          const prefs = await db.getPreferences();
          await db.savePreferences({
            unitPreferences: prefs?.unitPreferences ?? {},
            personalTargets: prefs?.personalTargets ?? {},
            theme: newTheme,
            dateFormat: prefs?.dateFormat ?? 'MM/DD/YYYY',
          });
        } catch (err) {
          console.error('Failed to save theme:', err);
        }
      }
    },
    [db, isReady]
  );

  // Handle date format change
  const handleDateFormatChange = useCallback(
    async (newFormat: DateFormatOption) => {
      setDateFormat(newFormat);
      if (db && isReady) {
        try {
          const prefs = await db.getPreferences();
          await db.savePreferences({
            unitPreferences: prefs?.unitPreferences ?? {},
            personalTargets: prefs?.personalTargets ?? {},
            theme: prefs?.theme ?? 'system',
            dateFormat: newFormat,
          });
        } catch (err) {
          console.error('Failed to save date format:', err);
        }
      }
    },
    [db, isReady]
  );

  // Handle set personal target
  const handleSetTarget = useCallback(
    async (biomarkerId: number, low: number | undefined, high: number | undefined) => {
      if (!db || !isReady) return;

      setIsSavingTargets(true);
      try {
        const prefs = await db.getPreferences();
        const currentTargets = prefs?.personalTargets ?? {};

        const updatedTargets = {
          ...currentTargets,
          [biomarkerId]: { low, high },
        };

        await db.savePreferences({
          unitPreferences: prefs?.unitPreferences ?? {},
          personalTargets: updatedTargets,
          theme: prefs?.theme ?? 'system',
          dateFormat: prefs?.dateFormat ?? 'MM/DD/YYYY',
        });

        // Update local state
        setPersonalTargets((prev) =>
          prev.map((t) =>
            t.biomarkerId === biomarkerId
              ? { ...t, personalLow: low, personalHigh: high }
              : t
          )
        );
      } catch (err) {
        console.error('Failed to save personal target:', err);
      } finally {
        setIsSavingTargets(false);
      }
    },
    [db, isReady]
  );

  // Handle clear personal target
  const handleClearTarget = useCallback(
    async (biomarkerId: number) => {
      if (!db || !isReady) return;

      setIsSavingTargets(true);
      try {
        const prefs = await db.getPreferences();
        const currentTargets = { ...(prefs?.personalTargets ?? {}) };

        delete currentTargets[biomarkerId];

        await db.savePreferences({
          unitPreferences: prefs?.unitPreferences ?? {},
          personalTargets: currentTargets,
          theme: prefs?.theme ?? 'system',
          dateFormat: prefs?.dateFormat ?? 'MM/DD/YYYY',
        });

        // Update local state
        setPersonalTargets((prev) =>
          prev.map((t) =>
            t.biomarkerId === biomarkerId
              ? { ...t, personalLow: undefined, personalHigh: undefined }
              : t
          )
        );
      } catch (err) {
        console.error('Failed to clear personal target:', err);
      } finally {
        setIsSavingTargets(false);
      }
    },
    [db, isReady]
  );

  return (
    <Stack gap="lg">
      <Title order={2}>Settings</Title>

      <Tabs defaultValue="data" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="data" leftSection={<IconDatabase size={16} />}>
            Data
          </Tabs.Tab>
          <Tabs.Tab value="ai" leftSection={<IconRobot size={16} />}>
            AI Configuration
          </Tabs.Tab>
          <Tabs.Tab value="preferences" leftSection={<IconSettings size={16} />}>
            Display
          </Tabs.Tab>
          <Tabs.Tab value="targets" leftSection={<IconTarget size={16} />}>
            Personal Targets
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="data" pt="md">
          <Stack gap="lg">
            <StorageSettings />
            <BackupRestore
              dataSources={dataSources}
              onRestore={onRestore}
              isProcessing={isRestoring || isLoading}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="ai" pt="md">
          <AISettings
            provider={aiProvider}
            hasApiKey={!isApiKeyLoading && hasApiKey}
            apiKeyLastFour={apiKeyLastFour}
            ollamaModel={ollamaModel}
            openaiModel={openaiModel}
            anthropicModel={anthropicModel}
            onProviderChange={handleAiProviderChange}
            onApiKeyChange={handleApiKeyChange}
            onOllamaModelChange={handleOllamaModelChange}
            onOpenaiModelChange={handleOpenaiModelChange}
            onAnthropicModelChange={handleAnthropicModelChange}
            onTestConnection={handleTestConnection}
            isSaving={aiTestInProgress}
            getApiKey={getApiKey}
          />
        </Tabs.Panel>

        <Tabs.Panel value="preferences" pt="md">
          <DisplaySettings
            theme={theme}
            dateFormat={dateFormat}
            onThemeChange={handleThemeChange}
            onDateFormatChange={handleDateFormatChange}
          />
        </Tabs.Panel>

        <Tabs.Panel value="targets" pt="md">
          <PersonalTargets
            targets={personalTargets}
            onSetTarget={handleSetTarget}
            onClearTarget={handleClearTarget}
            isSaving={isSavingTargets}
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
