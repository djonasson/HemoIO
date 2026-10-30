import { useState, useCallback } from 'react';
import {
  AppShell as MantineAppShell,
  Burger,
  Group,
  NavLink,
  Title,
  ActionIcon,
  Tooltip,
  Text,
  Divider,
  Stack,
  Badge,
  VisuallyHidden,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconTimeline,
  IconUpload,
  IconChartLine,
  IconBell,
  IconNotes,
  IconSettings,
  IconLock,
  IconBook,
  IconCheck,
  IconX,
  IconDownload,
} from '@tabler/icons-react';
import { useAuth } from '@contexts';
import {
  useEncryptedDb,
  useExportData,
  useEncryptedApiKey,
  useFilesystemSync,
  useFolderRestore,
  useAISettings,
  useAlerts,
  useAlertState,
  useLabResults,
  usePreferences,
} from '@hooks';
import { ImportWizard, type ReviewedResult } from '@components/import';
import { TimelineView } from '@components/timeline';
import { TrendsView } from '@components/trends';
import { AlertsView } from '@components/alerts';
import { NotesView } from '@components/notes';
import { SettingsPage } from '@components/settings';
import { ExportDialog } from '@components/export';
import { DictionaryView } from '@components/dictionary';
import { FolderRestoreModal } from '@components/storage';
import { saveImportResults } from '@services/persistence';
import { modelForProvider } from '@services/ai';
import { restoreAISettings, restoreBackup, runAfterRestore } from '@services/import';
import type { ParsedBackupData } from '@services/import';
import type { RestoreOptions } from '@components/settings';
import type { FolderRestoreDecision } from '@hooks';

type View = 'timeline' | 'import' | 'trends' | 'alerts' | 'notes' | 'dictionary' | 'settings';

interface TrendFocus {
  biomarkerKey: string;
  /** Date of the data point to highlight, if any */
  date?: Date;
}

interface AppShellProps {
  children?: React.ReactNode;
}

const NAV_ITEMS: Array<{
  view: View;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    view: 'timeline',
    label: 'Timeline',
    icon: <IconTimeline size={20} />,
    description: 'View your lab results history',
  },
  {
    view: 'import',
    label: 'Import',
    icon: <IconUpload size={20} />,
    description: 'Import new lab results',
  },
  {
    view: 'trends',
    label: 'Trends',
    icon: <IconChartLine size={20} />,
    description: 'Analyze trends over time',
  },
  {
    view: 'alerts',
    label: 'Alerts',
    icon: <IconBell size={20} />,
    description: 'Abnormal values and trends',
  },
  {
    view: 'notes',
    label: 'Notes',
    icon: <IconNotes size={20} />,
    description: 'All your notes',
  },
  {
    view: 'dictionary',
    label: 'Biomarkers',
    icon: <IconBook size={20} />,
    description: 'Browse biomarker reference',
  },
  {
    view: 'settings',
    label: 'Settings',
    icon: <IconSettings size={20} />,
    description: 'App settings and preferences',
  },
];

export function AppShell({ children }: AppShellProps): React.ReactNode {
  const { lock } = useAuth();
  const { db, isReady } = useEncryptedDb();
  const [opened, { toggle, close }] = useDisclosure();
  const [activeView, setActiveView] = useState<View>('timeline');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  // Loaded when the export dialog opens, so an export has what is stored now
  const {
    dataSources,
    labResultsData,
    biomarkerOptions,
    isLoading: isLoadingExportData,
  } = useExportData({
    enabled: exportDialogOpen,
  });
  const { setAiProvider, setOpenaiModel, setAnthropicModel, setOllamaModel } = useAISettings();
  const { setApiKey } = useEncryptedApiKey();
  const { unacknowledgedCount: alertCount } = useAlerts();
  const { refresh: refreshLabResults } = useLabResults();
  const { reload: reloadPreferences, learnAliases } = usePreferences();
  const { reload: reloadAlertState } = useAlertState();
  const [trendFocus, setTrendFocus] = useState<TrendFocus | null>(null);
  const [timelineFocus, setTimelineFocus] = useState<number | null>(null);

  // Folder sync waits until the copy in the folder is known to be safe to replace
  const folderRestore = useFolderRestore();
  const { syncNow } = useFilesystemSync({ enabled: folderRestore.syncAllowed });
  const folderSyncHeld = folderRestore.syncHeld;

  const handleNavClick = useCallback(
    (view: View) => {
      setActiveView(view);
      setTrendFocus(null);
      setTimelineFocus(null);
      close();
    },
    [close]
  );

  const handleOpenTrend = useCallback((biomarkerKey: string, date?: Date) => {
    setTrendFocus({ biomarkerKey, date });
    setActiveView('trends');
  }, []);

  const handleOpenLabResult = useCallback((labResultId: number) => {
    setTimelineFocus(labResultId);
    setActiveView('timeline');
  }, []);

  const handleLock = useCallback(() => {
    lock();
  }, [lock]);

  const handleImportComplete = useCallback(
    async (results: ReviewedResult[]) => {
      if (!db || !isReady) {
        notifications.show({
          title: 'Error',
          message: 'Database not available. Please try again.',
          color: 'red',
          icon: <IconX size={16} />,
        });
        return;
      }

      try {
        const output = await saveImportResults(results, db);

        if (output.errors.length > 0) {
          // Partial success
          notifications.show({
            title: 'Import Partially Complete',
            message: `Saved ${output.totalLabResults} lab result(s) with ${output.totalTestValues} test value(s). ${output.errors.length} file(s) failed.`,
            color: 'yellow',
            icon: <IconCheck size={16} />,
          });
        } else {
          // Full success
          notifications.show({
            title: 'Import Complete',
            message: `Successfully saved ${output.totalLabResults} lab result(s) with ${output.totalTestValues} test value(s).`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
        }

        // Names saved under a test are this user's aliases from now on
        await learnAliases(
          results.flatMap((r) =>
            r.editedBiomarkers.map((b) => ({
              name: b.name,
              key: b.dictionaryMatch?.key,
              pickedByUser: b.identifiedBy === 'user',
              savedAsUnknown: b.savedAsUnknown,
            }))
          )
        ).catch(() => console.error('Failed to save learned names'));

        // Every view, the alerts badge included, shows the new results
        await refreshLabResults();

        // Sync to filesystem if enabled
        await syncNow();

        // Navigate to timeline to show the imported results
        setActiveView('timeline');
      } catch (err) {
        console.error('Import save error:', err);
        notifications.show({
          title: 'Import Failed',
          message: err instanceof Error ? err.message : 'Failed to save import results.',
          color: 'red',
          icon: <IconX size={16} />,
        });
      }
    },
    [db, isReady, syncNow, refreshLabResults, learnAliases]
  );

  const handleNavigateToImport = useCallback(() => {
    setActiveView('import');
  }, []);

  const handleOpenExport = useCallback(() => {
    setExportDialogOpen(true);
  }, []);

  const handleCloseExport = useCallback(() => {
    setExportDialogOpen(false);
  }, []);

  const handleRestore = useCallback(
    // Callers show a failure themselves, where the restore was asked for
    async (data: ParsedBackupData, options: RestoreOptions) => {
      if (!db || !isReady) {
        throw new Error('Database not available');
      }

      setIsRestoring(true);

      try {
        const restored = await restoreBackup(db, data);

        // The data is replaced: from here on a failure is not a failed restore
        const failed = await runAfterRestore([
          // A backup can bring unit preferences, personal targets and acknowledgements
          { name: 'loading your preferences', run: reloadPreferences },
          { name: 'loading your alert acknowledgements', run: reloadAlertState },
          ...(options.restoreAISettings
            ? [
                {
                  name: 'applying the AI configuration',
                  run: () =>
                    restoreAISettings(data, {
                      setAiProvider,
                      setOpenaiModel,
                      setAnthropicModel,
                      setOllamaModel,
                      setApiKey,
                    }),
                },
              ]
            : []),
          { name: 'showing the restored results', run: refreshLabResults },
          { name: 'syncing to your folder', run: syncNow },
        ]);

        const summary =
          `Restored ${restored.labResults} lab result(s), ${restored.testValues} test value(s), and ${restored.notes} note(s).` +
          // The sync step "succeeds" without writing while sync is held
          (folderSyncHeld ? ' Folder sync is paused, so your folder was not updated.' : '');
        notifications.show(
          failed.length === 0
            ? {
                title: 'Restore Complete',
                message: summary,
                color: 'green',
                icon: <IconCheck size={16} />,
              }
            : {
                title: 'Data Restored, With Problems',
                message: `${summary} Failed: ${failed.join(', ')}. Reload the page to see everything restored.`,
                color: 'yellow',
              }
        );

        // Navigate to timeline to show restored data
        setActiveView('timeline');
      } catch (err) {
        console.error('Restore error:', err);
        throw err;
      } finally {
        setIsRestoring(false);
      }
    },
    [
      db,
      isReady,
      reloadPreferences,
      reloadAlertState,
      refreshLabResults,
      syncNow,
      folderSyncHeld,
      setAiProvider,
      setOpenaiModel,
      setAnthropicModel,
      setOllamaModel,
      setApiKey,
    ]
  );

  const handleFolderRestore = useCallback(
    // The folder copy has no AI configuration to restore
    (data: ParsedBackupData) => handleRestore(data, { restoreAISettings: false }),
    [handleRestore]
  );

  const { decide: decideFolderRestore } = folderRestore;
  const handleFolderDecision = useCallback(
    (decision: FolderRestoreDecision) => {
      decideFolderRestore(decision);
      if (decision === 'hold') {
        notifications.show({
          title: 'Folder Sync Paused',
          message:
            'Nothing is saved to your folder for now, and the copy there is unchanged. HemoIO asks again when you next unlock, or when you grant folder access or choose a folder in Settings.',
          color: 'yellow',
        });
      }
    },
    [decideFolderRestore]
  );

  return (
    <>
      <FolderRestoreModal
        prompt={folderRestore.prompt}
        onRestore={handleFolderRestore}
        onDecide={handleFolderDecision}
      />

      <MantineAppShell
        header={{ height: 60 }}
        navbar={{
          width: 260,
          breakpoint: 'sm',
          collapsed: { mobile: !opened },
        }}
        padding="md"
      >
        <MantineAppShell.Header>
          <Group h="100%" px="md" justify="space-between">
            <Group>
              <Burger
                opened={opened}
                onClick={toggle}
                hiddenFrom="sm"
                size="sm"
                aria-label="Toggle navigation"
              />
              <Title order={3}>HemoIO</Title>
            </Group>

            <Group>
              <Tooltip label="Export data" position="bottom">
                <ActionIcon
                  variant="subtle"
                  onClick={handleOpenExport}
                  aria-label="Export data"
                  size="lg"
                >
                  <IconDownload size={20} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Lock application" position="bottom">
                <ActionIcon
                  variant="subtle"
                  onClick={handleLock}
                  aria-label="Lock application"
                  size="lg"
                >
                  <IconLock size={20} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </MantineAppShell.Header>

        <MantineAppShell.Navbar p="md">
          <Stack gap="xs">
            {NAV_ITEMS.filter((item) => item.view !== 'settings').map((item) => {
              const showAlertCount = item.view === 'alerts' && alertCount > 0;
              return (
                <NavLink
                  key={item.view}
                  // Without an href NavLink renders a bare <a>, which has no role
                  // and cannot be reached with Tab
                  component="button"
                  rightSection={
                    showAlertCount ? (
                      <Badge color="red" variant="filled" size="sm">
                        {alertCount}
                      </Badge>
                    ) : undefined
                  }
                  label={
                    showAlertCount ? (
                      <>
                        {item.label}
                        <VisuallyHidden>, {alertCount} abnormal values</VisuallyHidden>
                      </>
                    ) : (
                      item.label
                    )
                  }
                  description={item.description}
                  leftSection={item.icon}
                  active={activeView === item.view}
                  onClick={() => handleNavClick(item.view)}
                  aria-current={activeView === item.view ? 'page' : undefined}
                />
              );
            })}

            <Divider my="sm" />

            <NavLink
              component="button"
              label="Settings"
              description="App settings and preferences"
              leftSection={<IconSettings size={20} />}
              active={activeView === 'settings'}
              onClick={() => handleNavClick('settings')}
              aria-current={activeView === 'settings' ? 'page' : undefined}
            />
          </Stack>
        </MantineAppShell.Navbar>

        <MantineAppShell.Main>
          {children ?? (
            <MainContent
              view={activeView}
              onImportComplete={handleImportComplete}
              onNavigateToImport={handleNavigateToImport}
              onNavigate={handleNavClick}
              trendFocus={trendFocus}
              onOpenTrend={handleOpenTrend}
              timelineFocus={timelineFocus}
              onOpenLabResult={handleOpenLabResult}
              onRestore={handleRestore}
              isRestoring={isRestoring}
            />
          )}
        </MantineAppShell.Main>
      </MantineAppShell>

      <ExportDialog
        opened={exportDialogOpen}
        onClose={handleCloseExport}
        labResultsData={labResultsData}
        fullDataSources={dataSources}
        isLoading={isLoadingExportData}
        biomarkerOptions={biomarkerOptions}
      />
    </>
  );
}

interface MainContentProps {
  view: View;
  onImportComplete: (results: ReviewedResult[]) => void;
  onNavigateToImport: () => void;
  onNavigate: (view: View) => void;
  trendFocus: TrendFocus | null;
  onOpenTrend: (biomarkerKey: string, date?: Date) => void;
  timelineFocus: number | null;
  onOpenLabResult: (labResultId: number) => void;
  onRestore: (data: ParsedBackupData, options: RestoreOptions) => Promise<void>;
  isRestoring: boolean;
}

function MainContent({
  view,
  onImportComplete,
  onNavigateToImport,
  onNavigate,
  trendFocus,
  onOpenTrend,
  timelineFocus,
  onOpenLabResult,
  onRestore,
  isRestoring,
}: MainContentProps): React.ReactNode {
  const viewInfo = NAV_ITEMS.find((item) => item.view === view);
  const { hasApiKey, getApiKey, isLoading: isLoadingApiKey } = useEncryptedApiKey();
  const {
    aiProvider,
    ollamaModel,
    openaiModel,
    anthropicModel,
    isLoading: isLoadingAISettings,
  } = useAISettings();

  // Render TimelineView for the timeline view
  if (view === 'timeline') {
    return (
      <TimelineView
        // A new focus remounts the view so the focused result opens expanded
        key={timelineFocus ?? 'timeline'}
        onNavigateToImport={onNavigateToImport}
        focusLabResultId={timelineFocus ?? undefined}
      />
    );
  }

  // Render ImportWizard for the import view
  if (view === 'import') {
    const aiModel = modelForProvider(aiProvider, { ollamaModel, openaiModel, anthropicModel });

    // Check if AI is properly configured
    // Ollama doesn't require an API key, but other providers do
    const isAiConfigured = aiProvider === 'ollama' || hasApiKey;

    // Show loading state while checking API key or AI settings
    if ((isLoadingApiKey && aiProvider !== 'ollama') || isLoadingAISettings) {
      return (
        <Stack align="center" justify="center" h="50vh" gap="md">
          <Text size="xl" fw={500}>
            Loading...
          </Text>
        </Stack>
      );
    }

    if (!isAiConfigured) {
      return (
        <Stack align="center" justify="center" h="50vh" gap="md">
          <Text size="xl" fw={500}>
            AI Configuration Required
          </Text>
          <Text c="dimmed">
            Please configure your AI API key in Settings before importing lab reports.
          </Text>
        </Stack>
      );
    }

    // Cloud providers have no built-in default model: the user must pick one
    if (aiProvider !== 'ollama' && !aiModel) {
      return (
        <Stack align="center" justify="center" h="50vh" gap="md">
          <Title order={2} size="h3">
            Model Selection Required
          </Title>
          <Text c="dimmed" ta="center">
            Please select a model in Settings → AI Configuration before importing lab reports.
          </Text>
        </Stack>
      );
    }

    return (
      <ImportWizard
        aiProvider={aiProvider}
        getApiKey={getApiKey}
        aiModel={aiModel}
        onComplete={onImportComplete}
      />
    );
  }

  // Render TrendsView for the trends view
  if (view === 'trends') {
    return (
      <TrendsView
        // A new focus remounts the view so it opens on the focused biomarker
        key={
          trendFocus
            ? `${trendFocus.biomarkerKey}-${trendFocus.date?.getTime() ?? 'all'}`
            : 'trends'
        }
        onNavigateToImport={onNavigateToImport}
        onNavigateToAlerts={() => onNavigate('alerts')}
        initialBiomarkerKey={trendFocus?.biomarkerKey}
        highlightDate={trendFocus?.date}
      />
    );
  }

  if (view === 'alerts') {
    return <AlertsView onOpenTrend={onOpenTrend} />;
  }

  if (view === 'notes') {
    return <NotesView onOpenLabResult={onOpenLabResult} onOpenTrend={onOpenTrend} />;
  }

  // Render SettingsPage for the settings view
  if (view === 'settings') {
    return <SettingsPage onRestore={onRestore} isRestoring={isRestoring} />;
  }

  // Render BiomarkerDictionary for the dictionary view
  if (view === 'dictionary') {
    return <DictionaryView onOpenTrend={(biomarkerKey) => onOpenTrend(biomarkerKey)} />;
  }

  // Placeholder for other views
  return (
    <Stack align="center" justify="center" h="50vh" gap="md">
      <Text size="xl" fw={500}>
        {viewInfo?.label ?? 'Unknown'}
      </Text>
      <Text c="dimmed">{viewInfo?.description ?? ''}</Text>
      <Text size="sm" c="dimmed">
        This view will be implemented in a future phase.
      </Text>
    </Stack>
  );
}
