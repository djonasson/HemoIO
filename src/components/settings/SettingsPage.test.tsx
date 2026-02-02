/**
 * Tests for SettingsPage component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { SettingsPage } from './SettingsPage';

// Mock useExportData and useEncryptedDb hooks
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
    db: {
      getPreferences: vi.fn().mockResolvedValue(null),
      savePreferences: vi.fn().mockResolvedValue(1),
    },
    isReady: true,
  }),
}));

// Mock BIOMARKER_DEFINITIONS
vi.mock('@data/biomarkers', () => ({
  BIOMARKER_DEFINITIONS: [
    {
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
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('SettingsPage', () => {
  const defaultProps = {
    onRestore: vi.fn(),
    isRestoring: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('rendering', () => {
    it('should render the settings title', () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);

      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    });

    it('should render tab navigation', () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);

      expect(screen.getByRole('tab', { name: /data/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /ai configuration/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /display/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /personal targets/i })).toBeInTheDocument();
    });

    it('should show Data tab by default', () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);

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

      const aiTab = screen.getByRole('tab', { name: /ai configuration/i });
      await user.click(aiTab);

      expect(aiTab).toHaveAttribute('aria-selected', 'true');
      // Should show AISettings component - look for the title heading
      expect(screen.getByRole('heading', { name: 'AI Configuration', level: 4 })).toBeInTheDocument();
    });

    it('should switch to Display tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);

      const displayTab = screen.getByRole('tab', { name: /display/i });
      await user.click(displayTab);

      expect(displayTab).toHaveAttribute('aria-selected', 'true');
      // Should show DisplaySettings component
      expect(screen.getByText('Display Preferences')).toBeInTheDocument();
    });

    it('should switch to Personal Targets tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage {...defaultProps} />);

      const targetsTab = screen.getByRole('tab', { name: /personal targets/i });
      await user.click(targetsTab);

      expect(targetsTab).toHaveAttribute('aria-selected', 'true');
      // Should show PersonalTargets component
      expect(screen.getByText('Personal Target Ranges')).toBeInTheDocument();
    });
  });

  describe('backup restore integration', () => {
    it('should show BackupRestore component in Data tab', () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);

      expect(screen.getByText('Backup & Restore')).toBeInTheDocument();
      // Check for the button instead of text to avoid duplicate matches
      expect(screen.getByRole('button', { name: /create backup/i })).toBeInTheDocument();
      expect(screen.getByText('Restore from Backup')).toBeInTheDocument();
    });

    it('should pass isRestoring to BackupRestore', () => {
      renderWithProviders(<SettingsPage {...defaultProps} isRestoring={true} />);

      // Create Backup button should be disabled when restoring
      expect(screen.getByRole('button', { name: /create backup/i })).toBeDisabled();
    });
  });
});
