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
import { useExportData, useEncryptedDb } from '@hooks';
import { BIOMARKER_DEFINITIONS } from '@data/biomarkers';
import type { ParsedBackupData } from '@services/import';
import type { AIProviderType } from '@services/ai/types';

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

  // AI Settings state
  const [aiProvider, setAiProvider] = useState<AIProviderType>('openai');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyLastFour, setApiKeyLastFour] = useState<string | undefined>();
  const [aiTestInProgress, setAiTestInProgress] = useState(false);

  // Display Settings state
  const [theme, setTheme] = useState<ThemeOption>('system');
  const [dateFormat, setDateFormat] = useState<DateFormatOption>('MM/DD/YYYY');

  // Personal Targets state
  const [personalTargets, setPersonalTargets] = useState<PersonalTarget[]>([]);
  const [isSavingTargets, setIsSavingTargets] = useState(false);

  // Load AI settings from localStorage
  useEffect(() => {
    const savedProvider = localStorage.getItem('hemoio_ai_provider') as AIProviderType | null;
    const savedApiKey = localStorage.getItem('hemoio_ai_api_key');

    if (savedProvider) {
      setAiProvider(savedProvider);
    }

    if (savedApiKey) {
      setHasApiKey(true);
      setApiKeyLastFour(savedApiKey.slice(-4));
    }
  }, []);

  // Load display settings from localStorage and sync with Mantine
  useEffect(() => {
    const savedDateFormat = localStorage.getItem('hemoio_date_format') as DateFormatOption | null;
    if (savedDateFormat) {
      setDateFormat(savedDateFormat);
    }

    // Determine theme from Mantine's color scheme
    if (colorScheme === 'auto') {
      setTheme('system');
    } else {
      setTheme(colorScheme);
    }
  }, [colorScheme]);

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

  // Handle AI provider change
  const handleAiProviderChange = useCallback((provider: AIProviderType) => {
    setAiProvider(provider);
    localStorage.setItem('hemoio_ai_provider', provider);
  }, []);

  // Handle API key change
  const handleApiKeyChange = useCallback((apiKey: string) => {
    if (apiKey) {
      localStorage.setItem('hemoio_ai_api_key', apiKey);
      setHasApiKey(true);
      setApiKeyLastFour(apiKey.slice(-4));
    } else {
      localStorage.removeItem('hemoio_ai_api_key');
      setHasApiKey(false);
      setApiKeyLastFour(undefined);
    }
  }, []);

  // Handle AI connection test
  const handleTestConnection = useCallback(async (): Promise<boolean> => {
    setAiTestInProgress(true);
    try {
      const apiKey = localStorage.getItem('hemoio_ai_api_key');
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
  }, [aiProvider]);

  // Handle theme change
  const handleThemeChange = useCallback((newTheme: ThemeOption) => {
    setTheme(newTheme);
    localStorage.setItem('hemoio_theme', newTheme);
  }, []);

  // Handle date format change
  const handleDateFormatChange = useCallback((newFormat: DateFormatOption) => {
    setDateFormat(newFormat);
    localStorage.setItem('hemoio_date_format', newFormat);
  }, []);

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
          <Stack gap="md">
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
            hasApiKey={hasApiKey}
            apiKeyLastFour={apiKeyLastFour}
            onProviderChange={handleAiProviderChange}
            onApiKeyChange={handleApiKeyChange}
            onTestConnection={handleTestConnection}
            isSaving={aiTestInProgress}
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
