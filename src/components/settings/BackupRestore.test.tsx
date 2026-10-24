/**
 * Tests for BackupRestore component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { BackupRestore } from './BackupRestore';
import { exportToEncryptedJson, type ExportDataSources } from '@services/export';
import type { Settings } from '@/types';

vi.mock('@services/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/export')>()),
  exportToEncryptedJson: vi.fn().mockResolvedValue('{}'),
  downloadEncryptedBackup: vi.fn(),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider env="test">{ui}</MantineProvider>);
}

function createMockDataSources(isEmpty = false): ExportDataSources {
  if (isEmpty) {
    return {
      labResults: [],
      testValues: [],
      userNotes: [],
      userPreferences: null,
      settings: null,
    };
  }

  return {
    labResults: [
      {
        id: 1,
        date: new Date('2024-01-15'),
        labName: 'Quest Diagnostics',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        date: new Date('2024-03-20'),
        labName: 'LabCorp',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    testValues: [
      {
        id: 1,
        labResultId: 1,
        biomarkerKey: 'marker-1',
        value: 95,
        unit: 'mg/dL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    userNotes: [
      {
        id: 1,
        content: 'Test note',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    userPreferences: null,
    settings: null,
  };
}

describe('BackupRestore', () => {
  const defaultProps = {
    dataSources: createMockDataSources(),
    onRestore: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render main title', () => {
      renderWithProviders(<BackupRestore {...defaultProps} />);

      expect(screen.getByText('Backup & Restore')).toBeInTheDocument();
    });

    it('should render section headers', () => {
      renderWithProviders(<BackupRestore {...defaultProps} />);

      expect(screen.getByText('Restore from Backup')).toBeInTheDocument();
    });

    it('should show data stats', () => {
      renderWithProviders(<BackupRestore {...defaultProps} />);

      expect(screen.getByText(/2 lab results/)).toBeInTheDocument();
      expect(screen.getByText(/1 test value/)).toBeInTheDocument();
      expect(screen.getByText(/1 note/)).toBeInTheDocument();
    });

    it('should show create backup button', () => {
      renderWithProviders(<BackupRestore {...defaultProps} />);

      expect(screen.getByRole('button', { name: /create backup/i })).toBeInTheDocument();
    });

    it('should show file input for restore', () => {
      renderWithProviders(<BackupRestore {...defaultProps} />);

      expect(screen.getByLabelText(/select backup file to restore/i)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show warning when no data', () => {
      const props = {
        ...defaultProps,
        dataSources: createMockDataSources(true),
      };

      renderWithProviders(<BackupRestore {...props} />);

      expect(screen.getByText(/don't have any data to backup/i)).toBeInTheDocument();
    });

    it('should disable create backup button when no data', () => {
      const props = {
        ...defaultProps,
        dataSources: createMockDataSources(true),
      };

      renderWithProviders(<BackupRestore {...props} />);

      expect(screen.getByRole('button', { name: /create backup/i })).toBeDisabled();
    });
  });

  describe('create backup button', () => {
    it('should be enabled when data exists', () => {
      renderWithProviders(<BackupRestore {...defaultProps} />);

      expect(screen.getByRole('button', { name: /create backup/i })).not.toBeDisabled();
    });
  });

  describe('processing state', () => {
    it('should disable buttons when processing', () => {
      renderWithProviders(<BackupRestore {...defaultProps} isProcessing />);

      expect(screen.getByRole('button', { name: /create backup/i })).toBeDisabled();
    });
  });

  describe('encrypted backup', () => {
    it('includes the API key, which only encrypted backups may contain', async () => {
      const user = userEvent.setup();
      const settings = { storageProvider: 'local', aiProvider: 'anthropic', language: 'en' } as Settings;
      const getApiKey = vi.fn().mockResolvedValue('sk-ant-secret-1234');
      renderWithProviders(
        <BackupRestore
          {...defaultProps}
          dataSources={{ ...createMockDataSources(), settings }}
          getApiKey={getApiKey}
        />
      );

      await user.click(screen.getByText('Encrypted', { exact: true }));
      await user.click(screen.getByRole('button', { name: 'Create Encrypted Backup' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/^Backup Password/), 'Str0ng!Backup#Pass');
      await user.type(within(dialog).getByLabelText(/^Confirm Password/), 'Str0ng!Backup#Pass');
      await user.click(within(dialog).getByRole('button', { name: 'Create Encrypted Backup' }));

      await waitFor(() => expect(exportToEncryptedJson).toHaveBeenCalled());
      const [sources] = vi.mocked(exportToEncryptedJson).mock.calls[0];
      expect(sources.settings).toMatchObject({ aiProvider: 'anthropic', aiApiKey: 'sk-ant-secret-1234' });
    });
  });

  describe('restoring AI configuration', () => {
    function backupFileWithAISettings(): File {
      const backup = {
        schemaVersion: 2,
        exportedAt: '2024-03-01T00:00:00.000Z',
        appVersion: '1.0.0',
        labResults: [],
        testValues: [],
        userNotes: [],
        userPreferences: null,
        settings: { storageProvider: 'local', aiProvider: 'anthropic', anthropicModel: 'claude-x', language: 'en' },
      };
      return new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    }

    async function openRestoreDialog(
      hasApiKey: boolean,
      onRestore = vi.fn().mockResolvedValue(undefined),
      hasAIConfiguration = hasApiKey
    ) {
      const user = userEvent.setup();
      renderWithProviders(
        <BackupRestore
          {...defaultProps}
          onRestore={onRestore}
          hasApiKey={hasApiKey}
          hasAIConfiguration={hasAIConfiguration}
        />
      );
      await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, backupFileWithAISettings());
      const dialog = await screen.findByRole('dialog', { name: 'Restore from Backup' });
      return { user, dialog, onRestore };
    }

    it('shows what the backup would change in the AI configuration', async () => {
      const { dialog } = await openRestoreDialog(false);

      expect(within(dialog).getByText(/anthropic/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/claude-x/)).toBeInTheDocument();
    });

    it('restores the AI configuration by default when none is set up yet', async () => {
      const { user, dialog, onRestore } = await openRestoreDialog(false);

      expect(within(dialog).getByRole('checkbox', { name: /restore AI configuration/i })).toBeChecked();
      await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

      await waitFor(() =>
        expect(onRestore).toHaveBeenCalledWith(expect.anything(), { restoreAISettings: true })
      );
    });

    it('keeps a local Ollama setup, which has no API key, unless the user opts in', async () => {
      const { dialog } = await openRestoreDialog(false, undefined, true);

      const option = within(dialog).getByRole('checkbox', { name: /restore AI configuration/i });
      expect(option).not.toBeChecked();
      expect(
        within(dialog).getByText(/Your current AI provider and model will be replaced/)
      ).toBeInTheDocument();
    });

    it('does not say the API key will be replaced when the backup has none', async () => {
      const { dialog } = await openRestoreDialog(true);

      expect(within(dialog).queryByText(/API key will be replaced/)).not.toBeInTheDocument();
    });

    it('keeps an existing AI configuration unless the user opts in', async () => {
      const { user, dialog, onRestore } = await openRestoreDialog(true);

      expect(within(dialog).getByRole('checkbox', { name: /restore AI configuration/i })).not.toBeChecked();
      await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

      await waitFor(() =>
        expect(onRestore).toHaveBeenCalledWith(expect.anything(), { restoreAISettings: false })
      );
    });
  });
});
