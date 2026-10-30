/**
 * SettingsPage Component
 *
 * Main settings page containing all application settings sections.
 */

import { useState, useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import { Stack, Title, Tabs } from '@mantine/core';
import { useMantineColorScheme } from '@mantine/core';
import { notifySaveFailed } from '@components/common/notifySaveFailed';
import {
  IconDatabase,
  IconLock,
  IconRobot,
  IconSettings,
  IconTarget,
  IconBook,
} from '@tabler/icons-react';
import { BackupRestore } from './BackupRestore';
import { ChangePassword } from './ChangePassword';
import { DisplaySettings } from './DisplaySettings';
import { AISettings } from './AISettings';
import { PersonalTargets } from './PersonalTargets';
import { LearnedAliases } from './LearnedAliases';
import { toPersonalTarget, type PersonalTarget } from './personalTarget';
import { StorageSettings } from './StorageSettings';
import {
  useExportData,
  useEncryptedDb,
  useEncryptedApiKey,
  useAISettings,
  usePreferences,
} from '@hooks';
import { BIOMARKER_DEFINITIONS } from '@data/biomarkers';
import { modelForProvider, testProviderConnection } from '@services/ai';
import type { ParsedBackupData } from '@services/import';
import type { RestoreOptions } from './BackupRestore';
import type { UserPreferences } from '@/types';

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
  onRestore: (data: ParsedBackupData, options: RestoreOptions) => Promise<void>;
  /** Whether restore is in progress */
  isRestoring?: boolean;
}

/**
 * An AI setting's save that tells the user when it was not saved, and
 * still rejects, so the control showing it goes back
 */
function reportAISave<T>(save: (value: T) => Promise<void>): (value: T) => Promise<void> {
  return (value) =>
    save(value).catch((err: unknown) => {
      notifySaveFailed('AI setting not saved', err);
      throw err;
    });
}

/**
 * Settings page with tabbed sections
 */
export function SettingsPage({ onRestore, isRestoring = false }: SettingsPageProps): React.ReactNode {
  const { dataSources, isLoading, refresh: loadDataSources } = useExportData();
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
    setAiProvider,
    setOllamaModel,
    setOpenaiModel,
    setAnthropicModel,
  } = useAISettings();
  // Each AI setting shows at once; one that is not saved goes back, and the user is told why
  const handleAiProviderChange = useMemo(() => reportAISave(setAiProvider), [setAiProvider]);
  const handleOllamaModelChange = useMemo(() => reportAISave(setOllamaModel), [setOllamaModel]);
  const handleOpenaiModelChange = useMemo(() => reportAISave(setOpenaiModel), [setOpenaiModel]);
  const handleAnthropicModelChange = useMemo(
    () => reportAISave(setAnthropicModel),
    [setAnthropicModel]
  );
  const [aiTestInProgress, setAiTestInProgress] = useState(false);

  // Display Settings state
  const [theme, setTheme] = useState<ThemeOption>('system');
  const [dateFormat, setDateFormat] = useState<DateFormatOption>('MM/DD/YYYY');

  // Personal Targets state
  const { personalTargets: targetMap, setPersonalTarget } = usePreferences();
  const personalTargets = useMemo<PersonalTarget[]>(
    () =>
      BIOMARKER_DEFINITIONS.map((biomarker) =>
        toPersonalTarget(biomarker, targetMap[biomarker.key])
      ),
    [targetMap]
  );
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
          await db.updatePreferences(() => ({ theme: savedTheme, dateFormat: savedDateFormat }));
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
      if (aiProvider === 'ollama') {
        return await testProviderConnection('ollama', { model: ollamaModel });
      }

      const apiKey = await getApiKey();
      if (!apiKey) {
        return false;
      }
      const model = modelForProvider(aiProvider, { openaiModel, anthropicModel });
      return await testProviderConnection(aiProvider, { apiKey, model });
    } catch {
      return false;
    } finally {
      setAiTestInProgress(false);
    }
  }, [aiProvider, getApiKey, ollamaModel, openaiModel, anthropicModel]);

  /**
   * Save a display setting shown already. One that is not saved goes back
   * (unless a newer change replaced it), the user is told why, and the
   * rejection tells DisplaySettings not to confirm it.
   */
  const saveDisplaySetting = useCallback(
    async <T,>(
      what: string,
      value: T,
      previous: T,
      setValue: Dispatch<SetStateAction<T>>,
      changes: Partial<Pick<UserPreferences, 'theme' | 'dateFormat'>>
    ): Promise<void> => {
      setValue(value);
      if (!db || !isReady) return;
      try {
        await db.updatePreferences(() => changes);
      } catch (err) {
        setValue((current) => (current === value ? previous : current));
        notifySaveFailed(`${what} not saved`, err);
        throw err;
      }
    },
    [db, isReady]
  );

  const handleThemeChange = useCallback(
    (newTheme: ThemeOption) =>
      saveDisplaySetting('Theme', newTheme, theme, setTheme, { theme: newTheme }),
    [saveDisplaySetting, theme]
  );

  const handleDateFormatChange = useCallback(
    (newFormat: DateFormatOption) =>
      saveDisplaySetting('Date format', newFormat, dateFormat, setDateFormat, {
        dateFormat: newFormat,
      }),
    [saveDisplaySetting, dateFormat]
  );

  const saveTarget = useCallback(
    async (biomarkerKey: string, target: { low?: number; high?: number } | null) => {
      setIsSavingTargets(true);
      try {
        await setPersonalTarget(biomarkerKey, target);
      } catch (err) {
        notifySaveFailed('Personal target not saved', err);
        // Passed on so the targets list does not confirm the save
        throw err;
      } finally {
        setIsSavingTargets(false);
      }
    },
    [setPersonalTarget]
  );

  const handleSetTarget = useCallback(
    (biomarkerKey: string, low: number | undefined, high: number | undefined) =>
      saveTarget(biomarkerKey, { low, high }),
    [saveTarget]
  );

  const handleClearTarget = useCallback(
    (biomarkerKey: string) => saveTarget(biomarkerKey, null),
    [saveTarget]
  );

  return (
    <Stack gap="lg">
      <Title order={2}>Settings</Title>

      <Tabs defaultValue="data" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="data" leftSection={<IconDatabase size={16} />}>
            Data
          </Tabs.Tab>
          <Tabs.Tab value="security" leftSection={<IconLock size={16} />}>
            Security
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
          <Tabs.Tab value="biomarkers" leftSection={<IconBook size={16} />}>
            Biomarkers
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="data" pt="md">
          <Stack gap="lg">
            <StorageSettings />
            <BackupRestore
              dataSources={dataSources}
              loadDataSources={loadDataSources}
              getApiKey={getApiKey}
              onRestore={onRestore}
              hasApiKey={hasApiKey}
              // Ollama runs locally and needs no key, but is still a setup to keep
              hasAIConfiguration={hasApiKey || aiProvider === 'ollama'}
              isProcessing={isRestoring || isLoading}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="security" pt="md">
          <ChangePassword />
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

        <Tabs.Panel value="biomarkers" pt="md">
          <LearnedAliases />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
