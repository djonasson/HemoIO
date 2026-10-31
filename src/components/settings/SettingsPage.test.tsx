/**
 * Tests for SettingsPage component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { testProviderConnection } from '@/services/ai';
import { SettingsPage } from './SettingsPage';
import { SaveError } from '@data/db/saveError';

// The db mock must be stable across renders, as the real hook memoizes it;
// a new object per render would re-run SettingsPage's loading effects forever.
const mockDb = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  savePreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));

// Personal targets come from the shared preferences
const mockPreferences = vi.hoisted(() => ({
  unitPreferences: {},
  personalTargets: { glucose: { low: 70, high: 90 } } as Record<
    string,
    { low?: number; high?: number }
  >,
  isLoaded: true,
  setPreferredUnit: vi.fn(),
  setPersonalTarget: vi.fn(),
  reload: vi.fn(),
}));

const mockShowNotification = vi.hoisted(() => vi.fn());
vi.mock('@mantine/notifications', () => ({
  notifications: { show: (...args: unknown[]) => mockShowNotification(...args) },
}));

// Per-test overrides for the AI hooks
const mockAI = vi.hoisted(() => ({
  setAiProvider: vi.fn(),
  setApiKey: vi.fn(),
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
  usePreferences: () => mockPreferences,
  // Enter-to-submit is covered by the ChangePassword tests
  useFormKeyboardSubmit: () => ({ formRef: { current: null } }),
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
    setApiKey: mockAI.setApiKey,
    removeApiKey: vi.fn(),
  }),
  useAISettings: () => ({
    aiProvider: mockAI.aiProvider,
    ollamaModel: undefined,
    openaiModel: undefined,
    anthropicModel: mockAI.anthropicModel,
    isLoading: false,
    setAiProvider: mockAI.setAiProvider,
    setOllamaModel: vi.fn(),
    setOpenaiModel: vi.fn(),
    setAnthropicModel: vi.fn(),
  }),
}));

// The Security tab's form reads the auth context
vi.mock('@contexts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@contexts')>()),
  useAuth: () => ({ changePassword: vi.fn() }),
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
 * SettingsPage loads the display preferences on mount; wait for the load so
 * its state updates happen inside the test.
 */
async function waitForSettingsToLoad(): Promise<void> {
  await waitFor(() => {
    expect(mockDb.getPreferences).toHaveBeenCalledTimes(1);
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
    mockDb.updatePreferences.mockResolvedValue(undefined);
    mockPreferences.setPersonalTarget.mockResolvedValue(undefined);
    mockShowNotification.mockReset();
    mockAI.setAiProvider.mockResolvedValue(undefined);
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
    it('places the Security tab right after Data', async () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();

      const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
      expect(tabs.indexOf('Security')).toBe(tabs.indexOf('Data') + 1);
    });

    it('should switch to Security tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();

      const securityTab = screen.getByRole('tab', { name: 'Security' });
      await user.click(securityTab);

      expect(securityTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('heading', { name: 'Change password' })).toBeInTheDocument();
      expect(screen.getByLabelText('Current password')).toBeInTheDocument();
    });

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

  describe('preferences', () => {
    /** The changes an updatePreferences call would write */
    function lastUpdate(): unknown {
      const update = mockDb.updatePreferences.mock.calls.at(-1)?.[0] as (c: unknown) => unknown;
      return update(undefined);
    }

    it('shows personal targets from the shared preferences and saves through them', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();
      await user.click(screen.getByRole('tab', { name: /personal targets/i }));
      expect(await screen.findByText('70 - 90')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Set personal target for Glucose' }));
      await user.clear(screen.getByLabelText('Personal target high value'));
      await user.type(screen.getByLabelText('Personal target high value'), '95');
      await user.click(screen.getByRole('button', { name: 'Save Target' }));

      await waitFor(() =>
        expect(mockPreferences.setPersonalTarget).toHaveBeenCalledWith('glucose', {
          low: 70,
          high: 95,
        })
      );
    });

    it('tells the user a personal target was not saved, and does not claim it was', async () => {
      mockPreferences.setPersonalTarget.mockRejectedValueOnce(new SaveError('quota'));
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();
      await user.click(screen.getByRole('tab', { name: /personal targets/i }));
      await user.click(screen.getByRole('button', { name: 'Set personal target for Glucose' }));
      await user.clear(screen.getByLabelText('Personal target high value'));
      await user.type(screen.getByLabelText('Personal target high value'), '95');
      await user.click(screen.getByRole('button', { name: 'Save Target' }));

      await waitFor(() =>
        expect(mockShowNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Personal target not saved',
            message: expect.stringMatching(/no room left/),
            color: 'red',
          })
        )
      );
      expect(screen.queryByText('Personal target saved')).not.toBeInTheDocument();
    });

    it('confirms a personal target once it is saved', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();
      await user.click(screen.getByRole('tab', { name: /personal targets/i }));
      await user.click(screen.getByRole('button', { name: 'Clear personal target for Glucose' }));

      expect(await screen.findByText('Personal target saved')).toBeInTheDocument();
    });

    it('clears a personal target through the shared preferences', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();
      await user.click(screen.getByRole('tab', { name: /personal targets/i }));
      await user.click(screen.getByRole('button', { name: 'Clear personal target for Glucose' }));

      await waitFor(() =>
        expect(mockPreferences.setPersonalTarget).toHaveBeenCalledWith('glucose', null)
      );
    });

    it('saves only the theme when it changes', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();
      await user.click(screen.getByRole('tab', { name: /display/i }));
      await user.click(screen.getByText('Dark'));

      await waitFor(() => expect(mockDb.updatePreferences).toHaveBeenCalled());
      expect(lastUpdate()).toEqual({ theme: 'dark' });
      expect(mockDb.savePreferences).not.toHaveBeenCalled();
    });

    it.each([
      ['Theme', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByText('Dark'))],
      [
        'Date format',
        async (user: ReturnType<typeof userEvent.setup>) => {
          await user.click(screen.getByRole('textbox', { name: 'Select date format' }));
          await user.click(await screen.findByRole('option', { name: /YYYY-MM-DD \(ISO\)/ }));
        },
      ],
    ])('says why the %s was not saved, and shows the one stored', async (what, change) => {
      mockDb.updatePreferences.mockRejectedValueOnce(new SaveError('quota'));
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();
      await user.click(screen.getByRole('tab', { name: /display/i }));

      await change(user);

      await waitFor(() =>
        expect(mockShowNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: `${what} not saved`,
            message: expect.stringMatching(/no room left/),
            color: 'red',
          })
        )
      );
      expect(screen.getByRole('radio', { name: /system/i })).toBeChecked();
      expect(screen.getByRole('textbox', { name: 'Select date format' })).toHaveValue(
        'MM/DD/YYYY (US)'
      );
    });

    it.each(['Dark', 'Light'])(
      'keeps the colors in use when the theme %s is not saved',
      async (choice) => {
        // The stored theme (System by default) need not be the one in use
        localStorage.setItem('mantine-color-scheme-value', 'light');
        mockDb.updatePreferences.mockRejectedValueOnce(new SaveError('quota'));
        const user = userEvent.setup();
        renderWithProviders(<SettingsPage {...defaultProps} />);
        await waitForSettingsToLoad();
        await user.click(screen.getByRole('tab', { name: /display/i }));

        await user.click(screen.getByText(choice));

        await waitFor(() => expect(mockShowNotification).toHaveBeenCalled());
        await waitFor(() =>
          expect(screen.getByRole('radio', { name: /system/i })).toBeChecked()
        );
        expect(localStorage.getItem('mantine-color-scheme-value')).toBe('light');
      }
    );

    it('applies a saved theme without reading the stored one again', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();
      await user.click(screen.getByRole('tab', { name: /display/i }));

      await user.click(screen.getByText('Dark'));

      await waitFor(() => expect(localStorage.getItem('mantine-color-scheme-value')).toBe('dark'));
      expect(screen.getByRole('radio', { name: /dark/i })).toBeChecked();
      expect(mockDb.getPreferences).toHaveBeenCalledTimes(1);
    });

    it('goes back to the stored date format when overlapping changes all fail', async () => {
      const fails: Array<(err: unknown) => void> = [];
      mockDb.updatePreferences.mockImplementation(
        () => new Promise((_, reject) => fails.push(reject))
      );
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();
      await user.click(screen.getByRole('tab', { name: /display/i }));
      const select = screen.getByRole('textbox', { name: 'Select date format' });

      await user.click(select);
      await user.click(await screen.findByRole('option', { name: /DD\/MM\/YYYY/ }));
      await user.click(select);
      await user.click(await screen.findByRole('option', { name: /YYYY-MM-DD/ }));
      await waitFor(() => expect(fails).toHaveLength(2));
      act(() => fails.forEach((fail) => fail(new SaveError('timeout'))));

      await waitFor(() => expect(select).toHaveValue('MM/DD/YYYY (US)'));
    });

    it('says why an AI setting was not saved', async () => {
      mockAI.setAiProvider.mockRejectedValueOnce(new SaveError('closed'));
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();
      await user.click(screen.getByRole('tab', { name: /ai configuration/i }));

      await user.click(screen.getByRole('textbox', { name: /select ai provider/i }));
      await user.click(await screen.findByRole('option', { name: /Anthropic/ }));

      await waitFor(() =>
        expect(mockShowNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'AI setting not saved',
            message: expect.stringMatching(/Reload the page/),
            color: 'red',
          })
        )
      );
    });

    it('says why the API key was not saved', async () => {
      mockAI.setApiKey.mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();
      await user.click(screen.getByRole('tab', { name: /ai configuration/i }));

      await user.type(screen.getByPlaceholderText(/enter your.*api key/i), 'sk-test-key');
      await user.click(screen.getByRole('button', { name: /save api key/i }));

      await waitFor(() =>
        expect(mockShowNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'API key not saved',
            message: expect.stringMatching(/no room left/),
            color: 'red',
          })
        )
      );
    });

    it('moves display settings left in local storage into the database', async () => {
      localStorage.setItem('hemoio_theme', 'dark');
      localStorage.setItem('hemoio_date_format', 'YYYY-MM-DD');
      renderWithProviders(<SettingsPage {...defaultProps} />);
      await waitForSettingsToLoad();

      await waitFor(() => expect(mockDb.updatePreferences).toHaveBeenCalled());
      expect(lastUpdate()).toEqual({ theme: 'dark', dateFormat: 'YYYY-MM-DD' });
      expect(mockDb.savePreferences).not.toHaveBeenCalled();
    });
  });
});
