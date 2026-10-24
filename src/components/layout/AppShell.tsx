import { useState, useCallback, useEffect } from 'react';
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
  Center,
  Loader,
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
  useAISettings,
  useLegacyKeyReconciliation,
  useAlerts,
  usePreferences,
} from '@hooks';
import { ImportWizard, type ReviewedResult } from '@components/import';
import { TimelineView } from '@components/timeline';
import { TrendsView } from '@components/trends';
import { AlertsView } from '@components/alerts';
import { NotesView } from '@components/notes';
import { SettingsPage } from '@components/settings';
import { ExportDialog } from '@components/export';
import { BiomarkerDictionary, BiomarkerDetail } from '@components/dictionary';
import { saveImportResults } from '@services/persistence';
import { restoreAISettings, restoreBackup } from '@services/import';
import type { ParsedBackupData } from '@services/import';
import type { RestoreOptions } from '@components/settings';
import type { BiomarkerDefinition } from '@data/biomarkers';

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
  const { dataSources, labResultsData, biomarkerOptions, refresh: refreshExportData } = useExportData();
  const { isReconciling } = useLegacyKeyReconciliation();
  const { setAiProvider, setOpenaiModel, setAnthropicModel, setOllamaModel } = useAISettings();
  const { setApiKey } = useEncryptedApiKey();
  const { unacknowledgedCount: alertCount, refresh: refreshAlerts } = useAlerts();
  const { reload: reloadPreferences } = usePreferences();
  const [trendFocus, setTrendFocus] = useState<TrendFocus | null>(null);
  const [timelineFocus, setTimelineFocus] = useState<number | null>(null);

  // The badge's data must follow imports, restores and deletions made in other views
  useEffect(() => {
    void refreshAlerts();
  }, [activeView, refreshAlerts]);

  // Export data loads on mount; reload it once stored keys are reconciled
  useEffect(() => {
    if (!isReconciling) {
      void refreshExportData();
    }
  }, [isReconciling, refreshExportData]);
  const { syncNow } = useFilesystemSync();

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
    [db, isReady, syncNow]
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
    async (data: ParsedBackupData, options: RestoreOptions) => {
      if (!db || !isReady) {
        throw new Error('Database not available');
      }

      setIsRestoring(true);

      try {
        const restored = await restoreBackup(db, data);
        // A backup can bring unit preferences and personal targets
        await reloadPreferences();
        if (options.restoreAISettings) {
          await restoreAISettings(data, {
            setAiProvider,
            setOpenaiModel,
            setAnthropicModel,
            setOllamaModel,
            setApiKey,
          });
        }

        // Refresh export data
        await refreshExportData();

        // Sync to filesystem if enabled
        await syncNow();

        notifications.show({
          title: 'Restore Complete',
          message: `Restored ${restored.labResults} lab result(s), ${restored.testValues} test value(s), and ${restored.notes} note(s).`,
          color: 'green',
          icon: <IconCheck size={16} />,
        });

        // Navigate to timeline to show restored data
        setActiveView('timeline');
      } catch (err) {
        console.error('Restore error:', err);
        notifications.show({
          title: 'Restore Failed',
          message: err instanceof Error ? err.message : 'Failed to restore data.',
          color: 'red',
          icon: <IconX size={16} />,
        });
        throw err;
      } finally {
        setIsRestoring(false);
      }
    },
    [
      db,
      isReady,
      reloadPreferences,
      refreshExportData,
      syncNow,
      setAiProvider,
      setOpenaiModel,
      setAnthropicModel,
      setOllamaModel,
      setApiKey,
    ]
  );

  return (
    <>
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
            {NAV_ITEMS.filter((item) => item.view !== 'settings').map((item) => (
              <NavLink
                key={item.view}
                // Without an href NavLink renders a bare <a>, which has no role
                // and cannot be reached with Tab
                component="button"
                rightSection={
                  item.view === 'alerts' && alertCount > 0 ? (
                    <Badge color="red" variant="filled" size="sm">
                      {alertCount}
                    </Badge>
                  ) : undefined
                }
                label={
                  item.view === 'alerts' && alertCount > 0 ? (
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
            ))}

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
          {isReconciling ? (
            <Center h="50vh">
              <Loader aria-label="Preparing your data" />
            </Center>
          ) : children ?? (
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
    // Get the model for the selected provider
    let aiModel: string | undefined;
    if (aiProvider === 'ollama') {
      aiModel = ollamaModel;
    } else if (aiProvider === 'openai') {
      aiModel = openaiModel;
    } else if (aiProvider === 'anthropic') {
      aiModel = anthropicModel;
    }

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
            Please configure your AI API key in Settings before importing lab
            reports.
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
            Please select a model in Settings → AI Configuration before importing lab
            reports.
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
    return <DictionaryView />;
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

/**
 * Dictionary view with biomarker browser and detail panel
 */
function DictionaryView(): React.ReactNode {
  const [selectedBiomarker, setSelectedBiomarker] = useState<BiomarkerDefinition | null>(null);

  const handleSelectBiomarker = useCallback((biomarker: BiomarkerDefinition) => {
    setSelectedBiomarker(biomarker);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedBiomarker(null);
  }, []);

  return (
    <Group align="flex-start" gap="md" wrap="nowrap" style={{ height: '100%' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <BiomarkerDictionary
          onSelectBiomarker={handleSelectBiomarker}
          selectedBiomarker={selectedBiomarker?.name}
        />
      </div>
      {selectedBiomarker && (
        <div style={{ width: 400, flexShrink: 0 }}>
          <BiomarkerDetail
            biomarker={selectedBiomarker}
            onClose={handleCloseDetail}
          />
        </div>
      )}
    </Group>
  );
}
