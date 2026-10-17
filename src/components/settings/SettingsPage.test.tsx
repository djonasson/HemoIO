/**
 * Tests for SettingsPage component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { testProviderConnection } from '@/services/ai';
import { SettingsPage } from './SettingsPage';

// The db mock must be stable across renders, as the real hook memoizes it;
// a new object per render would re-run SettingsPage's loading effects forever.
const mockDb = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  savePreferences: vi.fn(),
}));

// Per-test overrides for the AI hooks
const mockAI = vi.hoisted(() => ({
  hasApiKey: false,
  apiKey: null as string | null,
  aiProvider: 'openai' as 'openai' | 'anthropic' | 'ollama',
  anthropicModel: undefined as string | undefined,
}));

vi.mock('@/services/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/ai')>()),
  testProviderConnection: vi.fn(),
  getAnthropicModels: vi.fn().mockResolvedValue([]),
  getOpenAIModels: vi.fn().mockResolvedValue([]),
}));

// Mock hooks
vi.mock('@hooks', () => ({
  useExportData: () => ({
    dataSources: {
      labResults: [],
      testValues: [],
      userNotes: [],
      userPreferences: null,
      settings: null,
    },
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
  useEncryptedDb: () => ({
    db: mockDb,
    isReady: true,
  }),
  useEncryptedApiKey: () => ({
    isReady: true,
    hasApiKey: mockAI.hasApiKey,
    apiKeyLastFour: mockAI.apiKey?.slice(-4),
    isLoading: false,
    getApiKey: () => Promise.resolve(mockAI.apiKey),
    setApiKey: vi.fn().mockResolvedValue(undefined),
    removeApiKey: vi.fn(),
  }),
  useAISettings: () => ({
    aiProvider: mockAI.aiProvider,
    ollamaModel: undefined,
    openaiModel: undefined,
    anthropicModel: mockAI.anthropicModel,
    isLoading: false,
    setAiProvider: vi.fn(),
    setOllamaModel: vi.fn(),
    setOpenaiModel: vi.fn(),
    setAnthropicModel: vi.fn(),
  }),
}));

// Mock BIOMARKER_DEFINITIONS
vi.mock('@data/biomarkers', () => ({
  BIOMARKER_DEFINITIONS: [
    {
      key: 'glucose',
      name: 'Glucose',
      aliases: ['Blood Sugar'],
      category: 'metabolic',
      canonicalUnit: 'mg/dL',
      alternativeUnits: ['mmol/L'],
      defaultReferenceRange: { low: 70, high: 100, unit: 'mg/dL' },
      description: 'Blood glucose level',
    },
  ],
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider env="test">{ui}</MantineProvider>);
}

/**
 * SettingsPage loads display preferences and personal targets on mount;
 * wait for both loads so their state updates happen inside the test.
 */
async function waitForSettingsToLoad(): Promise<void> {
  await waitFor(() => {
    expect(mockDb.getPreferences).toHaveBeenCalledTimes(2);
  });
  await act(async () => {
    await Promise.all(mockDb.getPreferences.mock.results.map((r) => r.value));
  });
}

describe('SettingsPage', () => {
  const defaultProps = {
    onRestore: vi.fn(),
    isRestoring: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockDb.getPreferences.mockResolvedValue(null);
    mockDb.savePreferences.mockResolvedValue(1);
    Object.assign(mockAI, {
      hasApiKey: false,
      apiKey: null,
      aiProvider: 'openai',
      anthropicModel: undefined,
    });
  });

  describe('AI connection test', () => {
    it('tests the connection with the selected provider, key and model', async () => {
      Object.assign(mockAI, {
        hasApiKey: true,
        apiKey: 'sk-ant-test-key-1234',
        aiProvider: 'anthropic',
        anthropicModel: 'claude-chosen-by-user',
      });
      vi.mocked(testProviderConnection).mockResolvedValue(true);
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();

      await user.click(screen.getByRole('tab', { name: /ai configuration/i }));
      await user.click(screen.getByRole('button', { name: 'Test Connection' }));

      expect(await screen.findByText(/Connection successful/)).toBeInTheDocument();
      expect(testProviderConnection).toHaveBeenCalledWith('anthropic', {
        apiKey: 'sk-ant-test-key-1234',
        model: 'claude-chosen-by-user',
      });
    });

    it('reports failure when the provider rejects the connection', async () => {
      Object.assign(mockAI, {
        hasApiKey: true,
        apiKey: 'sk-ant-test-key-1234',
        aiProvider: 'anthropic',
        anthropicModel: 'claude-chosen-by-user',
      });
      vi.mocked(testProviderConnection).mockResolvedValue(false);
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();

      await user.click(screen.getByRole('tab', { name: /ai configuration/i }));
      await user.click(screen.getByRole('button', { name: 'Test Connection' }));

      expect(await screen.findByText(/Connection failed/)).toBeInTheDocument();
    });
  });

  describe('rendering', () => {
    it('should render the settings title', async () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();

      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    });

    it('should render tab navigation', async () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();

      expect(screen.getByRole('tab', { name: /data/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /ai configuration/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /display/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /personal targets/i })).toBeInTheDocument();
    });

    it('should show Data tab by default', async () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();

      // Data tab should be selected
      const dataTab = screen.getByRole('tab', { name: /data/i });
      expect(dataTab).toHaveAttribute('aria-selected', 'true');

      // BackupRestore component should be visible
      expect(screen.getByText('Backup & Restore')).toBeInTheDocument();
    });
  });

  describe('tab navigation', () => {
    it('should switch to AI Configuration tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();

      const aiTab = screen.getByRole('tab', { name: /ai configuration/i });
      await user.click(aiTab);

      expect(aiTab).toHaveAttribute('aria-selected', 'true');
      // Should show AISettings component - look for the title heading
      expect(screen.getByRole('heading', { name: 'AI Configuration', level: 4 })).toBeInTheDocument();
    });

    it('should switch to Display tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();

      const displayTab = screen.getByRole('tab', { name: /display/i });
      await user.click(displayTab);

      expect(displayTab).toHaveAttribute('aria-selected', 'true');
      // Should show DisplaySettings component
      expect(screen.getByText('Display Preferences')).toBeInTheDocument();
    });

    it('should switch to Personal Targets tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();

      const targetsTab = screen.getByRole('tab', { name: /personal targets/i });
      await user.click(targetsTab);

      expect(targetsTab).toHaveAttribute('aria-selected', 'true');
      // Should show PersonalTargets component
      expect(screen.getByText('Personal Target Ranges')).toBeInTheDocument();
    });
  });

  describe('backup restore integration', () => {
    it('should show BackupRestore component in Data tab', async () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();

      expect(screen.getByText('Backup & Restore')).toBeInTheDocument();
      // Check for the button instead of text to avoid duplicate matches
      expect(screen.getByRole('button', { name: /create backup/i })).toBeInTheDocument();
      expect(screen.getByText('Restore from Backup')).toBeInTheDocument();
    });

    it('should pass isRestoring to BackupRestore', async () => {
      renderWithProviders(<SettingsPage {...defaultProps} isRestoring={true} />);
      await waitForSettingsToLoad();

      // Create Backup button should be disabled when restoring
      expect(screen.getByRole('button', { name: /create backup/i })).toBeDisabled();
    });
  });
});
