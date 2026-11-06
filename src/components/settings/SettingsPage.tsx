/**
 * SettingsPage Component
 *
 * Main settings page containing all application settings sections.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Stack, Title, Tabs, useMantineColorScheme } from '@mantine/core';
import {
  IconDatabase,
  IconLock,
  IconRobot,
  IconSettings,
  IconTarget,
  IconBook,
  IconInfoCircle,
} from '@tabler/icons-react';
import { notifySaveFailed } from '@components/common/notifySaveFailed';
import { BackupRestore } from './BackupRestore';
import { ChangePassword } from './ChangePassword';
import { DisplaySettings } from './DisplaySettings';
import { AISettings } from './AISettings';
import { PersonalTargets } from './PersonalTargets';
import { LearnedTests } from './LearnedTests';
import { AboutSettings } from './AboutSettings';
import { toPersonalTarget, type PersonalTarget } from './personalTarget';
import { StorageSettings } from './StorageSettings';
import {
  useExportData,
  useEncryptedDb,
  useEncryptedApiKey,
  useAISettings,
  usePreferences,
} from '@hooks';
import { useCatalog } from '@contexts/useCatalog';
import { TEST_ADDONS } from '@data/loinc/addons';
import { testKey } from '@data/loinc/display';
import { modelForProvider, testProviderConnection } from '@services/ai';
import type { ParsedBackupData } from '@services/import';
import type { RestoreOptions } from './BackupRestore';

/**
 * Theme options
 */
type ThemeOption = 'light' | 'dark' | 'system';

/**
 * Date format options
 */
type DateFormatOption = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

interface DisplayValues {
  theme: ThemeOption;
  dateFormat: DateFormatOption;
}

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
  const { dataSources, setAside, isLoading, refresh: loadDataSources } = useExportData();
  const { db, isReady } = useEncryptedDb();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
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
  // Until the stored theme is read, the one in use (the stored one when it cannot be read)
  const [theme, setTheme] = useState<ThemeOption>(colorScheme === 'auto' ? 'system' : colorScheme);
  const [dateFormat, setDateFormat] = useState<DateFormatOption>('MM/DD/YYYY');
  // The display settings shown, and those stored: a failed save shows the
  // stored one again, as the one shown before it may not have been saved either
  const shownDisplay = useRef<DisplayValues>({ theme, dateFormat });
  const storedDisplay = useRef<DisplayValues>({ theme, dateFormat });
  // The colors in use with the stored theme: not always its own, as the app
  // starts with the colors last applied, not with the stored theme
  const storedScheme = useRef(colorScheme);

  // Personal Targets state
  const catalog = useCatalog();
  const { personalTargets: targetMap, setPersonalTarget } = usePreferences();
  // The tests HemoIO describes, and any other test the user set a target for
  const personalTargets = useMemo<PersonalTarget[]>(() => {
    // Targets are kept under test keys: a LOINC group, or a code alone in none
    const keys = new Set(
      [...Object.keys(TEST_ADDONS), ...Object.keys(targetMap)]
        .filter((key) => catalog.groupCodes(catalog.trendGroup(key)).length > 0)
        .map((key) => testKey(catalog, key))
    );
    return [...keys]
      .map((key) => toPersonalTarget(catalog, key, targetMap[key]))
      .sort((a, b) => a.biomarkerName.localeCompare(b.biomarkerName));
  }, [catalog, targetMap]);
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
        shownDisplay.current = { theme: savedTheme, dateFormat: savedDateFormat };
        storedDisplay.current = shownDisplay.current;

        // Migrate localStorage to IndexedDB if needed
        if (lsDateFormat || lsTheme) {
          await db.updatePreferences(() => ({ theme: savedTheme, dateFormat: savedDateFormat }));
          // Clean up localStorage after migration
          localStorage.removeItem('hemoio_date_format');
          localStorage.removeItem('hemoio_theme');
        }
      } catch (err) {
        console.error('Failed to load display settings:', err);
      }
    }

    loadDisplaySettings();
  }, [db, isReady]);

  // Handle API key change (async because of encryption)
  const handleApiKeyChange = useCallback(
    async (apiKey: string) => {
      try {
        if (apiKey) {
          await saveEncryptedApiKey(apiKey);
        } else {
          removeApiKey();
        }
      } catch (err) {
        notifySaveFailed('API key not saved', err);
        throw err;
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
   * Show a display setting at once, then save it. One that is not saved goes
   * back to the stored one (unless a newer change replaced it), the user is
   * told why, and the rejection tells DisplaySettings not to confirm it.
   */
  const saveDisplaySetting = useCallback(
    async <K extends keyof DisplayValues>(
      what: string,
      field: K,
      value: DisplayValues[K],
      show: (value: DisplayValues[K]) => void
    ): Promise<void> => {
      shownDisplay.current = { ...shownDisplay.current, [field]: value };
      show(value);
      try {
        if (db && isReady) await db.updatePreferences(() => ({ [field]: value }));
        storedDisplay.current = { ...storedDisplay.current, [field]: value };
      } catch (err) {
        if (shownDisplay.current[field] === value) {
          const before = storedDisplay.current[field];
          shownDisplay.current = { ...shownDisplay.current, [field]: before };
          show(before);
        }
        notifySaveFailed(`${what} not saved`, err);
        throw err;
      }
    },
    [db, isReady]
  );

  const handleThemeChange = useCallback(
    async (newTheme: ThemeOption) => {
      const scheme = newTheme === 'system' ? 'auto' : newTheme;
      await saveDisplaySetting('Theme', 'theme', newTheme, (value) => {
        setTheme(value);
        // Put back, the colors go back to those in use before
        setColorScheme(value === newTheme ? scheme : storedScheme.current);
      });
      storedScheme.current = scheme;
    },
    [saveDisplaySetting, setColorScheme]
  );

  const handleDateFormatChange = useCallback(
    (newFormat: DateFormatOption) =>
      saveDisplaySetting('Date format', 'dateFormat', newFormat, setDateFormat),
    [saveDisplaySetting]
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
          <Tabs.Tab value="about" leftSection={<IconInfoCircle size={16} />}>
            About
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="data" pt="md">
          <Stack gap="lg">
            <StorageSettings onRestore={onRestore} setAsideCount={setAside.total} />
            <BackupRestore
              dataSources={dataSources}
              loadDataSources={loadDataSources}
              getApiKey={getApiKey}
              onRestore={onRestore}
              hasApiKey={hasApiKey}
              // Ollama runs locally and needs no key, but is still a setup to keep
              hasAIConfiguration={hasApiKey || aiProvider === 'ollama'}
              isProcessing={isRestoring || isLoading}
              setAsideCount={setAside.total}
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
          <LearnedTests />
        </Tabs.Panel>

        <Tabs.Panel value="about" pt="md">
          <AboutSettings />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
