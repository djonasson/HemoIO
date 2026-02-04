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
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconTimeline,
  IconUpload,
  IconChartLine,
  IconSettings,
  IconLock,
  IconBook,
  IconCheck,
  IconX,
  IconDownload,
} from '@tabler/icons-react';
import { useAuth } from '@contexts';
import { useEncryptedDb, useExportData, useEncryptedApiKey, useFilesystemSync, useAISettings } from '@hooks';
import { ImportWizard, type ReviewedResult } from '@components/import';
import { TimelineView } from '@components/timeline';
import { TrendsView } from '@components/trends';
import { SettingsPage } from '@components/settings';
import { ExportDialog } from '@components/export';
import { BiomarkerDictionary, BiomarkerDetail } from '@components/dictionary';
import { saveImportResults } from '@services/persistence';
import type { ParsedBackupData } from '@services/import';
import type { BiomarkerDefinition } from '@data/biomarkers';

type View = 'timeline' | 'import' | 'trends' | 'dictionary' | 'settings';

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
  const { syncNow } = useFilesystemSync();

  const handleNavClick = useCallback(
    (view: View) => {
      setActiveView(view);
      close();
    },
    [close]
  );

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
    async (data: ParsedBackupData) => {
      if (!db || !isReady) {
        throw new Error('Database not available');
      }

      setIsRestoring(true);

      try {
        // Clear existing data
        await db.clearAllData();

        // Restore lab results (strip id to get new ones assigned)
        for (const labResult of data.labResults) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: _, ...labResultData } = labResult;
          await db.addLabResult(labResultData);
        }

        // Build ID mapping for test values
        const oldLabResults = data.labResults;
        const newLabResults = await db.getAllLabResults();
        const labResultIdMap = new Map<number, number>();

        // Map old IDs to new IDs based on position/date match
        for (let i = 0; i < oldLabResults.length; i++) {
          const oldResult = oldLabResults[i];
          const matchingNew = newLabResults.find(
            (n) =>
              n.date.getTime() === new Date(oldResult.date).getTime() &&
              n.labName === oldResult.labName
          );
          if (matchingNew && oldResult.id !== undefined) {
            labResultIdMap.set(oldResult.id, matchingNew.id!);
          }
        }

        // Restore test values with updated lab result IDs
        for (const testValue of data.testValues) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: __, labResultId, ...testValueData } = testValue;
          const newLabResultId = labResultIdMap.get(labResultId);
          if (newLabResultId !== undefined) {
            await db.addTestValue({
              ...testValueData,
              labResultId: newLabResultId,
            });
          }
        }

        // Restore user notes (strip id to get new ones assigned)
        for (const note of data.userNotes) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: ___, ...noteData } = note;
          await db.addUserNote(noteData);
        }

        // Refresh export data
        await refreshExportData();

        // Sync to filesystem if enabled
        await syncNow();

        notifications.show({
          title: 'Restore Complete',
          message: `Restored ${data.labResults.length} lab result(s), ${data.testValues.length} test value(s), and ${data.userNotes.length} note(s).`,
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
    [db, isReady, refreshExportData, syncNow]
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
            {NAV_ITEMS.slice(0, 4).map((item) => (
              <NavLink
                key={item.view}
                label={item.label}
                description={item.description}
                leftSection={item.icon}
                active={activeView === item.view}
                onClick={() => handleNavClick(item.view)}
                aria-current={activeView === item.view ? 'page' : undefined}
              />
            ))}

            <Divider my="sm" />

            <NavLink
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
  onRestore: (data: ParsedBackupData) => Promise<void>;
  isRestoring: boolean;
}

function MainContent({
  view,
  onImportComplete,
  onNavigateToImport,
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
    return <TimelineView onNavigateToImport={onNavigateToImport} />;
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
    return <TrendsView onNavigateToImport={onNavigateToImport} />;
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
