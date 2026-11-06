import { useCallback, useState } from 'react';
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
  IconDownload,
} from '@tabler/icons-react';
import { useAuth } from '@contexts';
import {
  useEncryptedDb,
  useExportData,
  useEncryptedApiKey,
  useFilesystemSync,
  useFolderSyncNotice,
  useFolderRestore,
  useAISettings,
  useAlerts,
  useAlertState,
  useLabResults,
  usePreferences,
  useSaveImport,
  useNavigation,
  useSetAsideRecords,
  useFolderStorageOn,
} from '@hooks';
import { ImportWizard, type ReviewedResult } from '@components/import';
import { TimelineView } from '@components/timeline';
import { TrendsView } from '@components/trends';
import { AlertsView } from '@components/alerts';
import { NotesView } from '@components/notes';
import { SettingsPage } from '@components/settings';
import { ExportDialog } from '@components/export';
import { DictionaryView } from '@components/dictionary';
import { FolderConflictModal, FolderRestoreModal, SetAsideBanner } from '@components/storage';
import { modelForProvider } from '@services/ai';
import type { SavePlan } from '@services/analysis/reviewedSave';
import { notifySaveFailed } from '@components/common/notifySaveFailed';
import {
  afterRestoreAdvice,
  restoreAISettings,
  restoreBackup,
  restoreBackupIfUnchanged,
  runAfterRestore,
  type AfterRestoreStep,
} from '@services/import';
import { HEADER_HEIGHT } from './headerHeight';
import type { ParsedBackupData } from '@services/import';
import type { RestoreOptions } from '@components/settings';
import type { AppView, FolderConflictChoice, FolderRestoreDecision, ViewFocus } from '@hooks';

interface AppShellProps {
  children?: React.ReactNode;
}

/** Told when the user holds folder sync: after "Not now", or "Decide later" */
const FOLDER_SYNC_PAUSED_NOTICE = {
  title: 'Folder Sync Paused',
  message:
    'Nothing is saved to your folder for now, and the copy there is unchanged. HemoIO asks again when you next unlock, or when you grant folder access or choose a folder in Settings.',
  color: 'yellow',
} as const;

const NAV_ITEMS: Array<{
  view: AppView;
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
  const { view: activeView, focus, visit, go: openView } = useNavigation();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  // While an import saves, the user stays on its confirm step: leaving would
  // drop the reviewed values a failed save needs to be tried again
  const [isSavingImport, setIsSavingImport] = useState(false);
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
  const setAsideRecords = useSetAsideRecords();
  const folderStorageOn = useFolderStorageOn();
  const { setAiProvider, setOpenaiModel, setAnthropicModel, setOllamaModel } = useAISettings();
  const { setApiKey } = useEncryptedApiKey();
  const { unacknowledgedCount: alertCount } = useAlerts();
  const { refresh: refreshLabResults } = useLabResults();
  const { reload: reloadPreferences } = usePreferences();
  const { reload: reloadAlertState } = useAlertState();

  // A folder copy saved on another computer replaces this browser's data. It
  // runs inside a folder sync, so it never starts one (that would wait for
  // this one to end) and leaves telling the user to the sync. Given a stamp,
  // only while the data is as stamped: false, loading nothing, otherwise.
  const applyFolderCopy = useCallback(
    async (data: ParsedBackupData, unchangedSince?: string): Promise<boolean> => {
      if (!db || !isReady) {
        throw new Error('Database not available');
      }
      if (unchangedSince === undefined) await restoreBackup(db, data);
      else if ((await restoreBackupIfUnchanged(db, data, unchangedSince)) === null) return false;
      const steps: AfterRestoreStep[] = [
        { name: 'loading your preferences', run: reloadPreferences },
        { name: 'loading your alert acknowledgements', run: reloadAlertState },
        { name: 'showing the updated results', run: refreshLabResults },
      ];
      const failed = await runAfterRestore(steps);
      if (failed.length > 0) {
        notifications.show({
          title: 'Updated From the Folder, With Problems',
          message: `Failed: ${failed.join(', ')}. ${afterRestoreAdvice(steps, failed)}`,
          color: 'yellow',
        });
      }
      return true;
    },
    [db, isReady, reloadPreferences, reloadAlertState, refreshLabResults]
  );

  // Folder sync waits until the copy in the folder is known to be safe to replace
  const folderRestore = useFolderRestore();
  const {
    syncNow,
    issue: folderSyncIssue,
    conflict: folderConflict,
    held: folderConflictHeld,
    resolveConflict,
    acknowledgeFolderCopy,
    replaceFolderCopy,
  } = useFilesystemSync({
    enabled: folderRestore.syncAllowed,
    applyFolderCopy,
  });
  useFolderSyncNotice(folderSyncIssue);
  const folderSyncHeld = folderRestore.syncHeld || folderConflictHeld;

  const handleNavClick = useCallback(
    (view: AppView) => {
      if (isSavingImport) return;
      openView(view);
      close();
    },
    [close, isSavingImport, openView]
  );

  const handleLock = useCallback(() => {
    lock();
  }, [lock]);

  const saveImport = useSaveImport(syncNow);
  const handleImportComplete = useCallback(
    async (plan: SavePlan<ReviewedResult>) => {
      setIsSavingImport(true);
      try {
        // Not saved: the wizard stays on its confirm step to try again
        if (await saveImport(plan)) openView('timeline');
      } finally {
        setIsSavingImport(false);
      }
    },
    [saveImport, openView]
  );

  const handleNavigateToImport = useCallback(() => openView('import'), [openView]);

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
        const steps: AfterRestoreStep[] = [
          // A backup can bring unit preferences, personal targets and acknowledgements
          { name: 'loading your preferences', run: reloadPreferences },
          { name: 'loading your alert acknowledgements', run: reloadAlertState },
          ...(options.restoreAISettings
            ? [
                {
                  name: 'applying the AI configuration',
                  // A reload reads the restored data again, but an AI
                  // setting that was not saved is stored nowhere to be read
                  remedy: 'Check the AI configuration in Settings.',
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
        ];
        const failed = await runAfterRestore(steps);
        // The folder sync tells of its own failure, as it does for every sync
        void syncNow().catch(() => undefined);

        const summary =
          `Restored ${restored.labResults} lab result(s), ${restored.testValues} test value(s), and ${restored.notes} note(s).` +
          // A held sync writes nothing
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
                message: `${summary} Failed: ${failed.join(', ')}. ${afterRestoreAdvice(steps, failed)}`,
                color: 'yellow',
              }
        );

        // Navigate to timeline to show restored data
        openView('timeline');
      } catch (err) {
        notifySaveFailed('Restore failed', err, 'Your data was not changed.');
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
      openView,
    ]
  );

  // A restore from a backup file in Settings is left as a change made here:
  // the next sync writes it over the copy it last saw, or asks when that copy
  // changed on another computer meanwhile. The folder copy restored here is
  // the one now in the browser, so it is recorded as seen.
  const offeredRevision = folderRestore.prompt?.kind === 'offer' ? folderRestore.prompt.revision : null;
  const handleFolderRestore = useCallback(
    async (data: ParsedBackupData) => {
      // The folder copy has no AI configuration to restore
      await handleRestore(data, { restoreAISettings: false });
      try {
        await acknowledgeFolderCopy(offeredRevision);
      } catch {
        // The restore is done; the next sync compares the data with the copy instead
        console.error('Could not record the restored folder copy as seen');
      }
    },
    [handleRestore, acknowledgeFolderCopy, offeredRevision]
  );

  // "Replace folder copy": the copy is kept as a backup first, and the next
  // sync writes over it without asking again
  const handleFolderReplace = useCallback(
    () => replaceFolderCopy(offeredRevision),
    [replaceFolderCopy, offeredRevision]
  );

  const handleConflictChoice = useCallback(
    async (choice: FolderConflictChoice) => {
      await resolveConflict(choice);
      if (choice === 'later') notifications.show(FOLDER_SYNC_PAUSED_NOTICE);
    },
    [resolveConflict]
  );

  const { decide: decideFolderRestore } = folderRestore;
  const handleFolderDecision = useCallback(
    (decision: FolderRestoreDecision) => {
      decideFolderRestore(decision);
      if (decision === 'hold') {
        notifications.show(FOLDER_SYNC_PAUSED_NOTICE);
      }
    },
    [decideFolderRestore]
  );

  return (
    <>
      <FolderRestoreModal
        prompt={folderRestore.prompt}
        onRestore={handleFolderRestore}
        onReplace={handleFolderReplace}
        onDecide={handleFolderDecision}
      />
      <FolderConflictModal conflict={folderConflict} onResolve={handleConflictChoice} />

      <MantineAppShell
        header={{ height: HEADER_HEIGHT }}
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
                  disabled={isSavingImport}
                  aria-disabled={isSavingImport || undefined}
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
              disabled={isSavingImport}
              aria-disabled={isSavingImport || undefined}
              aria-current={activeView === 'settings' ? 'page' : undefined}
            />
          </Stack>
        </MantineAppShell.Navbar>

        <MantineAppShell.Main>
          <SetAsideBanner
            total={setAsideRecords.summary.total}
            unsaved={setAsideRecords.summary.unsaved}
            folderStorageOn={folderStorageOn}
            onDownload={setAsideRecords.download}
            onConfirmSaved={setAsideRecords.confirmSaved}
            onSnapshot={setAsideRecords.snapshot}
            onDelete={setAsideRecords.remove}
          />
          {children ?? (
            <MainContent
              view={activeView}
              onImportComplete={handleImportComplete}
              onNavigateToImport={handleNavigateToImport}
              onNavigate={handleNavClick}
              focus={focus}
              visit={visit}
              onOpen={openView}
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
        setAsideCount={setAsideRecords.summary.total}
      />
    </>
  );
}

interface MainContentProps {
  view: AppView;
  /** Resolves once the save has settled; the wizard shows it saving until then */
  onImportComplete: (plan: SavePlan<ReviewedResult>) => Promise<void>;
  onNavigateToImport: () => void;
  onNavigate: (view: AppView) => void;
  focus: ViewFocus | null;
  /**
   * The views are keyed by it, so a new visit builds the open view anew.
   * When a move is a new visit is useNavigation's call: only a view in its
   * STARTS_FRESH is rebuilt when chosen while open.
   */
  visit: number;
  onOpen: (focus: ViewFocus) => void;
  onRestore: (data: ParsedBackupData, options: RestoreOptions) => Promise<void>;
  isRestoring: boolean;
}

function MainContent({
  view,
  onImportComplete,
  onNavigateToImport,
  onNavigate,
  focus,
  visit,
  onOpen,
  onRestore,
  isRestoring,
}: MainContentProps): React.ReactNode {
  const viewInfo = NAV_ITEMS.find((item) => item.view === view);
  const trendFocus = focus?.view === 'trends' ? focus : null;
  const timelineFocus = focus?.view === 'timeline' ? focus.labResultId : null;
  const dictionaryFocus = focus?.view === 'dictionary' ? focus.biomarkerKey : undefined;
  const onOpenTrend = (biomarkerKey: string, date?: Date, testValueId?: number): void =>
    onOpen({ view: 'trends', biomarkerKey, date, testValueId });
  const onOpenLabResult = (labResultId: number): void => onOpen({ view: 'timeline', labResultId });
  const onOpenReference = (biomarkerKey: string): void => onOpen({ view: 'dictionary', biomarkerKey });
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
        key={visit}
        onNavigateToImport={onNavigateToImport}
        focusLabResultId={timelineFocus ?? undefined}
        onOpenTrend={onOpenTrend}
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
        key={visit}
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
        key={visit}
        onNavigateToImport={onNavigateToImport}
        onNavigateToAlerts={() => onNavigate('alerts')}
        initialBiomarkerKey={trendFocus?.biomarkerKey}
        highlightDate={trendFocus?.date}
        highlightTestValueId={trendFocus?.testValueId}
        onOpenReference={onOpenReference}
      />
    );
  }

  if (view === 'alerts') {
    return <AlertsView key={visit} onOpenTrend={onOpenTrend} />;
  }

  if (view === 'notes') {
    return (
      <NotesView key={visit} onOpenLabResult={onOpenLabResult} onOpenTrend={onOpenTrend} />
    );
  }

  // Render SettingsPage for the settings view
  if (view === 'settings') {
    return <SettingsPage key={visit} onRestore={onRestore} isRestoring={isRestoring} />;
  }

  // Render BiomarkerDictionary for the dictionary view
  if (view === 'dictionary') {
    return (
      <DictionaryView
        key={visit}
        onOpenTrend={onOpenTrend}
        initialBiomarkerKey={dictionaryFocus}
      />
    );
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
